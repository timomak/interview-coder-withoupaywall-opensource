import { describe, expect, it } from "vitest"
import {
  parseAudioCommand,
  validateAudioPreferences,
  validateTranscriptSegment
} from "./ipc"
import { DEFAULT_AUDIO_PREFERENCES } from "./types"

describe("audio IPC validation", () => {
  it("accepts only bounded exact command shapes", () => {
    expect(
      parseAudioCommand({ type: "source-toggle", source: "microphone" })
    ).toEqual({ type: "source-toggle", source: "microphone" })
    expect(() =>
      parseAudioCommand({
        type: "master-toggle",
        answerAutomatically: true
      })
    ).toThrow("malformed")
    expect(() =>
      parseAudioCommand({ type: "source-retry", source: "camera" })
    ).toThrow("malformed")
  })

  it("keeps source defaults false and validates finalization", () => {
    expect(validateAudioPreferences(DEFAULT_AUDIO_PREFERENCES)).toEqual(
      DEFAULT_AUDIO_PREFERENCES
    )
    expect(() =>
      validateAudioPreferences({
        ...DEFAULT_AUDIO_PREFERENCES,
        sourceDefaults: { microphone: true, system: false }
      })
    ).toThrow("malformed")
    expect(() =>
      validateTranscriptSegment({
        schemaVersion: 1,
        id: "segment-1",
        source: "system",
        state: "partial",
        text: "partial",
        startedAt: "2026-07-31T10:00:00Z",
        finalizedAt: "2026-07-31T10:00:01Z",
        revision: 1,
        speaker: {
          label: "Interviewer",
          certainty: "default",
          corrected: false
        }
      })
    ).toThrow("finalization")
    expect(() =>
      validateTranscriptSegment({
        schemaVersion: 1,
        id: "segment-2",
        source: "microphone",
        state: "final",
        text: "final",
        startedAt: "2026-07-31T10:00:02Z",
        finalizedAt: "2026-07-31T10:00:01Z",
        revision: 1,
        speaker: {
          label: "You",
          certainty: "default",
          corrected: false
        }
      })
    ).toThrow("timestamp provenance")
  })
})
