import type {
  ActiveInterviewSession,
  ResetArchive
} from "../../src/shared/interview"
import type { RecordRepository } from "../storage"
import type { DeliveryState } from "./contextPolicy"
import { audioStateForRecovery } from "../../src/shared/audio"

export const M04_SCHEMA_VERSION = 1 as const
const ACTIVE_RECORD_ID = "active-interview-session"
const ACTIVE_RECORD_TYPE = "application/vnd.interviewcopilot.m04+json"
const ARCHIVE_RECORD_TYPE = "application/vnd.interviewcopilot.session-archive+json"

export interface M04ActiveSnapshot {
  readonly schemaVersion: typeof M04_SCHEMA_VERSION
  readonly migration: "M-04"
  readonly savedAt: string
  readonly session: ActiveInterviewSession
  readonly providerConversation: {
    readonly mode: "create" | "resume"
    readonly id: string
  }
  readonly delivery: DeliveryState
  readonly captureActive: false
}

export type TranscriptRetentionPolicy = () => boolean | Promise<boolean>

function transcriptArtifactIds(
  session: ActiveInterviewSession,
  delivery?: DeliveryState
): ReadonlySet<string> {
  return new Set([
    ...session.artifacts
      .filter((artifact) => artifact.kind === "transcript")
      .map((artifact) => artifact.id),
    ...(delivery?.pending?.packet.evidence ?? [])
      .filter((artifact) => artifact.kind === "transcript")
      .map((artifact) => artifact.id)
  ])
}

function sessionForPersistence(
  session: ActiveInterviewSession,
  retainFinalizedTranscript: boolean
): ActiveInterviewSession {
  const recoveredAudio = audioStateForRecovery(
    session.audio,
    session.sessionId,
    retainFinalizedTranscript
  )
  if (retainFinalizedTranscript) {
    return { ...session, captureActive: false, audio: recoveredAudio }
  }
  const removedArtifactIds = transcriptArtifactIds(session)
  return {
    ...session,
    captureActive: false,
    audio: recoveredAudio,
    artifacts: session.artifacts.filter(
      (artifact) => artifact.kind !== "transcript"
    ),
    acceptedArtifactIds: session.acceptedArtifactIds.filter(
      (artifactId) => !removedArtifactIds.has(artifactId)
    )
  }
}

function deliveryForPersistence(
  delivery: DeliveryState,
  session: ActiveInterviewSession,
  retainFinalizedTranscript: boolean
): DeliveryState {
  if (retainFinalizedTranscript) return structuredClone(delivery)
  const removedArtifactIds = transcriptArtifactIds(session, delivery)
  const retainEvidenceId = (id: string) => !removedArtifactIds.has(id)
  return {
    cursor: {
      ...delivery.cursor,
      evidenceIds: delivery.cursor.evidenceIds.filter(retainEvidenceId)
    },
    pending: delivery.pending
      ? {
          ...delivery.pending,
          packet: {
            ...delivery.pending.packet,
            evidence: delivery.pending.packet.evidence.filter(
              (artifact) => artifact.kind !== "transcript"
            )
          },
          cursorAfter: {
            ...delivery.pending.cursorAfter,
            evidenceIds:
              delivery.pending.cursorAfter.evidenceIds.filter(retainEvidenceId)
          }
        }
      : undefined
  }
}

