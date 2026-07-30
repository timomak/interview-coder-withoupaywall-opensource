import {
  bestEffortDecision,
  deriveBestEffortDecision
} from "./responseRouting"
import {
  TEST_SNAPSHOT,
  createTestOrchestrator,
  startedSession
} from "./testSupport"

const acceptedAnswer = {
  selection: {
    provider: "codex" as const,
    model: "gpt-5.4",
    responseMode: "fast" as const,
    effort: "low" as const
  },
  events: [
    {
      type: "typed-payload" as const,
      sequence: 1,
      payload: {
        kind: "structured",
        sections: [{ id: "answer", body: "best effort answer" }]
      }
    },
    { type: "completed" as const, sequence: 2 }
  ]
}

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

  it("places only material mode omissions in real provider prompts", async () => {
    const material = createTestOrchestrator()
    material.providerFactory.queued.push(acceptedAnswer)
    await material.orchestrator.start({
      ...TEST_SNAPSHOT,
      context: []
    })
    await material.orchestrator.submit(
      "mode-action",
      "Design the service",
      ["answer"]
    )
    expect(JSON.parse(material.providerFactory.prompts[0]).bestEffort).toEqual({
      answer: true,
      assumptions: [
        "Design for horizontally scalable production traffic.",
        "Prefer availability with bounded eventual consistency."
      ],
      clarificationSuggestions: [
        "traffic scale",
        "consistency requirement"
      ]
    })

    const immaterial = createTestOrchestrator()
    immaterial.providerFactory.queued.push(acceptedAnswer)
    await immaterial.orchestrator.start({
      ...TEST_SNAPSHOT,
      context: []
    })
    await immaterial.orchestrator.submit(
      "mode-action",
      "Support 10k QPS with bounded eventual consistency",
      ["answer"]
    )
    expect(
      JSON.parse(immaterial.providerFactory.prompts[0]).bestEffort
    ).toEqual({
      answer: true,
      assumptions: [],
      clarificationSuggestions: []
    })
  })
})
