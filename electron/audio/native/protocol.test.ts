import { describe, expect, it } from "vitest"
import {
  AUDIO_HELPER_PROTOCOL_VERSION,
  encodeAudioHelperCommand,
  parseAudioHelperEvent
} from "./protocol"

describe("native audio helper protocol", () => {
  it("accepts bounded typed events and rejects extra or sensitive fields", () => {
    expect(
      parseAudioHelperEvent(
        JSON.stringify({
          protocolVersion: 1,
          type: "started",
          source: "system",
          sampleRate: 16_000,
          channels: 1,
          sampleFormat: "f32le"
        })
      )
    ).toMatchObject({ type: "started", source: "system" })
    expect(() =>
      parseAudioHelperEvent(
        JSON.stringify({
          protocolVersion: 1,
          type: "error",
          source: "microphone",
          code: "NATIVE_FAILURE",
          detail: "device or audio-derived detail"
        })
      )
    ).toThrow("malformed")
  })

  it("encodes only versioned source-scoped commands", () => {
    expect(
      JSON.parse(
        encodeAudioHelperCommand({
          protocolVersion: AUDIO_HELPER_PROTOCOL_VERSION,
          type: "start",
          source: "microphone"
        })
      )
    ).toEqual({
      protocolVersion: 1,
      type: "start",
      source: "microphone"
    })
  })
})
