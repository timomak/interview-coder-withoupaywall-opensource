@preconcurrency import AVFoundation
import AudioToolbox
@preconcurrency import CoreGraphics
@preconcurrency import CoreMedia
import Foundation
@preconcurrency import ScreenCaptureKit

private func hostTimeNanos(_ hostTime: UInt64) -> UInt64 {
  AudioConvertHostTimeToNanos(hostTime)
}

public final class MicrophoneCaptureSession: AudioSourceSession, @unchecked Sendable {
  public private(set) var format = AudioFormat(sampleRate: 48_000, channels: 1)

  private let sink: any AudioFrameSink
  private let engine = AVAudioEngine()
  private let lock = NSLock()
  private var tapInstalled = false

  public init(sink: any AudioFrameSink) {
    self.sink = sink
  }

  public func start() async throws {
    let authorization = AVCaptureDevice.authorizationStatus(for: .audio)
    if authorization == .denied || authorization == .restricted {
      throw AudioBoundaryError.permissionDenied
    }
    if authorization == .notDetermined {
      let granted = await AVCaptureDevice.requestAccess(for: .audio)
      guard granted else { throw AudioBoundaryError.permissionDenied }
    }
    if engine.isRunning { throw AudioBoundaryError.invalidTransition }
    if !tapInstalled {
      let input = engine.inputNode
      let inputFormat = input.outputFormat(forBus: 0)
      guard
        inputFormat.commonFormat == .pcmFormatFloat32,
        !inputFormat.isInterleaved
      else {
        throw AudioBoundaryError.unsupportedFormat
      }
      format = AudioFormat(
        sampleRate: Int(inputFormat.sampleRate.rounded()),
        channels: 1
      )
      input.installTap(
        onBus: 0,
        bufferSize: 4_096,
        format: inputFormat
      ) { [weak self] buffer, time in
        self?.emit(buffer: buffer, timestampNanos: hostTimeNanos(time.hostTime))
      }
      tapInstalled = true
    }
    engine.prepare()
    do {
      try engine.start()
    } catch {
      throw AudioBoundaryError.nativeFailure
    }
  }

  public func pause() async throws {
    guard engine.isRunning else { throw AudioBoundaryError.invalidTransition }
    engine.pause()
  }

  public func stop() async {
    engine.stop()
    if tapInstalled {
      engine.inputNode.removeTap(onBus: 0)
      tapInstalled = false
    }
  }

  private func emit(buffer: AVAudioPCMBuffer, timestampNanos: UInt64) {
    lock.lock()
    defer { lock.unlock() }
    guard
      let channels = buffer.floatChannelData,
      buffer.frameLength > 0
    else { return }
    let frameCount = Int(buffer.frameLength)
    let channelCount = max(1, Int(buffer.format.channelCount))
    var mono = [Float](repeating: 0, count: frameCount)
    for channel in 0..<channelCount {
      for frame in 0..<frameCount {
        mono[frame] += channels[channel][frame] / Float(channelCount)
      }
    }
    var bytes = mono.withUnsafeBytes { Data($0) }
    defer { bytes.resetBytes(in: 0..<bytes.count) }
    try? sink.write(
      source: .microphone,
      timestampNanos: timestampNanos,
      bytes: bytes
    )
    _ = mono.withUnsafeMutableBytes {
      $0.initializeMemory(as: UInt8.self, repeating: 0)
    }
  }
}

