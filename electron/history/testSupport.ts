import type { ResetArchive } from "../../src/shared/interview"
import { createInitialAudioSessionState } from "../../src/shared/audio"
import { defaultBuiltIn } from "../../src/features/prompts/model"
import { resolvePromptInstructions } from "../../src/features/prompts/resolution"
import { startedSession } from "../orchestrator/testSupport"

export function historyFixture(
  sessionId = "history-session-001",
  marker = "HISTORY_SEARCH_MARKER"
): ResetArchive {
  const base = startedSession()
  const builtIn = defaultBuiltIn("system-design")
  const resolved = resolvePromptInstructions("system-design", [], "2026-07-31T10:00:00.000Z")
  return {
    sealedAt: "2026-07-31T10:30:00.000Z",
    session: {
      ...base,
      sessionId,
      captureActive: false,
      snapshot: {
        ...base.snapshot,
        template: {
          schemaVersion: 1,
          templateId: builtIn.id,
          templateRevision: builtIn.revision,
          mode: builtIn.mode,
          modeSchema: builtIn.modeSchema,
          name: builtIn.name,
          instructions: builtIn.instructions,
          resolution: resolved.record
        }
      },
      audio: {
        ...createInitialAudioSessionState(sessionId),
        segments: [
          {
            schemaVersion: 1,
            id: "segment-1",
            source: "system",
            state: "final",
            text: `Interviewer asks ${marker}`,
            startedAt: "2026-07-31T10:01:00.000Z",
            finalizedAt: "2026-07-31T10:01:02.000Z",
            revision: 1,
            speaker: { label: "INTERVIEWER", certainty: "default", corrected: false }
          }
        ],
        pendingQuestion: {
          id: "question-1",
          text: `Design ${marker}`,
          segmentIds: ["segment-1"],
          detectedAt: "2026-07-31T10:01:02.000Z",
          revision: 1
        }
      },
      artifacts: [
        {
          id: "transcript:segment-1",
          kind: "transcript",
          finalizedAt: "2026-07-31T10:01:02.000Z",
          content: marker,
          selected: true,
          submitted: true
        },
        {
          id: "screenshot:one",
          kind: "screenshot",
          finalizedAt: "2026-07-31T10:02:00.000Z",
          content: `data:image/png;base64,${Buffer.from("PNG_FIXTURE").toString("base64")}`,
          selected: true,
          submitted: true
        }
      ],
      sections: [
        { id: "architecture", order: 0, body: `Architecture ${marker}`, state: "complete" },
        { id: "code", order: 1, body: "const safe = true", state: "complete" },
        { id: "diagram", order: 2, body: "Client -> Service", state: "complete" },
        { id: "summary", order: 3, body: "Trade-off summary", state: "complete" }
      ],
      compactExchanges: [
        { id: "follow-up-1", prompt: "Constraint: multi-region", answer: "Use failover." }
      ]
    }
  }
}
