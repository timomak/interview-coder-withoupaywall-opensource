import {
  createIdleInterviewSession,
  reduceInterviewSession
} from "./sessionReducer"
import type { StartSnapshot } from "../../shared/interview"

describe("InterviewSession lifecycle", () => {
  it("locks start snapshot until reset", () => {
    const snapshot: StartSnapshot = {
      mode: "coding",
      provider: "codex",
      model: "gpt-5.4",
      responseMode: "fast",
      language: "rust",
      context: [
        {
          id: "profile",
          category: "profile",
          revision: 1,
          content: "excluded"
        }
      ]
    }
    const started = reduceInterviewSession(createIdleInterviewSession(), {
      type: "start",
      eventId: "start",
      sessionId: "session",
      sequence: 1,
      at: "now",
      snapshot
    })
    expect(started.accepted).toBe(true)
    expect(started.state.lifecycle).toBe("active")
    if (started.state.lifecycle !== "active") return
    expect(started.state.snapshot.context).toEqual([])

    const changed = reduceInterviewSession(started.state, {
      type: "start",
      eventId: "second-start",
      sessionId: "session",
      sequence: 2,
      at: "later",
      snapshot: { ...snapshot, mode: "behavioral", language: "python" }
    })
    expect(changed).toEqual({
      state: started.state,
      accepted: false,
      reason: "invalid-transition"
    })
    expect(started.state.snapshot.mode).toBe("coding")
    expect(started.state.snapshot.language).toBe("rust")
  })
})
