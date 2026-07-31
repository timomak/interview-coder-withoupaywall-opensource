import { describe, expect, it } from "vitest"
import { createSyntheticStory } from "./facts"

const source = {
  id: "synthetic-1",
  title: "Illustrative migration",
  status: "user-edited" as const,
  claims: [
    {
      id: "claim-1",
      text: "Illustrative event",
      provenance: "manual-edit" as const,
      sourceRevision: 1
    }
  ]
}

describe("synthetic Behavioral stories", () => {
  it("labels persists and reuses synthetic evidence", () => {
    expect(() => createSyntheticStory(false, source)).toThrow(
      "Synthetic stories are off"
    )
    const saved = createSyntheticStory(true, source)
    const reused = structuredClone(saved)
    expect(saved.status).toBe("synthetic-draft")
    expect(saved.claims[0].provenance).toBe("synthetic-draft")
    expect(reused).toEqual(saved)
  })
})