public final class SystemAudioCaptureSession:
  NSObject,
  AudioSourceSession,
  SCStreamOutput,
  SCStreamDelegate,
  @unchecked Sendable
{
  public let format = AudioFormat(sampleRate: 16_000, channels: 1)

  private let sink: any AudioFrameSink
  private let onError: @Sendable (AudioSource, AudioBoundaryError) -> Void
  private let queue = DispatchQueue(label: "dev.interviewcopilot.audio.system")
  private var stream: SCStream?

  public init(
    sink: any AudioFrameSink,
    onError: @escaping @Sendable (AudioSource, AudioBoundaryError) -> Void = { _, _ in }
  ) {
    self.sink = sink
    self.onError = onError
  }

  public func start() async throws {
    if let stream {
      do {
        try await stream.startCapture()
        return
      } catch {
        throw AudioBoundaryError.nativeFailure
      }
    }
    guard CGPreflightScreenCaptureAccess() || CGRequestScreenCaptureAccess() else {
      throw AudioBoundaryError.permissionDenied
    }
    do {
      let content = try await SCShareableContent.excludingDesktopWindows(
        false,
        onScreenWindowsOnly: false
      )
      guard let display = content.displays.first else {
        throw AudioBoundaryError.nativeFailure
      }
      let filter = SCContentFilter(
        display: display,
        excludingApplications: [],
        exceptingWindows: []
      )
      let configuration = SCStreamConfiguration()
      configuration.width = 2
      configuration.height = 2
      configuration.showsCursor = false
      configuration.capturesAudio = true
      configuration.excludesCurrentProcessAudio = true
      configuration.sampleRate = format.sampleRate
      configuration.channelCount = format.channels
      let created = SCStream(
        filter: filter,
        configuration: configuration,
        delegate: self
      )
      try created.addStreamOutput(self, type: .audio, sampleHandlerQueue: queue)
      try await created.startCapture()
      stream = created
    } catch let error as AudioBoundaryError {
      throw error
    } catch {
      throw AudioBoundaryError.nativeFailure
    }
  }

  public func pause() async throws {
    guard let stream else { throw AudioBoundaryError.invalidTransition }
    do {
      try await stream.stopCapture()
    } catch {
      throw AudioBoundaryError.nativeFailure
    }
  }

  public func stop() async {
    guard let stream else { return }
    try? await stream.stopCapture()
    try? stream.removeStreamOutput(self, type: .audio)
    self.stream = nil
  }

  public func stream(
    _ stream: SCStream,
    didOutputSampleBuffer sampleBuffer: CMSampleBuffer,
    of outputType: SCStreamOutputType
  ) {
    guard outputType == .audio, sampleBuffer.isValid else { return }
    guard
      let description = sampleBuffer.formatDescription,
      let streamDescription = CMAudioFormatDescriptionGetStreamBasicDescription(
        description
      )
    else { return }
    let audioDescription = streamDescription.pointee
    guard
      audioDescription.mFormatID == kAudioFormatLinearPCM,
      audioDescription.mFormatFlags & kAudioFormatFlagIsFloat != 0,
      audioDescription.mFormatFlags & kAudioFormatFlagIsBigEndian == 0,
      audioDescription.mBitsPerChannel == 32,
      audioDescription.mChannelsPerFrame == 1
    else { return }
    var retainedBlockBuffer: CMBlockBuffer?
    var list = AudioBufferList()
    let status = CMSampleBufferGetAudioBufferListWithRetainedBlockBuffer(
      sampleBuffer,
      bufferListSizeNeededOut: nil,
      bufferListOut: &list,
      bufferListSize: MemoryLayout<AudioBufferList>.size,
      blockBufferAllocator: nil,
      blockBufferMemoryAllocator: nil,
      flags: 0,
      blockBufferOut: &retainedBlockBuffer
    )
    guard
      status == noErr,
      let pointer = list.mBuffers.mData,
      list.mBuffers.mDataByteSize > 0
    else { return }
    var bytes = Data(
      bytes: pointer,
      count: Int(list.mBuffers.mDataByteSize)
    )
    defer { bytes.resetBytes(in: 0..<bytes.count) }
    let timestamp = sampleBuffer.presentationTimeStamp
    let nanos = UInt64(max(0, CMTimeGetSeconds(timestamp)) * 1_000_000_000)
    try? sink.write(source: .system, timestampNanos: nanos, bytes: bytes)
  }

  public func stream(_ stream: SCStream, didStopWithError error: Error) {
    onError(.system, .nativeFailure)
  }
}
