import Darwin
import Foundation
import InterviewCopilotAudioBoundary
@preconcurrency import Speech

private let recognitionTimeoutNanos: UInt64 = 90_000_000_000

private final class RecognitionOperation: @unchecked Sendable {
  private let lock = NSLock()
  private var continuation: CheckedContinuation<String, Error>?
  private var task: SFSpeechRecognitionTask?
  private var finished = false

  func run(recognizer: SFSpeechRecognizer, file: URL) async throws -> String {
    try await withTaskCancellationHandler {
      try await withCheckedThrowingContinuation { continuation in
        lock.lock()
        if finished {
          lock.unlock()
          continuation.resume(throwing: CancellationError())
          return
        }
        self.continuation = continuation
        lock.unlock()

        let request = SFSpeechURLRecognitionRequest(url: file)
        request.shouldReportPartialResults = false
        request.taskHint = .dictation
        if #available(macOS 13.0, *) {
          request.addsPunctuation = true
        }
        let created = recognizer.recognitionTask(with: request) { [weak self] result, error in
          if let error {
            self?.finish(.failure(error))
            return
          }
          guard let result, result.isFinal else { return }
          self?.finish(.success(result.bestTranscription.formattedString))
        }
        lock.lock()
        if finished {
          lock.unlock()
          created.cancel()
        } else {
          task = created
          lock.unlock()
        }
      }
    } onCancel: {
      cancel()
    }
  }

  func cancel() {
    finish(.failure(CancellationError()))
  }

  private func finish(_ result: Result<String, Error>) {
    lock.lock()
    guard !finished else {
      lock.unlock()
      return
    }
    finished = true
    let pending = continuation
    continuation = nil
    let activeTask = task
    task = nil
    lock.unlock()
    activeTask?.cancel()
    pending?.resume(with: result)
  }
}

private func requestAuthorization() async -> SFSpeechRecognizerAuthorizationStatus {
  let current = SFSpeechRecognizer.authorizationStatus()
  guard current == .notDetermined else { return current }
  return await withCheckedContinuation { continuation in
    SFSpeechRecognizer.requestAuthorization { status in
      continuation.resume(returning: status)
    }
  }
}

private func transcribe(file: URL) async throws -> String {
  guard await requestAuthorization() == .authorized else {
    throw AppleSpeechBoundaryError.permissionDenied
  }
  guard
    let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-US")),
    recognizer.isAvailable
  else {
    throw AppleSpeechBoundaryError.recognizerUnavailable
  }
  let operation = RecognitionOperation()
  return try await withThrowingTaskGroup(of: String.self) { group in
    group.addTask {
      try await operation.run(recognizer: recognizer, file: file)
    }
    group.addTask {
      try await Task.sleep(nanoseconds: recognitionTimeoutNanos)
      throw AppleSpeechBoundaryError.recognitionFailed
    }
    defer {
      operation.cancel()
      group.cancelAll()
    }
    guard let first = try await group.next() else {
      throw AppleSpeechBoundaryError.recognitionFailed
    }
    return first
  }
}

@main
struct InterviewCopilotAppleSpeech {
  static func main() async {
    signal(SIGPIPE, SIG_IGN)
    signal(SIGTERM, SIG_IGN)
    let termination = DispatchSource.makeSignalSource(signal: SIGTERM)
    termination.setEventHandler {
      // Recognition owns no persistent output. A bounded supervisor stop exits
      // silently and leaves the caller-owned ephemeral WAV for caller cleanup.
      Darwin.exit(143)
    }
    termination.resume()
    do {
      let invocation = try AppleSpeechInvocation(
        arguments: Array(CommandLine.arguments.dropFirst())
      )
      try invocation.validateInput()
      let text = try await transcribe(file: invocation.file)
      let line = try AppleSpeechResult(text: text).encodedLine()
      try FileHandle.standardOutput.write(contentsOf: line)
      termination.cancel()
      Darwin.exit(0)
    } catch {
      // stdout is reserved for one bounded result line. Raw audio, transcript
      // text, file names, and diagnostic details never enter stderr.
      termination.cancel()
      Darwin.exit(2)
    }
  }
}
