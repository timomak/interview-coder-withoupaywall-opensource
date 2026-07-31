import { describe, expect, it } from "vitest"
import { deriveBehavioralView, fullAnswerFacts } from "./facts"

describe("Behavioral fact parity", () => {
  it("preserves claims across concise and full formats", () => {
    const story = {
      id: "story-1",
      title: "Migration",
      status: "verified" as const,
      claims: [
        { id: "one", text: "Inherited a risky migration.", provenance: "verified" as const, sourceRevision: 1 },
        { id: "two", text: "Made the rollout reversible.", provenance: "verified" as const, sourceRevision: 1 }
      ]
    }
    const view = deriveBehavioralView(story)
    expect(new Set(fullAnswerFacts(view, story))).toEqual(
      new Set(story.claims.map((claim) => claim.text))
    )
    expect(view.evidenceClaimIds).toEqual(["one", "two"])
  })
})
