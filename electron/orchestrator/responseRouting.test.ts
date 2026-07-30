import {
  TEST_SNAPSHOT,
  createTestOrchestrator,
  currentActive
} from "./testSupport"

describe("response routing", () => {
  it("separates structured updates from compact clarification", async () => {
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
              sections: [{ id: "answer", body: "byte-stable curated" }]
            }
          }
        ]
      },
      {
        selection: {
          provider: "codex",
          model: "gpt-5.4",
          responseMode: "fast",
          effort: "low"
        },
        events: [{ type: "text-delta", sequence: 1, text: "short reply" }]
      }
    )
    await fixture.orchestrator.start(TEST_SNAPSHOT)
    await fixture.orchestrator.submit("mode-action", "answer", ["answer"])
    const before = currentActive(fixture.orchestrator.current()).sections[0].body
    await fixture.orchestrator.submit("clarification", "clarify")
    const after = currentActive(fixture.orchestrator.current())
    expect(after.sections[0].body).toBe(before)
    expect(after.compactExchanges[0].answer).toBe("short reply")
  })
})
