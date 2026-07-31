import { describe, expect, it } from "vitest"
import { applySystemDesignFollowup } from "./systemDesignPolicy"

describe("System Design follow-up", () => {
  it("applies dependency-scoped revisions", () => {
    const sections = [
      { id: "clarify", order: 0, body: "assumptions", state: "complete" as const },
      { id: "estimate", order: 1, body: "100 rps", state: "complete" as const },
      { id: "architecture", order: 2, body: "one region", state: "complete" as const }
    ]
    const result = applySystemDesignFollowup(
      sections,
      ["estimate", "architecture"],
      { estimate: "1000 rps", architecture: "multi-region" },
      ["Traffic increased.", "Architecture became multi-region."]
    )
    expect(result.sections[0]).toEqual(sections[0])
    expect(result.before.clarify).toBe(result.after.clarify)
    expect(result.before.estimate).not.toBe(result.after.estimate)
    expect(result.whatChanged).toHaveLength(2)
  })
})
