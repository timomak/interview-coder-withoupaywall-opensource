import Darwin
import Foundation
import InterviewCopilotAudioBoundary
import XCTest

final class FrameWriterTests: XCTestCase {
  func testWritesVersionedSourceScopedFrameOnDedicatedDescriptor() throws {
    var descriptors = [Int32](repeating: 0, count: 2)
    XCTAssertEqual(Darwin.pipe(&descriptors), 0)
    defer {
      Darwin.close(descriptors[0])
      Darwin.close(descriptors[1])
    }

    let writer = FileDescriptorFrameWriter(descriptor: descriptors[1])
    try writer.write(
      source: .system,
      timestampNanos: 99,
      bytes: Data([1, 2, 3, 4])
    )

    var frame = [UInt8](repeating: 0, count: 32)
    let count = Darwin.read(descriptors[0], &frame, frame.count)
    XCTAssertEqual(count, frame.count)
    XCTAssertEqual(Array(frame[0..<4]), Array("ICAF".utf8))
    XCTAssertEqual(frame[4], 1)
    XCTAssertEqual(frame[5], 2)
    XCTAssertEqual(Array(frame[8..<16]), [0, 0, 0, 0, 0, 0, 0, 1])
    XCTAssertEqual(Array(frame[16..<24]), [0, 0, 0, 0, 0, 0, 0, 99])
    XCTAssertEqual(Array(frame[24..<28]), [0, 0, 0, 4])
    XCTAssertEqual(Array(frame[28..<32]), [1, 2, 3, 4])
    _ = frame.withUnsafeMutableBytes {
      $0.initializeMemory(as: UInt8.self, repeating: 0)
    }
  }

  func testRejectsEmptyFrames() {
    let writer = FileDescriptorFrameWriter(descriptor: -1)
    XCTAssertThrowsError(
      try writer.write(source: .microphone, timestampNanos: 1, bytes: Data())
    )
  }
}
