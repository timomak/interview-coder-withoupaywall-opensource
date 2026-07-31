import { describe, expect, it } from "vitest"
import { validateStoryClaims } from "../../../src/features/behavioral/facts"

describe("verified Behavioral claims", () => {
  it("prevents unsupported precision", () => {
    const story = {
      id: "story",
      title: "Qualitative outcome",
      status: "verified" as const,
      claims: [
        {
          id: "backed",
          text: "Reduced operational toil",
          provenance: "verified" as const,
          sourceRevision: 2
        }
      ]
    }
    expect(validateStoryClaims(story, ["backed"])).toEqual([])
    expect(story.claims[0]).not.toHaveProperty("metric")
    expect(story.claims[0].text).not.toMatch(/\d+%/)
  })
})
