import { describe, expect, it } from "vitest"
import {
  defaultSpeaker,
  speakerCorrectionCommand,
  visibleSpeaker
} from "./model"
import { transcriptSegment } from "./testFixtures"

describe("speaker attribution", () => {
  it("labels marks and corrects transcript provenance", () => {
    expect(defaultSpeaker("system")).toBe("Interviewer")
    expect(defaultSpeaker("microphone")).toBe("You")
    expect(
      visibleSpeaker(
        transcriptSegment("system", {
          speaker: {
            label: "",
            certainty: "uncertain",
            corrected: false
          }
        })
      )
    ).toBe("Interviewer")
    expect(speakerCorrectionCommand("segment:system", " You ")).toEqual({
      type: "correct-speaker",
      segmentId: "segment:system",
      label: "You"
    })
  })

  it("rejects empty correction commands", () => {
    expect(() => speakerCorrectionCommand("segment:one", " ")).toThrow(
      "speaker label"
    )
  })
})
