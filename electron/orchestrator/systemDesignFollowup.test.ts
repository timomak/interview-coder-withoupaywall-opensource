import { describe, expect, it } from "vitest"
import { applySystemDesignFollowup } from "./systemDesignPolicy"
import { createHash } from "node:crypto"
import {
  createTestOrchestrator,
  currentActive
} from "./testSupport"

const graph = JSON.stringify({
  nodes: [
    { id: "client", type: "client", label: "Client", detail: "Caller" },
    { id: "service", type: "service", label: "Service", detail: "API" }
  ],
  edges: [{ id: "request", from: "client", to: "service", label: "request" }]
})
const estimates = JSON.stringify([
  { name: "traffic", expression: "10*10", result: 100, unit: "rps", assumption: "ten users each" },
  { name: "storage", expression: "100*1", result: 100, unit: "GB", assumption: "one GB each" }
])
const hash = (body: string) => createHash("sha256").update(body).digest("hex")

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

  it("admits a scoped provider follow-up without duplicating fixed sections", async () => {
    const fixture = createTestOrchestrator()
    await fixture.orchestrator.command({
      type: "start",
      snapshot: {
        mode: "system-design",
        provider: "codex",
        model: "gpt-5.4",
        responseMode: "fast",
        language: "typescript",
        context: []
      }
    })
    fixture.providerFactory.queued.push({
      selection: { provider: "codex", model: "gpt-5.4", responseMode: "fast", effort: "low" },
      events: [
        {
          type: "typed-payload",
          sequence: 1,
          payload: {
            kind: "structured",
            sections: [
              { id: "clarify", body: "Assume global users." },
              { id: "estimate", body: estimates },
              { id: "architecture", body: graph },
              { id: "data-apis", body: "Versioned API and durable records." },
              { id: "deep-dives-trade-offs", body: "Prefer availability." }
            ]
          }
        },
        { type: "completed", sequence: 2 }
      ]
    })
    expect(
      (
        await fixture.orchestrator.command({
          type: "submit",
          route: "mode-action",
          input: "Design a service"
        })
      ).ok
    ).toBe(true)
    const before = currentActive(fixture.orchestrator.current())
    const clarifyHash = hash(
      before.sections.find((section) => section.id === "clarify")?.body ?? ""
    )
    fixture.providerFactory.queued.push({
      selection: { provider: "codex", model: "gpt-5.4", responseMode: "fast", effort: "low" },
      events: [
        {
          type: "typed-payload",
          sequence: 1,
          payload: {
            kind: "system-design-followup",
            impactedSectionIds: ["estimate"],
            sections: [
              {
                id: "estimate",
                body: estimates.replace('"result":100', '"result":120')
              }
            ],
            whatChanged: ["Traffic assumption increased."]
          }
        },
        { type: "completed", sequence: 2 }
      ]
    })
    const followed = await fixture.orchestrator.command({
      type: "submit",
      route: "mode-action",
      input: "Deepen the estimate only"
    })
    expect(followed.ok).toBe(true)
    const after = currentActive(followed.state)
    expect(after.sections).toHaveLength(5)
    expect(
      hash(after.sections.find((section) => section.id === "clarify")?.body ?? "")
    ).toBe(clarifyHash)
    expect(after.compactExchanges.at(-1)?.answer).toContain("What changed")
  })
})
