import type {
  ActiveInterviewSession,
  ResetArchive
} from "../../src/shared/interview"
import type { RecordRepository } from "../storage"

export const M04_SCHEMA_VERSION = 1 as const
const ACTIVE_RECORD_ID = "active-interview-session"
const ACTIVE_RECORD_TYPE = "application/vnd.interviewcopilot.m04+json"
const ARCHIVE_RECORD_TYPE = "application/vnd.interviewcopilot.session-archive+json"

export interface M04ActiveSnapshot {
  readonly schemaVersion: typeof M04_SCHEMA_VERSION
  readonly migration: "M-04"
  readonly savedAt: string
  readonly session: ActiveInterviewSession
  readonly opaqueProviderConversationId: string
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
    typeof candidate.opaqueProviderConversationId !== "string" ||
    candidate.opaqueProviderConversationId.length < 8 ||
    candidate.captureActive !== false ||
    candidate.session?.lifecycle !== "active"
  ) {
    throw new Error("M-04 snapshot is invalid")
  }
  return candidate as M04ActiveSnapshot
}

export class ActiveSessionRepository {
  constructor(
    private readonly records: RecordRepository<
      M04ActiveSnapshot | ResetArchive
    >
  ) {}

  async save(
    session: ActiveInterviewSession,
    opaqueProviderConversationId: string,
    savedAt: string
  ): Promise<void> {
    await this.records.put(
      ACTIVE_RECORD_ID,
      {
        schemaVersion: M04_SCHEMA_VERSION,
        migration: "M-04",
        savedAt,
        session: { ...session, captureActive: false },
        opaqueProviderConversationId,
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
