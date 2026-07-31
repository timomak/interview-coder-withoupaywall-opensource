import { describe, expect, it } from "vitest"
import {
  NativeAudioFrameDecoder,
  encodeFixtureFrame
} from "./frameProtocol"

describe("native audio frame protocol", () => {
  it("keeps source timestamp and sequence across fragmented frames", () => {
    const decoder = new NativeAudioFrameDecoder()
    const encoded = encodeFixtureFrame({
      source: "system",
      sequence: 7n,
      timestampNanos: 99n,
      bytes: Buffer.from([1, 2, 3, 4])
    })
    expect(decoder.push(encoded.subarray(0, 11))).toEqual([])
    const frames = decoder.push(encoded.subarray(11))
    expect(frames).toHaveLength(1)
    expect(frames[0]).toMatchObject({
      source: "system",
      sequence: 7n,
      timestampNanos: 99n
    })
    expect(frames[0].bytes).toEqual(Buffer.from([1, 2, 3, 4]))
    frames[0].bytes.fill(0)
  })

  it("fails closed on an oversized declared payload", () => {
    const frame = encodeFixtureFrame({
      source: "microphone",
      sequence: 1n,
      timestampNanos: 1n,
      bytes: Buffer.from([1])
    })
    frame.writeUInt32BE(1_048_577, 24)
    expect(() => new NativeAudioFrameDecoder().push(frame)).toThrow(
      "payload is invalid"
    )
  })
})