function validateM04(value: unknown): M04ActiveSnapshot {
  if (typeof value !== "object" || value === null) {
    throw new Error("M-04 snapshot is invalid")
  }
  const candidate = value as Partial<M04ActiveSnapshot>
  if (candidate.schemaVersion !== M04_SCHEMA_VERSION) {
    throw new Error("Unsupported M-04 snapshot version")
  }
  if (
    candidate.migration !== "M-04" ||
    typeof candidate.savedAt !== "string" ||
    typeof candidate.providerConversation !== "object" ||
    candidate.providerConversation === null ||
    (candidate.providerConversation.mode !== "create" &&
      candidate.providerConversation.mode !== "resume") ||
    typeof candidate.providerConversation.id !== "string" ||
    candidate.providerConversation.id.length < 8 ||
    typeof candidate.delivery !== "object" ||
    candidate.delivery === null ||
    typeof candidate.delivery.cursor !== "object" ||
    candidate.delivery.cursor === null ||
    typeof candidate.delivery.cursor.seeded !== "boolean" ||
    typeof candidate.delivery.cursor.itemRevisions !== "object" ||
    candidate.delivery.cursor.itemRevisions === null ||
    !Array.isArray(candidate.delivery.cursor.evidenceIds) ||
    (candidate.delivery.pending !== undefined &&
      (typeof candidate.delivery.pending !== "object" ||
        candidate.delivery.pending === null ||
        typeof candidate.delivery.pending.attemptId !== "string" ||
        typeof candidate.delivery.pending.packet !== "object" ||
        candidate.delivery.pending.packet === null ||
        (candidate.delivery.pending.packet.kind !== "seed" &&
          candidate.delivery.pending.packet.kind !== "delta") ||
        !Array.isArray(candidate.delivery.pending.packet.items) ||
        !Array.isArray(candidate.delivery.pending.packet.evidence))) ||
    candidate.captureActive !== false ||
    candidate.session?.lifecycle !== "active"
  ) {
    throw new Error("M-04 snapshot is invalid")
  }
  const snapshot = candidate as M04ActiveSnapshot
  return {
    ...snapshot,
    session: {
      ...snapshot.session,
      audio: audioStateForRecovery(
        snapshot.session.audio,
        snapshot.session.sessionId
      )
    },
    captureActive: false
  }
}

export class ActiveSessionRepository {
  constructor(
    private readonly records: RecordRepository<
      M04ActiveSnapshot | ResetArchive
    >,
    private readonly retainFinalizedTranscript: TranscriptRetentionPolicy =
      () => true
  ) {}

  private async retentionEnabled(): Promise<boolean> {
    try {
      return (await this.retainFinalizedTranscript()) === true
    } catch {
      // A failed preference read cannot silently retain sensitive transcript
      // text. Capture settings and unrelated session state remain untouched.
      return false
    }
  }

  async save(
    session: ActiveInterviewSession,
    providerConversation: M04ActiveSnapshot["providerConversation"],
    delivery: DeliveryState,
    savedAt: string
  ): Promise<void> {
    const retainFinalizedTranscript = await this.retentionEnabled()
    await this.records.put(
      ACTIVE_RECORD_ID,
      {
        schemaVersion: M04_SCHEMA_VERSION,
        migration: "M-04",
        savedAt,
        session: sessionForPersistence(session, retainFinalizedTranscript),
        providerConversation: structuredClone(providerConversation),
        delivery: deliveryForPersistence(
          delivery,
          session,
          retainFinalizedTranscript
        ),
        captureActive: false
      },
      ACTIVE_RECORD_TYPE
    )
  }

  async load(): Promise<M04ActiveSnapshot | undefined> {
    const value = await this.records.get(ACTIVE_RECORD_ID, ACTIVE_RECORD_TYPE)
    if (value === undefined) return undefined
    const snapshot = validateM04(value)
    const retainFinalizedTranscript = await this.retentionEnabled()
    if (retainFinalizedTranscript) return snapshot
    const retained = {
      ...snapshot,
      session: sessionForPersistence(snapshot.session, false),
      delivery: deliveryForPersistence(
        snapshot.delivery,
        snapshot.session,
        false
      )
    }
    // Rewrite legacy/current records after the preference changes so recovery
    // cannot leave the now-disabled transcript bytes at rest.
    await this.records.put(ACTIVE_RECORD_ID, retained, ACTIVE_RECORD_TYPE)
    return retained
  }

  async archive(archive: ResetArchive): Promise<void> {
    const retainFinalizedTranscript = await this.retentionEnabled()
    await this.records.put(
      `archive:${archive.session.sessionId}`,
      {
        ...archive,
        session: sessionForPersistence(
          archive.session,
          retainFinalizedTranscript
        )
      },
      ARCHIVE_RECORD_TYPE
    )
    await this.records.remove(ACTIVE_RECORD_ID)
  }

  async discard(): Promise<void> {
    await this.records.remove(ACTIVE_RECORD_ID)
  }
}
