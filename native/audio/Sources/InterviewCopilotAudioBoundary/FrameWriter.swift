import Darwin
import Foundation

public final class FileDescriptorFrameWriter: AudioFrameSink, @unchecked Sendable {
  private let descriptor: Int32
  private let lock = NSLock()
  private var sequences: [AudioSource: UInt64] = [:]
  private let maximumFrameBytes = 1_048_576

  public init(descriptor: Int32) {
    self.descriptor = descriptor
  }

  public func write(source: AudioSource, timestampNanos: UInt64, bytes: Data) throws {
    guard !bytes.isEmpty, bytes.count <= maximumFrameBytes else {
      throw AudioBoundaryError.nativeFailure
    }
    lock.lock()
    defer { lock.unlock() }
    let (sequence, overflow) = (sequences[source] ?? 0).addingReportingOverflow(1)
    guard !overflow else { throw AudioBoundaryError.nativeFailure }
    sequences[source] = sequence

    var frame = Data("ICAF".utf8)
    defer { frame.resetBytes(in: 0..<frame.count) }
    frame.append(1)
    frame.append(source == .microphone ? 1 : 2)
    append(UInt16(0), to: &frame)
    append(sequence, to: &frame)
    append(timestampNanos, to: &frame)
    append(UInt32(bytes.count), to: &frame)
    frame.append(bytes)
    try writeAll(frame)
  }

  private func append<T: FixedWidthInteger>(_ value: T, to data: inout Data) {
    var encoded = value.bigEndian
    Swift.withUnsafeBytes(of: &encoded) { data.append(contentsOf: $0) }
  }

  private func writeAll(_ data: Data) throws {
    try data.withUnsafeBytes { rawBuffer in
      guard let start = rawBuffer.baseAddress else {
        throw AudioBoundaryError.nativeFailure
      }
      var written = 0
      while written < rawBuffer.count {
        let result = Darwin.write(
          descriptor,
          start.advanced(by: written),
          rawBuffer.count - written
        )
        if result < 0 {
          if errno == EINTR { continue }
          throw AudioBoundaryError.nativeFailure
        }
        if result == 0 { throw AudioBoundaryError.nativeFailure }
        written += result
      }
    }
  }
}

/// Prevents a newly started native source from writing binary frames until its
/// JSON `started` event has been synchronously written to stdout.
public final class StartedHandshakeFrameSink: AudioFrameSink, @unchecked Sendable {
  private let downstream: any AudioFrameSink
  private let lock = NSLock()
  private var admitted: Set<AudioSource> = []

  public init(downstream: any AudioFrameSink) {
    self.downstream = downstream
  }

  public func close(_ source: AudioSource) {
    lock.lock()
    admitted.remove(source)
    lock.unlock()
  }

  public func admit(_ source: AudioSource) {
    lock.lock()
    admitted.insert(source)
    lock.unlock()
  }

  public func write(source: AudioSource, timestampNanos: UInt64, bytes: Data) throws {
    lock.lock()
    let isAdmitted = admitted.contains(source)
    lock.unlock()
    guard isAdmitted else { return }
    try downstream.write(source: source, timestampNanos: timestampNanos, bytes: bytes)
  }
}
