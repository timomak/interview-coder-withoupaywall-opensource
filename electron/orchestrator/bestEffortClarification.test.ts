import { bestEffortDecision } from "./responseRouting"

describe("best effort clarification", () => {
  it("answers without confidence gates and suggests material clarifications", () => {
    const result = bestEffortDecision(
      ["Assume regional failover is required"],
      ["traffic", "color"],
      { traffic: true, color: false }
    )
    expect(result).toEqual({
      answer: true,
      assumptions: ["Assume regional failover is required"],
      clarificationSuggestions: ["traffic"]
    })
    expect(result).not.toHaveProperty("confidence")
    expect(result).not.toHaveProperty("reviewState")
  })
})
