import Darwin
import Foundation

public let appleSpeechMaximumInputBytes: Int64 = 32 * 1_024 * 1_024
public let appleSpeechMaximumTranscriptBytes = 256 * 1_024

public enum AppleSpeechBoundaryError: Error, Equatable, Sendable {
  case invalidInvocation
  case invalidInput
  case permissionDenied
  case recognizerUnavailable
  case recognitionFailed
  case transcriptTooLarge
}

public struct AppleSpeechInvocation: Equatable, Sendable {
  public let file: URL

  public init(arguments: [String]) throws {
    guard
      arguments.count == 2,
      arguments[0] == "--file",
      !arguments[1].isEmpty,
      arguments[1].utf8.count <= Int(PATH_MAX),
      arguments[1].hasPrefix("/")
    else {
      throw AppleSpeechBoundaryError.invalidInvocation
    }
    file = URL(fileURLWithPath: arguments[1]).standardizedFileURL
  }

  public func validateInput() throws {
    var metadata = stat()
    guard lstat(file.path, &metadata) == 0 else {
      throw AppleSpeechBoundaryError.invalidInput
    }
    guard
      (metadata.st_mode & S_IFMT) == S_IFREG,
      (metadata.st_mode & 0o077) == 0,
      metadata.st_uid == geteuid(),
      metadata.st_size >= 44,
      metadata.st_size <= appleSpeechMaximumInputBytes,
      file.pathExtension.lowercased() == "wav"
    else {
      throw AppleSpeechBoundaryError.invalidInput
    }
  }
}

public struct AppleSpeechResult: Codable, Equatable, Sendable {
  public let schemaVersion: Int
  public let text: String

  public init(text: String) throws {
    let normalized = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !normalized.isEmpty else {
      throw AppleSpeechBoundaryError.recognitionFailed
    }
    guard normalized.utf8.count <= appleSpeechMaximumTranscriptBytes else {
      throw AppleSpeechBoundaryError.transcriptTooLarge
    }
    schemaVersion = 1
    self.text = normalized
  }

  public func encodedLine() throws -> Data {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys]
    var data = try encoder.encode(self)
    guard data.count <= appleSpeechMaximumTranscriptBytes + 1_024 else {
      throw AppleSpeechBoundaryError.transcriptTooLarge
    }
    data.append(0x0A)
    return data
  }
}
