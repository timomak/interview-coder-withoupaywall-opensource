import { contextStatusLabel } from "./contextStatus"
import { reduceAccepted, startedSession } from "../../../electron/orchestrator/testSupport"

describe("context synchronization status", () => {
  it("derives honest synchronization and compaction state", () => {
    let state = startedSession()
    expect(contextStatusLabel(state)).toBe("New context")
    state = reduceAccepted(state, { type: "context-update-started" })
    expect(contextStatusLabel(state)).toBe("Updating")
    state = reduceAccepted(state, {
      type: "context-update-succeeded",
      compaction: { reason: "provider window", reportedAt: "now" }
    })
    expect(contextStatusLabel(state)).toBe("Full context")
    expect(state.providerCompaction?.reason).toBe("provider window")
    state = reduceAccepted(state, {
      type: "context-update-failed",
      detail: "provider unavailable"
    })
    expect(contextStatusLabel(state)).toBe("Context issue")
  })
})
