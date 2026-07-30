import {
  FakeProviderFactory,
  TEST_SNAPSHOT,
  createTestOrchestrator
} from "./testSupport"

describe("encrypted crash recovery", () => {
  it("restores one encrypted provider conversation with capture off", async () => {
    const first = createTestOrchestrator()
    await first.orchestrator.start(TEST_SNAPSHOT)
    const saved = first.records.values.get("active-interview-session")
    expect(saved?.providerConversation.id).toMatch(/^test-opaque-id-/)
    expect(saved?.providerConversation.mode).toBe("create")
    expect(saved?.delivery.cursor.seeded).toBe(false)
    const savedConversationId = saved?.providerConversation.id
    if (!savedConversationId) throw new Error("Expected saved conversation ID")

    const second = createTestOrchestrator(
      new FakeProviderFactory(new Set([savedConversationId])),
      first.records
    )
    expect(await second.orchestrator.inspectRecovery()).toMatchObject({
      available: true,
      captureActive: false
    })
    expect(second.providerFactory.conversationIds).toEqual([])
    await second.orchestrator.resume()
    expect(second.orchestrator.current()).toMatchObject({
      lifecycle: "active",
      captureActive: false
    })
    expect(second.providerFactory.conversationIds).toEqual([
      savedConversationId
    ])
    const plaintextSurfaces = JSON.stringify({
      config: TEST_SNAPSHOT,
      index: Object.keys(Object.fromEntries(first.records.values)),
      log: [],
      providerDirectory: []
    })
    expect(plaintextSurfaces).not.toContain(
      String(saved?.providerConversation.id)
    )
  })

  it("retries the exact pending delivery after failure and crash", async () => {
    const firstFactory = new FakeProviderFactory()
    firstFactory.queued.push({
      selection: {
        provider: "codex",
        model: "gpt-5.4",
        responseMode: "fast",
        effort: "low"
      },
      events: [
        {
          type: "error",
          sequence: 1,
          code: "PROCESS_FAILED",
          message: "transient failure",
          recoverable: true
        }
      ]
    })
    const first = createTestOrchestrator(firstFactory)
    await first.orchestrator.start(TEST_SNAPSHOT)
    await expect(
      first.orchestrator.submit("chat", "first attempt")
    ).rejects.toThrow("transient failure")
    const failedSnapshot = first.records.values.get(
      "active-interview-session"
    )
    expect(failedSnapshot?.delivery.pending).toBeDefined()
    expect(failedSnapshot?.delivery.cursor.seeded).toBe(false)
    const firstContext = JSON.parse(firstFactory.prompts[0]).context

    const conversationId = failedSnapshot?.providerConversation.id
    expect(conversationId).toBeDefined()
    const resumedFactory = new FakeProviderFactory(
      new Set([conversationId as string])
    )
    resumedFactory.queued.push(
      {
        selection: {
          provider: "codex",
          model: "gpt-5.4",
          responseMode: "fast",
          effort: "low"
        },
        events: [
          { type: "text-delta", sequence: 1, text: "accepted retry" },
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
          { type: "text-delta", sequence: 1, text: "delta turn" },
          { type: "completed", sequence: 2 }
        ]
      }
    )
    const resumed = createTestOrchestrator(resumedFactory, first.records)
    await resumed.orchestrator.inspectRecovery()
    await resumed.orchestrator.resume()
    await resumed.orchestrator.submit("chat", "retry after crash")
    expect(JSON.parse(resumedFactory.prompts[0]).context).toEqual(firstContext)
    const acceptedDelivery = resumed.records.values.get(
      "active-interview-session"
    )?.delivery
    expect(acceptedDelivery).toMatchObject({
      cursor: { seeded: true }
    })
    expect(acceptedDelivery).not.toHaveProperty("pending")

    await resumed.orchestrator.submit("chat", "next turn")
    expect(JSON.parse(resumedFactory.prompts[1]).context).toEqual({
      kind: "delta",
      items: [],
      evidence: []
    })
  })
})
