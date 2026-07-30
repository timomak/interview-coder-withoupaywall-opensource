import {
  TEST_SNAPSHOT,
  createTestOrchestrator
} from "./testSupport"

describe("encrypted crash recovery", () => {
  it("restores one encrypted provider conversation with capture off", async () => {
    const first = createTestOrchestrator()
    await first.orchestrator.start(TEST_SNAPSHOT)
    const saved = first.records.values.get("active-interview-session")
    expect(saved?.opaqueProviderConversationId).toMatch(/^test-opaque-id-/)

    const second = createTestOrchestrator(
      undefined,
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
      saved?.opaqueProviderConversationId
    ])
    const plaintextSurfaces = JSON.stringify({
      config: TEST_SNAPSHOT,
      index: Object.keys(Object.fromEntries(first.records.values)),
      log: [],
      providerDirectory: []
    })
    expect(plaintextSurfaces).not.toContain(
      String(saved?.opaqueProviderConversationId)
    )
  })
})
