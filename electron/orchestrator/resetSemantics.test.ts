import { TEST_SNAPSHOT, createTestOrchestrator } from "./testSupport"

describe("Reset semantics", () => {
  it("performs the sole terminal lifecycle transition", async () => {
    const { orchestrator, records } = createTestOrchestrator()
    await orchestrator.start(TEST_SNAPSHOT)
    await orchestrator.reset()
    expect(orchestrator.current()).toMatchObject({
      lifecycle: "idle",
      lastArchive: {
        session: { lifecycle: "active", captureActive: false }
      }
    })
    expect(records.values.has("active-interview-session")).toBe(false)
    expect(
      [...records.values.keys()].some((id) => id.startsWith("archive:"))
    ).toBe(true)
  })
})
