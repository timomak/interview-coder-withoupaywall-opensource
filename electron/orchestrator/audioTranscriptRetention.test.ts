import { describe, expect, it } from "vitest"
import { defaultSpeaker } from "../../src/shared/audio"
import type { ResetArchive } from "../../src/shared/interview"
import {
  MemoryRecordRepository,
  reduceAccepted,
  startedSession
} from "./testSupport"
import type { DeliveryState } from "./contextPolicy"
import {
  ActiveSessionRepository,
  type M04ActiveSnapshot
} from "./sessionRepository"

function sessionWithTranscriptAndScreenshot() {
  let session = startedSession()
  session = reduceAccepted(session, {
    type: "audio-transcript-upserted",
    segment: {
      schemaVersion: 1,
      id: "segment-retention",
      source: "system",
      state: "final",
      text: "FINALIZED_TRANSCRIPT_SECRET",
      startedAt: "2026-07-31T10:00:00.000Z",
      finalizedAt: "2026-07-31T10:00:02.000Z",
      revision: 1,
      speaker: defaultSpeaker("system")
    }
  })
  session = reduceAccepted(session, {
    type: "artifact-staged",
    artifact: {
      id: "screenshot-retained",
      kind: "screenshot",
      finalizedAt: "2026-07-31T10:00:03.000Z",
      content: "ENCRYPTED_SCREENSHOT_REFERENCE"
    }
  })
  session = reduceAccepted(session, {
    type: "artifacts-submitted",
    artifactIds: ["transcript:segment-retention", "screenshot-retained"]
  })
  return {
    ...session,
    compactExchanges: [
      {
        id: "unrelated-exchange",
        prompt: "UNRELATED_PROMPT",
        answer: "UNRELATED_ANSWER"
      }
    ]
  }
}

function delivery(): DeliveryState {
  const evidence = [
    {
      id: "transcript:segment-retention",
      kind: "transcript" as const,
      content: "FINALIZED_TRANSCRIPT_SECRET"
    },
    {
      id: "screenshot-retained",
      kind: "screenshot" as const,
      content: "ENCRYPTED_SCREENSHOT_REFERENCE"
    }
  ]
  return {
    cursor: {
      seeded: true,
      itemRevisions: { instructions: 1 },
      evidenceIds: evidence.map(({ id }) => id)
    },
    pending: {
      attemptId: "retention-attempt",
      packet: {
        kind: "delta",
        items: [
          {
            id: "reference-transcript",
            category: "transcript",
            revision: 1,
            content: "PREEXISTING_CONTEXT"
          }
        ],
        evidence
      },
      cursorAfter: {
        seeded: true,
        itemRevisions: { instructions: 1, "reference-transcript": 1 },
        evidenceIds: evidence.map(({ id }) => id)
      }
    }
  }
}

describe("M-07 finalized transcript retention", () => {
  it("removes generated transcript state from recovery without touching unrelated data", async () => {
    const records = new MemoryRecordRepository<
      M04ActiveSnapshot | ResetArchive
    >()
    const repository = new ActiveSessionRepository(records, () => false)
    const session = sessionWithTranscriptAndScreenshot()

    await repository.save(
      session,
      { mode: "create", id: "provider-conversation-retention" },
      delivery(),
      "2026-07-31T10:00:04.000Z"
    )

    const recovered = await repository.load()
    expect(recovered?.session.audio).toMatchObject({
      status: "microphone-off",
      segments: []
    })
    expect(recovered?.session.audio.pendingQuestion).toBeUndefined()
    expect(recovered?.session.artifacts).toEqual([
      expect.objectContaining({
        id: "screenshot-retained",
        content: "ENCRYPTED_SCREENSHOT_REFERENCE"
      })
    ])
    expect(recovered?.session.acceptedArtifactIds).toEqual([
      "screenshot-retained"
    ])
    expect(recovered?.session.compactExchanges).toEqual(
      session.compactExchanges
    )
    expect(recovered?.delivery.cursor.evidenceIds).toEqual([
      "screenshot-retained"
    ])
    expect(recovered?.delivery.pending?.packet.evidence).toEqual([
      expect.objectContaining({ id: "screenshot-retained" })
    ])
    expect(recovered?.delivery.pending?.packet.items).toEqual(
      delivery().pending?.packet.items
    )
    expect(JSON.stringify(recovered)).not.toContain(
      "FINALIZED_TRANSCRIPT_SECRET"
    )
  })

  it("rewrites retained recovery and strips archives when the preference becomes false", async () => {
    const records = new MemoryRecordRepository<
      M04ActiveSnapshot | ResetArchive
    >()
    let retain = true
    const repository = new ActiveSessionRepository(records, () => retain)
    const session = sessionWithTranscriptAndScreenshot()
    await repository.save(
      session,
      { mode: "resume", id: "provider-conversation-retention" },
      delivery(),
      "2026-07-31T10:00:04.000Z"
    )
    expect(
      JSON.stringify(records.values.get("active-interview-session"))
    ).toContain("FINALIZED_TRANSCRIPT_SECRET")

    retain = false
    await repository.load()
    expect(
      JSON.stringify(records.values.get("active-interview-session"))
    ).not.toContain("FINALIZED_TRANSCRIPT_SECRET")

    await repository.archive({
      sealedAt: "2026-07-31T10:00:05.000Z",
      session
    })
    const archive = records.values.get(`archive:${session.sessionId}`)
    expect(JSON.stringify(archive)).not.toContain("FINALIZED_TRANSCRIPT_SECRET")
    expect(JSON.stringify(archive)).toContain("ENCRYPTED_SCREENSHOT_REFERENCE")
    expect(JSON.stringify(archive)).toContain("UNRELATED_ANSWER")
  })
})
