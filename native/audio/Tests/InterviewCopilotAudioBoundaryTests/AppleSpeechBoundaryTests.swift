import Foundation
import XCTest

@testable import InterviewCopilotAudioBoundary

final class AppleSpeechBoundaryTests: XCTestCase {
  func testAcceptsOnlyTheExactAbsoluteFileContract() throws {
    XCTAssertThrowsError(try AppleSpeechInvocation(arguments: []))
    XCTAssertThrowsError(try AppleSpeechInvocation(arguments: ["--file", "relative.wav"]))
    XCTAssertThrowsError(
      try AppleSpeechInvocation(arguments: ["--file", "/tmp/input.wav", "extra"])
    )
    let invocation = try AppleSpeechInvocation(arguments: ["--file", "/tmp/input.wav"])
    XCTAssertEqual(invocation.file.path, "/tmp/input.wav")
  }

  func testRejectsSymlinkAndGroupReadableInput() throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try FileManager.default.createDirectory(at: root, withIntermediateDirectories: false)
    defer { try? FileManager.default.removeItem(at: root) }
    let file = root.appendingPathComponent("audio.wav")
    try Data(repeating: 0, count: 44).write(to: file)

    try FileManager.default.setAttributes([.posixPermissions: 0o640], ofItemAtPath: file.path)
    XCTAssertThrowsError(
      try AppleSpeechInvocation(arguments: ["--file", file.path]).validateInput()
    )

    try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: file.path)
    let link = root.appendingPathComponent("link.wav")
    try FileManager.default.createSymbolicLink(at: link, withDestinationURL: file)
    XCTAssertThrowsError(
      try AppleSpeechInvocation(arguments: ["--file", link.path]).validateInput()
    )
    XCTAssertNoThrow(
      try AppleSpeechInvocation(arguments: ["--file", file.path]).validateInput()
    )
  }

  func testBoundsAndNormalizesTranscriptOutput() throws {
    let result = try AppleSpeechResult(text: "  hello world\n")
    let line = try result.encodedLine()
    XCTAssertEqual(line.last, 0x0A)
    XCTAssertEqual(
      String(decoding: line, as: UTF8.self),
      "{\"schemaVersion\":1,\"text\":\"hello world\"}\n"
    )
    let decoded = try JSONDecoder().decode(AppleSpeechResult.self, from: line.dropLast())
    XCTAssertEqual(decoded.schemaVersion, 1)
    XCTAssertEqual(decoded.text, "hello world")
    XCTAssertThrowsError(
      try AppleSpeechResult(
        text: String(repeating: "x", count: appleSpeechMaximumTranscriptBytes + 1)
      )
    )
  }
}
