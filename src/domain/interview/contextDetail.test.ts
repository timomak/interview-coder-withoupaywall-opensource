import { selectContextDetail } from "./contextDetail"
import { reduceAccepted, startedSession } from "../../../electron/orchestrator/testSupport"

describe("context detail", () => {
  it("renders exact honest source-level context detail", () => {
    let state = startedSession()
    state = reduceAccepted(state, { type: "context-update-started" })
    state = reduceAccepted(state, {
      type: "context-update-succeeded",
      usage: { inputTokens: 120, outputTokens: 30 },
      compaction: { reason: "provider-reported", reportedAt: "later" }
    })
    expect(selectContextDetail(state)).toEqual({
      label: "Full context",
      provider: "codex",
      model: "gpt-5.4",
      mode: "system-design",
      lastSuccessfulUpdate: "2026-07-30T12:00:03Z",
      sourceCounts: {
        instructions: 1,
        transcript: 0,
        screenshot: 0,
        profile: 1,
        opportunity: 1
      },
      personalContext: "included",
      usage: { inputTokens: 120, outputTokens: 30 },
      compaction: { reason: "provider-reported", reportedAt: "later" },
      issue: undefined
    })
  })
})
