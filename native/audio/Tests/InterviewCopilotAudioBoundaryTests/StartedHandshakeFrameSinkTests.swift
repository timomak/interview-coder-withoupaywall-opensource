import Foundation
import XCTest

@testable import InterviewCopilotAudioBoundary

private final class RecordingSink: AudioFrameSink, @unchecked Sendable {
  private let lock = NSLock()
  private var sources: [AudioSource] = []

  func write(source: AudioSource, timestampNanos: UInt64, bytes: Data) throws {
    lock.lock()
    sources.append(source)
    lock.unlock()
  }

  func recorded() -> [AudioSource] {
    lock.lock()
    defer { lock.unlock() }
    return sources
  }
}

final class StartedHandshakeFrameSinkTests: XCTestCase {
  func testDropsFramesUntilEachSourceStartedHandshakeIsAdmitted() throws {
    let downstream = RecordingSink()
    let sink = StartedHandshakeFrameSink(downstream: downstream)

    try sink.write(source: .microphone, timestampNanos: 1, bytes: Data([1]))
    try sink.write(source: .system, timestampNanos: 2, bytes: Data([2]))
    XCTAssertEqual(downstream.recorded(), [])

    sink.admit(.microphone)
    try sink.write(source: .microphone, timestampNanos: 3, bytes: Data([3]))
    try sink.write(source: .system, timestampNanos: 4, bytes: Data([4]))
    XCTAssertEqual(downstream.recorded(), [.microphone])

    sink.close(.microphone)
    try sink.write(source: .microphone, timestampNanos: 5, bytes: Data([5]))
    XCTAssertEqual(downstream.recorded(), [.microphone])
  }
}
