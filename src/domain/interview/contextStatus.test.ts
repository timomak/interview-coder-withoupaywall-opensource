import { contextStatusLabel } from "./contextStatus"
import { reduceAccepted, startedSession } from "../../../electron/orchestrator/testSupport"
import { projectInterviewSessionForRenderer } from "../../shared/interview"

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

  it("keeps screenshot pixels out of renderer state", () => {
    const original = reduceAccepted(startedSession(), {
      type: "artifact-staged",
      artifact: {
        id: "screenshot:renderer-boundary",
        kind: "screenshot",
        finalizedAt: "2026-08-13T15:00:00.000Z",
        content: `data:image/png;base64,${"private-pixels".repeat(100_000)}`
      }
    })
    const projected = projectInterviewSessionForRenderer(original)
    expect(original.artifacts[0]?.content.length).toBeGreaterThan(1_000_000)
    expect(projected.lifecycle).toBe("active")
    if (projected.lifecycle !== "active") throw new Error("Expected active state")
    expect(projected.artifacts[0]).toMatchObject({
      id: "screenshot:renderer-boundary",
      kind: "screenshot",
      content: ""
    })
  })
})
