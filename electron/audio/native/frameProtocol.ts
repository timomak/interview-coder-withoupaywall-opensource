import type { AudioSource } from "./protocol"

const MAGIC = Buffer.from("ICAF")
const HEADER_BYTES = 28
const MAX_FRAME_BYTES = 1_048_576
const MAX_BUFFERED_BYTES = MAX_FRAME_BYTES * 2

export interface NativeAudioFrame {
  readonly source: AudioSource
  readonly sequence: bigint
  readonly timestampNanos: bigint
  readonly bytes: Buffer
}

export class NativeAudioFrameDecoder {
  private buffered = Buffer.alloc(0)

  push(chunk: Buffer): readonly NativeAudioFrame[] {
    if (chunk.length === 0) return []
    if (this.buffered.length + chunk.length > MAX_BUFFERED_BYTES) {
      this.clear()
      throw new Error("Native audio frame buffer exceeded its bound")
    }
    const previous = this.buffered
    this.buffered = Buffer.concat([previous, chunk])
    previous.fill(0)
    chunk.fill(0)
    const frames: NativeAudioFrame[] = []
    while (this.buffered.length >= HEADER_BYTES) {
      if (!this.buffered.subarray(0, 4).equals(MAGIC)) {
        this.clear()
        throw new Error("Native audio frame magic is invalid")
      }
      if (this.buffered.readUInt8(4) !== 1) {
        this.clear()
        throw new Error("Native audio frame version is unsupported")
      }
      const sourceByte = this.buffered.readUInt8(5)
      const source =
        sourceByte === 1
          ? "microphone"
          : sourceByte === 2
            ? "system"
            : undefined
      if (!source || this.buffered.readUInt16BE(6) !== 0) {
        this.clear()
        throw new Error("Native audio frame header is invalid")
      }
      const byteLength = this.buffered.readUInt32BE(24)
      if (byteLength === 0 || byteLength > MAX_FRAME_BYTES) {
        this.clear()
        throw new Error("Native audio frame payload is invalid")
      }
      const totalLength = HEADER_BYTES + byteLength
      if (this.buffered.length < totalLength) break
      const payload = Buffer.from(this.buffered.subarray(HEADER_BYTES, totalLength))
      frames.push({
        source,
        sequence: this.buffered.readBigUInt64BE(8),
        timestampNanos: this.buffered.readBigUInt64BE(16),
        bytes: payload
      })
      const consumed = this.buffered.subarray(0, totalLength)
      const remainder = Buffer.from(this.buffered.subarray(totalLength))
      consumed.fill(0)
      this.buffered = remainder
    }
    return frames
  }

  clear(): void {
    this.buffered.fill(0)
    this.buffered = Buffer.alloc(0)
  }
}

export function encodeFixtureFrame(frame: NativeAudioFrame): Buffer {
  if (frame.bytes.length === 0 || frame.bytes.length > MAX_FRAME_BYTES) {
    throw new Error("Fixture frame payload is invalid")
  }
  const header = Buffer.alloc(HEADER_BYTES)
  MAGIC.copy(header)
  header.writeUInt8(1, 4)
  header.writeUInt8(frame.source === "microphone" ? 1 : 2, 5)
  header.writeUInt16BE(0, 6)
  header.writeBigUInt64BE(frame.sequence, 8)
  header.writeBigUInt64BE(frame.timestampNanos, 16)
  header.writeUInt32BE(frame.bytes.length, 24)
  return Buffer.concat([header, frame.bytes])
}
