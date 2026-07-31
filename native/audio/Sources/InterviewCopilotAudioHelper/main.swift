import Darwin
import Foundation
import InterviewCopilotAudioBoundary

private struct HelperEvent: Encodable {
  let protocolVersion = audioHelperProtocolVersion
  let type: String
  let source: AudioSource?
  let sampleRate: Int?
  let channels: Int?
  let sampleFormat: String?
  let code: String?

  init(
    type: String,
    source: AudioSource? = nil,
    format: AudioFormat? = nil,
    code: String? = nil
  ) {
    self.type = type
    self.source = source
    self.sampleRate = format?.sampleRate
    self.channels = format?.channels
    self.sampleFormat = format?.sampleFormat
    self.code = code
  }

  enum CodingKeys: String, CodingKey {
    case protocolVersion, type, source, sampleRate, channels, sampleFormat, code
  }

  func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(protocolVersion, forKey: .protocolVersion)
    try container.encode(type, forKey: .type)
    try container.encodeIfPresent(source, forKey: .source)
    try container.encodeIfPresent(sampleRate, forKey: .sampleRate)
    try container.encodeIfPresent(channels, forKey: .channels)
    try container.encodeIfPresent(sampleFormat, forKey: .sampleFormat)
    try container.encodeIfPresent(code, forKey: .code)
  }
}

private actor EventWriter {
  private let encoder = JSONEncoder()

  func send(_ event: HelperEvent) {
    guard let data = try? encoder.encode(event) else { return }
    FileHandle.standardOutput.write(data)
    FileHandle.standardOutput.write(Data([0x0A]))
  }
}

private func decodeCommand(_ data: Data) -> AudioHelperCommand? {
  guard
    let object = try? JSONSerialization.jsonObject(with: data),
    let dictionary = object as? [String: Any],
    let command = try? JSONDecoder().decode(AudioHelperCommand.self, from: data),
    (try? command.validate()) != nil
  else { return nil }
  let expectedKeys: Set<String>
  switch command.type {
  case .start, .pause, .stop:
    expectedKeys = ["protocolVersion", "type", "source"]
  case .shutdown:
    expectedKeys = ["protocolVersion", "type"]
  }
  guard Set(dictionary.keys) == expectedKeys else { return nil }
  return command
}

@main
struct InterviewCopilotAudioHelper {
  static func main() async {
    let configuredDescriptor =
      ProcessInfo.processInfo.environment["INTERVIEWCOPILOT_AUDIO_FRAME_FD"] ?? "3"
    guard configuredDescriptor == "3" else { Darwin.exit(2) }
    let sink = FileDescriptorFrameWriter(descriptor: 3)
    let events = EventWriter()
    let coordinator = CaptureCoordinator(sink: sink) { source, sink in
      switch source {
      case .microphone:
        return MicrophoneCaptureSession(sink: sink)
      case .system:
        return SystemAudioCaptureSession(sink: sink) { source, _ in
          Task {
            await events.send(
              HelperEvent(type: "error", source: source, code: "NATIVE_STREAM_FAILED")
            )
          }
        }
      }
    }
    await events.send(HelperEvent(type: "ready"))

    while let line = readLine(strippingNewline: true) {
      guard
        line.utf8.count <= 16_384,
        let data = line.data(using: .utf8),
        let command = decodeCommand(data)
      else {
        await coordinator.shutdown()
        Darwin.exit(2)
      }
      switch command.type {
      case .start:
        guard let source = command.source else { continue }
        do {
          let format = try await coordinator.start(source)
          await events.send(
            HelperEvent(type: "started", source: source, format: format)
          )
        } catch AudioBoundaryError.permissionDenied {
          await events.send(
            HelperEvent(
              type: "permission-denied",
              source: source,
              code: "PERMISSION_DENIED"
            )
          )
        } catch {
          await events.send(
            HelperEvent(type: "error", source: source, code: "NATIVE_START_FAILED")
          )
        }
      case .pause:
        guard let source = command.source else { continue }
        do {
          try await coordinator.pause(source)
          await events.send(HelperEvent(type: "paused", source: source))
        } catch {
          await events.send(
            HelperEvent(type: "error", source: source, code: "INVALID_TRANSITION")
          )
        }
      case .stop:
        guard let source = command.source else { continue }
        do {
          try await coordinator.stop(source)
          await events.send(HelperEvent(type: "stopped", source: source))
        } catch {
          await events.send(
            HelperEvent(type: "error", source: source, code: "INVALID_TRANSITION")
          )
        }
      case .shutdown:
        await coordinator.shutdown()
        await events.send(HelperEvent(type: "shutdown-complete"))
        return
      }
    }
    await coordinator.shutdown()
  }
}
