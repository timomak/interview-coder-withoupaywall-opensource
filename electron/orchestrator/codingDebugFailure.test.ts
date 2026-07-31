import { describe, expect, it } from "vitest"
import { parseCodingFixCard } from "./codingPolicy"

describe("unsupported Coding debug", () => {
  it("fails honestly without regeneration or fallback", () => {
    expect(
      parseCodingFixCard({
        version: 2,
        supported: false,
        issue: "No defect is visible in the supplied region.",
        explanation: "The screenshot does not show the failing input or output.",
        requestedEvidence: "Capture the failing result and relevant source lines."
      })
    ).toMatchObject({ version: 2, supported: false })
    expect(
      parseCodingFixCard({
        version: 2,
        supported: false,
        issue: "unknown",
        correction: "invented full regeneration",
        explanation: "fallback",
        requestedEvidence: "none"
      })
    ).toBeNull()
  })
})
