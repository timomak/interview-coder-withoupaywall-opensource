import { describe, expect, it } from "vitest"
import { buildSystemDesignRequest } from "./systemDesignPolicy"
import { startedSession } from "./testSupport"

describe("System Design assumptions", () => {
  it("answers best effort without clarification gate", () => {
    const request = buildSystemDesignRequest(
      startedSession(),
      "request-1",
      "Design a feed",
      {
        answer: true,
        assumptions: ["Assume 10M daily active users."],
        clarificationSuggestions: ["traffic scale"]
      }
    )
    expect(request.assumptions).toEqual(["Assume 10M daily active users."])
    expect(request.contract.clarificationGatesLaterSections).toBe(false)
    expect(request.sectionIds).toHaveLength(5)
  })
})
