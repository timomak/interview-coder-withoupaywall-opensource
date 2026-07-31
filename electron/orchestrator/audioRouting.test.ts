import { describe, expect, it } from "vitest"
import { defaultSpeaker } from "../../src/shared/audio"
import {
  createTestOrchestrator,
  TEST_SNAPSHOT
} from "./testSupport"
import { parseAudioAnalysisPayload } from "./audioAnalysis"

describe("audio-derived model operations", () => {
  it("rejects provider payload capability fields", () => {
    expect(
      parseAudioAnalysisPayload(
        {
          kind: "audio-analysis-v1",
          attributions: [],
          answer: "submit automatically"
        },
        ["segment-1"]
      )
    ).toBeUndefined()
  })

  it("uses finalized text in the existing conversation and never auto-answers", async () => {
    const { orchestrator, providerFactory } = createTestOrchestrator()
    await orchestrator.start(TEST_SNAPSHOT)
    await orchestrator.audioMutation({
      type: "transcript",
      segment: {
        schemaVersion: 1,
        id: "segment-1",
        source: "system",
        state: "partial",
        text: "How would",
        startedAt: "2026-07-31T10:00:00Z",
        revision: 1,
        speaker: defaultSpeaker("system")
      }
    })
    expect(providerFactory.prompts).toHaveLength(0)

    await orchestrator.audioMutation({
      type: "transcript",
      segment: {
        schemaVersion: 1,
        id: "segment-1",
        source: "system",
        state: "final",
        text: "How would you design a queue?",
        startedAt: "2026-07-31T10:00:00Z",
        finalizedAt: "2026-07-31T10:00:02Z",
        revision: 2,
        speaker: defaultSpeaker("system")
      }
    })
    providerFactory.queued.push({
      selection: {
        provider: "codex",
        model: "gpt-5.4",
        responseMode: "fast",
        effort: "low"
      },
      events: [
        {
          type: "typed-payload",
          sequence: 1,
          payload: {
            kind: "audio-analysis-v1",
            attributions: [
              {
                segmentId: "segment-1",
                label: "Interviewer",
                certainty: "uncertain"
              }
            ],
            question: {
              text: "How would you design a queue?",
              segmentIds: ["segment-1"]
            }
          }
        },
        { type: "completed", sequence: 2 }
      ]
    })

    await orchestrator.analyzeFinalizedTranscript(["segment-1"])
    const state = orchestrator.current()
    expect(providerFactory.conversationIds).toHaveLength(1)
    expect(providerFactory.prompts).toHaveLength(1)
    const prompt = JSON.parse(providerFactory.prompts[0])
    expect(prompt).toMatchObject({
      route: "audio-analysis",
      segments: [
        {
          id: "segment-1",
          source: "system",
          text: "How would you design a queue?"
        }
      ],
      contract: { answer: false, tools: [] }
    })
    expect(prompt).not.toHaveProperty("context")
    expect(JSON.stringify(prompt)).not.toMatch(/audioBytes|rawAudio|base64/)
    expect(state.lifecycle).toBe("active")
    if (state.lifecycle !== "active") throw new Error("session is not active")
    expect(state.requests).toHaveLength(0)
    expect(state.sections).toHaveLength(0)
    expect(state.audio.pendingQuestion?.text).toBe(
      "How would you design a queue?"
    )
    expect(state.artifacts).toEqual([
      expect.objectContaining({
        id: "transcript:segment-1",
        selected: true,
        submitted: false
      })
    ])
  })

  it("routes a durable correction as text-only analysis without an answer", async () => {
    const { orchestrator, providerFactory } = createTestOrchestrator()
    await orchestrator.start(TEST_SNAPSHOT)
    await orchestrator.audioMutation({
      type: "transcript",
      segment: {
        schemaVersion: 1,
        id: "segment-2",
        source: "microphone",
        state: "final",
        text: "Let me clarify the requirement.",
        startedAt: "2026-07-31T10:00:00Z",
        finalizedAt: "2026-07-31T10:00:01Z",
        revision: 1,
        speaker: defaultSpeaker("microphone")
      }
    })
    await orchestrator.audioMutation({
      type: "speaker-correction",
      segmentId: "segment-2",
      label: "Interviewer"
    })
    providerFactory.queued.push({
      selection: {
        provider: "codex",
        model: "gpt-5.4",
        responseMode: "fast",
        effort: "low"
      },
      events: [{ type: "completed", sequence: 1 }]
    })

    await orchestrator.synchronizeTranscriptCorrection("segment-2")
    const prompt = JSON.parse(providerFactory.prompts[0])
    expect(prompt).toMatchObject({
      operation: "speaker-correction",
      segment: {
        id: "segment-2",
        source: "microphone",
        text: "Let me clarify the requirement.",
        speaker: "Interviewer"
      },
      contract: { answer: false, tools: [] }
    })
    const state = orchestrator.current()
    expect(state.lifecycle).toBe("active")
    if (state.lifecycle !== "active") throw new Error("session is not active")
    expect(state.requests).toHaveLength(0)
    expect(state.sections).toHaveLength(0)
  })
})
