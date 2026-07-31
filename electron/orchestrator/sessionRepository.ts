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
    >
  ) {}

  async save(
    session: ActiveInterviewSession,
    providerConversation: M04ActiveSnapshot["providerConversation"],
    delivery: DeliveryState,
    savedAt: string
  ): Promise<void> {
    await this.records.put(
      ACTIVE_RECORD_ID,
      {
        schemaVersion: M04_SCHEMA_VERSION,
        migration: "M-04",
        savedAt,
        session: {
          ...session,
          captureActive: false,
          audio: audioStateForRecovery(session.audio, session.sessionId)
        },
        providerConversation: structuredClone(providerConversation),
        delivery: structuredClone(delivery),
        captureActive: false
      },
      ACTIVE_RECORD_TYPE
    )
  }

  async load(): Promise<M04ActiveSnapshot | undefined> {
    const value = await this.records.get(ACTIVE_RECORD_ID, ACTIVE_RECORD_TYPE)
    return value === undefined ? undefined : validateM04(value)
  }

  async archive(archive: ResetArchive): Promise<void> {
    await this.records.put(
      `archive:${archive.session.sessionId}`,
      archive,
      ARCHIVE_RECORD_TYPE
    )
    await this.records.remove(ACTIVE_RECORD_ID)
  }

  async discard(): Promise<void> {
    await this.records.remove(ACTIVE_RECORD_ID)
  }
}
