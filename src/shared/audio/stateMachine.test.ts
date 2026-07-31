import { describe, expect, it } from "vitest"
import {
  correctTranscriptSpeaker,
  createInitialAudioSessionState,
  defaultSpeaker,
  editPendingQuestion,
  setPendingQuestion,
  sourceIntentAfterMaster,
  updateAudioSourceState,
  upsertTranscriptSegment
} from "./stateMachine"

describe("deterministic two-source audio state", () => {
  it("starts every source off and makes master pause only when both listen", () => {
    let state = createInitialAudioSessionState("session-1")
    expect(state.sources.microphone.phase).toBe("off")
    expect(state.sources.system.phase).toBe("off")
    expect(sourceIntentAfterMaster(state)).toEqual({
      microphone: "active",
      system: "active"
    })

    for (const source of ["microphone", "system"] as const) {
      state = updateAudioSourceState(state, {
        ...state.sources[source],
        intent: "active",
        phase: "starting"
      })
      state = updateAudioSourceState(state, {
        ...state.sources[source],
        intent: "active",
        phase: "listening",
        permission: "granted"
      })
    }
    expect(sourceIntentAfterMaster(state)).toEqual({
      microphone: "paused",
      system: "paused"
    })

    state = updateAudioSourceState(state, {
      ...state.sources.microphone,
      intent: "paused",
      phase: "paused"
    })
    expect(sourceIntentAfterMaster(state)).toEqual({
      microphone: "active",
      system: "active"
    })
  })

  it("retains typed provenance through correction and question editing", () => {
    let state = createInitialAudioSessionState("session-1")
    state = upsertTranscriptSegment(state, {
      schemaVersion: 1,
      id: "segment-1",
      source: "system",
      state: "partial",
      text: "How would you",
      startedAt: "2026-07-31T10:00:00Z",
      revision: 1,
      speaker: defaultSpeaker("system")
    })
    state = upsertTranscriptSegment(state, {
      ...state.segments[0],
      state: "final",
      text: "How would you design a queue?",
      finalizedAt: "2026-07-31T10:00:02Z",
      revision: 2
    })
    state = correctTranscriptSpeaker(state, "segment-1", "Panelist")
    state = setPendingQuestion(state, {
      id: "question-1",
      text: "How would you design a queue?",
      segmentIds: ["segment-1"],
      detectedAt: "2026-07-31T10:00:03Z",
      revision: 1
    })
    state = editPendingQuestion(
      state,
      "How would you design a durable queue?"
    )

    expect(state.segments[0]).toMatchObject({
      revision: 3,
      speaker: {
        label: "Panelist",
        certainty: "certain",
        corrected: true
      }
    })
    expect(state.pendingQuestion).toMatchObject({
      text: "How would you design a durable queue?",
      revision: 2
    })
  })
})
