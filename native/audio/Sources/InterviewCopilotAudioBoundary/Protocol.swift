import Foundation

public let audioHelperProtocolVersion = 1

public enum AudioSource: String, Codable, CaseIterable, Sendable {
  case microphone
  case system
}

public enum AudioCommandType: String, Codable, Sendable {
  case start
  case pause
  case stop
  case shutdown
}

public struct AudioHelperCommand: Codable, Sendable {
  public let protocolVersion: Int
  public let type: AudioCommandType
  public let source: AudioSource?

  public init(protocolVersion: Int, type: AudioCommandType, source: AudioSource?) {
    self.protocolVersion = protocolVersion
    self.type = type
    self.source = source
  }

  public func validate() throws {
    guard protocolVersion == audioHelperProtocolVersion else {
      throw AudioBoundaryError.invalidCommand
    }
    switch type {
    case .start, .pause, .stop:
      guard source != nil else { throw AudioBoundaryError.invalidCommand }
    case .shutdown:
      guard source == nil else { throw AudioBoundaryError.invalidCommand }
    }
  }
}

public struct AudioFormat: Equatable, Sendable {
  public let sampleRate: Int
  public let channels: Int
  public let sampleFormat: String

  public init(sampleRate: Int, channels: Int, sampleFormat: String = "f32le") {
    self.sampleRate = sampleRate
    self.channels = channels
    self.sampleFormat = sampleFormat
  }
}

public enum AudioBoundaryError: Error, Equatable, Sendable {
  case invalidCommand
  case invalidTransition
  case permissionDenied
  case unsupportedFormat
  case nativeFailure
}

public protocol AudioFrameSink: Sendable {
  func write(source: AudioSource, timestampNanos: UInt64, bytes: Data) throws
}

public protocol AudioSourceSession: AnyObject, Sendable {
  var format: AudioFormat { get }
  func start() async throws
  func pause() async throws
  func stop() async
}

public typealias AudioSourceFactory =
  @Sendable (AudioSource, any AudioFrameSink) throws -> any AudioSourceSession
