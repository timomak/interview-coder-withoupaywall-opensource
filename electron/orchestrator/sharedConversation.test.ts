import {
  TEST_SNAPSHOT,
  createTestOrchestrator
} from "./testSupport"

describe("shared provider conversation", () => {
  it("routes curated and chat turns through one conversation", async () => {
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
              sections: [{ id: "answer", body: "curated" }]
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
          { type: "text-delta", sequence: 1, text: "compact" },
          { type: "completed", sequence: 2 }
        ]
      }
    )
    await fixture.orchestrator.start(TEST_SNAPSHOT)
    await fixture.orchestrator.submit("mode-action", "solve", ["answer"])
    await fixture.orchestrator.submit("chat", "why?")
    expect(fixture.providerFactory.conversationIds).toHaveLength(1)
    expect(fixture.providerFactory.prompts).toHaveLength(2)
  })
})
