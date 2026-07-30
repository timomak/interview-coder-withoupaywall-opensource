import {
  bestEffortDecision,
  deriveBestEffortDecision
} from "./responseRouting"
import { startedSession } from "./testSupport"

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

  it("derives material suggestions and ignores immaterial omissions", () => {
    const missingMaterial = deriveBestEffortDecision(
      startedSession({
        mode: "system-design",
        provider: "codex",
        model: "gpt-5.4",
        responseMode: "fast",
        language: "typescript",
        context: []
      }),
      "Design the service"
    )
    expect(missingMaterial.answer).toBe(true)
    expect(missingMaterial.clarificationSuggestions).toEqual([
      "traffic scale",
      "consistency requirement"
    ])
    expect(missingMaterial.assumptions).toHaveLength(2)

    const onlyImmaterialMissing = deriveBestEffortDecision(
      startedSession({
        mode: "system-design",
        provider: "codex",
        model: "gpt-5.4",
        responseMode: "fast",
        language: "typescript",
        context: []
      }),
      "Support 10k QPS with bounded eventual consistency"
    )
    expect(onlyImmaterialMissing).toEqual({
      answer: true,
      assumptions: [],
      clarificationSuggestions: []
    })
  })
})
