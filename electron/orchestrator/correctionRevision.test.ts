import {
  TEST_SNAPSHOT,
  createTestOrchestrator,
  currentActive
} from "./testSupport"
import { applyCorrection } from "./responseRouting"

describe("correction revision", () => {
  it("applies correction-scoped revision without collateral changes", async () => {
    const before = [
      { id: "approach", order: 0, body: "old", state: "complete" as const },
      { id: "complexity", order: 1, body: "O(n)", state: "complete" as const },
      { id: "code", order: 2, body: "stable", state: "complete" as const }
    ]
    const hashes = applyCorrection(
      before,
      { complexity: "O(log n)" },
      ["complexity"]
    )
    expect(hashes.changedSectionIds).toEqual(["complexity"])
    expect(hashes.beforeHashes.approach).toBe(hashes.afterHashes.approach)
    expect(hashes.beforeHashes.code).toBe(hashes.afterHashes.code)

    const fixture = createTestOrchestrator()
    fixture.providerFactory.queued.push(
      {
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
              sections: before.map(({ id, body }) => ({ id, body }))
            }
          },
          { type: "completed", sequence: 2 }
        ]
      },
      {
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
              kind: "correction",
              sections: [{ id: "complexity", body: "O(log n)" }]
            }
          },
          { type: "completed", sequence: 2 }
        ]
      }
    )
    await fixture.orchestrator.start(TEST_SNAPSHOT)
    await fixture.orchestrator.submit(
      "mode-action",
      "answer",
      before.map((section) => section.id)
    )
    const initial = currentActive(fixture.orchestrator.current())
    await fixture.orchestrator.submit(
      "correction",
      "Correction: use a balanced tree",
      ["complexity"]
    )
    const revised = currentActive(fixture.orchestrator.current())
    expect(revised.sections.map((section) => section.body)).toEqual([
      "old",
      "O(log n)",
      "stable"
    ])
    expect(revised.sections[0]).toEqual(initial.sections[0])
    expect(revised.sections[2]).toEqual(initial.sections[2])
    expect(fixture.providerFactory.conversationIds).toHaveLength(1)
    expect(fixture.providerFactory.prompts[1]).toContain('"kind":"delta"')
  })
})
