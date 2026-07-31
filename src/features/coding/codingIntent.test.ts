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
})
