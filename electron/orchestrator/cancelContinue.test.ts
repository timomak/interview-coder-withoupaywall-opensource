import { reduceAccepted, startedSession } from "./testSupport"

describe("cancel and continue", () => {
  it("resumes unfinished sections without duplicate evidence", () => {
    let state = startedSession()
    state = reduceAccepted(state, {
      type: "request-started",
      requestId: "same-request",
      sectionIds: ["done", "unfinished"]
    })
    state = reduceAccepted(state, {
      type: "section-delta",
      requestId: "same-request",
      sectionId: "done",
      delta: "stable",
      complete: true
    })
    state = reduceAccepted(state, {
      type: "section-delta",
      requestId: "same-request",
      sectionId: "unfinished",
      delta: "partial",
      complete: false
    })
    state = reduceAccepted(state, {
      type: "request-cancelled",
      requestId: "same-request"
    })
    state = reduceAccepted(state, {
      type: "request-continued",
      requestId: "same-request",
      unfinishedSectionIds: ["unfinished"]
    })
    expect(state.sections.map((section) => section.body)).toEqual([
      "stable",
      "partial"
    ])
    expect(state.requests).toEqual([
      {
        id: "same-request",
        sectionIds: ["done", "unfinished"],
        cancelled: false,
        completed: false
      }
    ])
  })
})
