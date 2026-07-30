import { reduceInterviewSession } from "../../src/domain/interview"
import { reduceAccepted, startedSession } from "./testSupport"

describe("pending evidence policy", () => {
  it("stages removes submits and deduplicates evidence", () => {
    let state = startedSession()
    state = reduceAccepted(state, {
      type: "artifact-staged",
      artifact: {
        id: "transcript-1",
        kind: "transcript",
        finalizedAt: "now",
        content: "question"
      }
    })
    expect(state.artifacts[0]).toMatchObject({
      selected: true,
      submitted: false
    })
    state = reduceAccepted(state, {
      type: "artifact-selection-changed",
      artifactId: "transcript-1",
      selected: false
    })
    expect(state.artifacts[0]).toMatchObject({
      selected: false,
      content: "question"
    })
    const empty = reduceInterviewSession(state, {
      type: "artifacts-submitted",
      artifactIds: [],
      eventId: "empty",
      sessionId: state.sessionId,
      sequence: state.sequence + 1,
      at: "now"
    })
    expect(empty.accepted).toBe(false)
    state = reduceAccepted(state, {
      type: "artifact-selection-changed",
      artifactId: "transcript-1",
      selected: true
    })
    state = reduceAccepted(state, {
      type: "artifacts-submitted",
      artifactIds: ["transcript-1"]
    })
    expect(state.acceptedArtifactIds).toEqual(["transcript-1"])
    const duplicate = reduceInterviewSession(state, {
      type: "artifacts-submitted",
      artifactIds: ["transcript-1"],
      eventId: "duplicate-submit",
      sessionId: state.sessionId,
      sequence: state.sequence + 1,
      at: "now"
    })
    expect(duplicate.accepted).toBe(false)
  })
})
