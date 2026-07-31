import Foundation
import XCTest

@testable import InterviewCopilotAudioBoundary

private final class MemorySink: AudioFrameSink, @unchecked Sendable {
  func write(source: AudioSource, timestampNanos: UInt64, bytes: Data) throws {}
}

private final class FixtureSession: AudioSourceSession, @unchecked Sendable {
  let format = AudioFormat(sampleRate: 16_000, channels: 1)
  private(set) var starts = 0
  private(set) var pauses = 0
  private(set) var stops = 0

  func start() async throws { starts += 1 }
  func pause() async throws { pauses += 1 }
  func stop() async { stops += 1 }
}

private final class LockedCounter: @unchecked Sendable {
  private let lock = NSLock()
  private var value = 0

  func increment() {
    lock.lock()
    value += 1
    lock.unlock()
  }

  func current() -> Int {
    lock.lock()
    defer { lock.unlock() }
    return value
  }
}

final class CaptureCoordinatorTests: XCTestCase {
  func testDoesNotConstructASourceBeforeExplicitStart() async throws {
    let constructionCount = LockedCounter()
    let fixture = FixtureSession()
    let coordinator = CaptureCoordinator(sink: MemorySink()) { _, _ in
      constructionCount.increment()
      return fixture
    }

    XCTAssertEqual(constructionCount.current(), 0)
    let format = try await coordinator.start(.microphone)
    XCTAssertEqual(format, AudioFormat(sampleRate: 16_000, channels: 1))
    XCTAssertEqual(constructionCount.current(), 1)
    XCTAssertEqual(fixture.starts, 1)

    try await coordinator.pause(.microphone)
    XCTAssertEqual(fixture.pauses, 1)
    try await coordinator.stop(.microphone)
    XCTAssertEqual(fixture.stops, 1)
  }

  func testKeepsSourcesIndependentAndReleasesBothOnShutdown() async throws {
    let microphone = FixtureSession()
    let system = FixtureSession()
    let coordinator = CaptureCoordinator(sink: MemorySink()) { source, _ in
      source == .microphone ? microphone : system
    }

    _ = try await coordinator.start(.microphone)
    _ = try await coordinator.start(.system)
    try await coordinator.pause(.microphone)
    XCTAssertEqual(microphone.pauses, 1)
    XCTAssertEqual(system.pauses, 0)

    await coordinator.shutdown()
    XCTAssertEqual(microphone.stops, 1)
    XCTAssertEqual(system.stops, 1)
  }
}
