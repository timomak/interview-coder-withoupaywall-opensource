import { describe, expect, it } from "vitest"
import {
  NativeAudioFrameDecoder,
  encodeFixtureFrame
} from "./native/frameProtocol"
import { defaultSpeaker } from "../../src/shared/audio"

describe("two-channel audio provenance", () => {
  it("preserves two-channel provenance end to end", () => {
    const decoder = new NativeAudioFrameDecoder()
    const frames = decoder.push(
      Buffer.concat([
        encodeFixtureFrame({
          source: "system",
          sequence: 1n,
          timestampNanos: 100n,
          bytes: Buffer.from([1, 2, 3, 4])
        }),
        encodeFixtureFrame({
          source: "microphone",
          sequence: 1n,
          timestampNanos: 110n,
          bytes: Buffer.from([5, 6, 7, 8])
        })
      ])
    )

    expect(
      frames.map((frame) => ({
        source: frame.source,
        timestampNanos: frame.timestampNanos,
        speaker: defaultSpeaker(frame.source).label
      }))
    ).toEqual([
      {
        source: "system",
        timestampNanos: 100n,
        speaker: "Interviewer"
      },
      {
        source: "microphone",
        timestampNanos: 110n,
        speaker: "You"
      }
    ])
    for (const frame of frames) frame.bytes.fill(0)
  })
})
