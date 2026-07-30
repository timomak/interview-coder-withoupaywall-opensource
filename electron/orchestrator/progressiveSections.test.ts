import { reduceInterviewSession } from "../../src/domain/interview"
import { reduceAccepted, startedSession } from "./testSupport"

describe("progressive response sections", () => {
  it("streams stable independently final sections", () => {
    let state = startedSession()
    state = reduceAccepted(state, {
      type: "request-started",
      requestId: "request-1",
      sectionIds: ["summary", "code"]
    })
    state = reduceAccepted(state, {
      type: "section-delta",
      requestId: "request-1",
      sectionId: "code",
      delta: "const answer = 42",
      complete: true
    })
    state = reduceAccepted(state, {
      type: "section-delta",
      requestId: "request-1",
      sectionId: "summary",
      delta: "Approach",
      complete: false
    })
    expect(state.sections.map((section) => section.id)).toEqual([
      "summary",
      "code"
    ])
    const replacement = reduceInterviewSession(state, {
      type: "section-delta",
      requestId: "request-1",
      sectionId: "code",
      delta: "replacement",
      complete: true,
      eventId: "replacement",
      sessionId: state.sessionId,
      sequence: state.sequence + 1,
      at: "now"
    })
    expect(replacement.accepted).toBe(false)
    expect(state.sections[1].body).toBe("const answer = 42")
  })
})
