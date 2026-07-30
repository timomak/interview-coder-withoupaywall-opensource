import {
  reduceInterviewSession
} from "./sessionReducer"
import { startedSession } from "../../../electron/orchestrator/testSupport"

describe("InterviewSession reducer property corpus", () => {
  it("preserves invariants under event permutations", () => {
    const seed = 0x1c04
    const base = startedSession()
    const valid = {
      type: "context-update-started" as const,
      eventId: "event-valid",
      sessionId: base.sessionId,
      sequence: 2,
      at: "now"
    }
    const corpus = [
      { ...valid, eventId: base.seenEventIds[0] },
      { ...valid, sequence: 1 },
      { ...valid, sequence: 3 },
      { ...valid, sessionId: "different-session" }
    ]
    const reasons = corpus.map(
      (event) => reduceInterviewSession(base, event).reason
    )
    expect({ seed, reasons }).toEqual({
      seed: 7172,
      reasons: [
        "duplicate-event",
        "stale-event",
        "out-of-order-event",
        "cross-session-event"
      ]
    })
    expect(corpus.every((event) => reduceInterviewSession(base, event).state === base)).toBe(true)
    expect(reduceInterviewSession(base, valid).accepted).toBe(true)
  })
})
