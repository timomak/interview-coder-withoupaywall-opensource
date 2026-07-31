import { describe, expect, it } from "vitest"
import {
  createTestOrchestrator,
  currentActive
} from "../../../electron/orchestrator/testSupport"
import { sectionsForCodingIntent } from "./types"

const snapshot = {
  mode: "coding" as const,
  provider: "codex" as const,
  model: "gpt-5.4",
  responseMode: "fast" as const,
  language: "python3",
  context: []
}

describe("Coding intent", () => {
  it("requires and validates explicit intent", async () => {
    const fixture = createTestOrchestrator()
    await fixture.orchestrator.command({ type: "start", snapshot })
    const rejected = await fixture.orchestrator.command({
      type: "submit",
      route: "mode-action",
      input: "solve it"
    })
    expect(rejected).toMatchObject({ ok: false })
    expect(fixture.providerFactory.prompts).toHaveLength(0)
    expect(currentActive(rejected.state).requests).toHaveLength(0)
  })

  it("maps each intent to a distinct typed section contract", () => {
    const contracts = [
      sectionsForCodingIntent("analyze"),
      sectionsForCodingIntent("generate-code"),
      sectionsForCodingIntent("debug"),
      sectionsForCodingIntent("follow-up")
    ].map((sections) => sections.join(","))
    expect(new Set(contracts)).toHaveLength(4)
  })

  it("rejects prose that bypasses the live generated-code contract", async () => {
    const fixture = createTestOrchestrator()
    await fixture.orchestrator.command({ type: "start", snapshot })
    fixture.providerFactory.queued.push({
      selection: {
        provider: "codex",
        model: "gpt-5.4",
        responseMode: "fast",
        effort: "low"
      },
      events: [
        {
          type: "typed-payload",
          sequence: 1,
          payload: {
            kind: "structured",
            sections: [
              { id: "answer", body: "Try a loop." },
              { id: "plan", body: "Do the thing." },
              { id: "code", body: "plain prose" },
              { id: "explain", body: "Done." }
            ]
          }
        },
        { type: "completed", sequence: 2 }
      ]
    })
    const result = await fixture.orchestrator.command({
      type: "submit",
      route: "mode-action",
      codingIntent: "generate-code",
      input: "Solve two sum"
    })
    expect(result.ok).toBe(false)
    expect(result.error).toContain("approach bullets")
    expect(
      currentActive(result.state).codingQuestions?.branches[0]?.question
    ).toBe("Solve two sum")
  })
})
