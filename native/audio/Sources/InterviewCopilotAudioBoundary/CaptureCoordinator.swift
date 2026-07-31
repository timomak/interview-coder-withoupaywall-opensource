import Foundation

public actor CaptureCoordinator {
  private enum State {
    case capturing
    case paused
  }

  private let sink: any AudioFrameSink
  private let factory: AudioSourceFactory
  private var sessions: [AudioSource: any AudioSourceSession] = [:]
  private var states: [AudioSource: State] = [:]

  public init(sink: any AudioFrameSink, factory: @escaping AudioSourceFactory) {
    self.sink = sink
    self.factory = factory
  }

  public func start(_ source: AudioSource) async throws -> AudioFormat {
    if states[source] == .capturing {
      throw AudioBoundaryError.invalidTransition
    }
    if let session = sessions[source] {
      try await session.start()
      states[source] = .capturing
      return session.format
    }
    // The native source is deliberately constructed only in response to an
    // explicit start command. Coordinator creation and app/session resume
    // therefore cannot open a device or trigger a permission prompt.
    let session = try factory(source, sink)
    do {
      try await session.start()
    } catch {
      await session.stop()
      throw error
    }
    sessions[source] = session
    states[source] = .capturing
    return session.format
  }

  public func pause(_ source: AudioSource) async throws {
    guard states[source] == .capturing, let session = sessions[source] else {
      throw AudioBoundaryError.invalidTransition
    }
    try await session.pause()
    states[source] = .paused
  }

  public func stop(_ source: AudioSource) async throws {
    guard let session = sessions.removeValue(forKey: source) else {
      throw AudioBoundaryError.invalidTransition
    }
    states.removeValue(forKey: source)
    await session.stop()
  }

  public func shutdown() async {
    let active = sessions
    sessions.removeAll()
    states.removeAll()
    for session in active.values {
      await session.stop()
    }
  }
}
