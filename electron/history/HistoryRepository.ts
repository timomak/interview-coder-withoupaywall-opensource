import type { ResetArchive } from "../../src/shared/interview"
import {
  isHistoryArchive,
  projectHistoryArchive,
  summarizeHistory
} from "../../src/features/history/model"
import type {
  HistoryArchiveV1,
  HistoryCatalog
} from "../../src/features/history/types"
import type { RecordRepository } from "../storage"

export const ACTIVE_SESSION_RECORD_ID = "active-interview-session"
export const archiveRecordId = (sessionId: string) => `archive:${sessionId}`
const HISTORY_RECORD_TYPE = "application/vnd.interviewcopilot.m09+json"

function isResetArchive(value: unknown): value is ResetArchive {
  if (typeof value !== "object" || value === null) return false
  const candidate = value as Partial<ResetArchive>
  return (
    typeof candidate.sealedAt === "string" &&
    candidate.session?.lifecycle === "active" &&
    typeof candidate.session.sessionId === "string" &&
    candidate.session.captureActive === false
  )
}

export class HistoryRepository {
  constructor(
    private readonly canonical: RecordRepository<object>,
    private readonly projections: RecordRepository<HistoryArchiveV1 | object>
  ) {}

  async rebuild(): Promise<HistoryCatalog> {
    const canonicalScan = await this.canonical.all()
    const projectionScan = await this.projections.all()
    const canonicalSessionIds = new Set<string>()
    const issues: HistoryCatalog["issues"][number][] = [
      ...canonicalScan.issues.map((issue) => ({
        recordId: issue.file,
        reason: issue.error.message
      })),
      ...projectionScan.issues.map((issue) => ({
        recordId: issue.file,
        reason: issue.error.message
      }))
    ]

    for (const { id, value } of canonicalScan.records) {
      if (!id.startsWith("archive:")) continue
      if (!isResetArchive(value) || id !== archiveRecordId(value.session.sessionId)) {
        issues.push({ recordId: id, reason: "Malformed canonical archive" })
        continue
      }
      canonicalSessionIds.add(value.session.sessionId)
      try {
        await this.projections.put(
          value.session.sessionId,
          projectHistoryArchive(value),
          HISTORY_RECORD_TYPE
        )
      } catch (error) {
        issues.push({
          recordId: id,
          reason: error instanceof Error ? error.message : "Projection failed"
        })
      }
    }

    for (const { id } of projectionScan.records) {
      if (!canonicalSessionIds.has(id)) await this.projections.remove(id)
    }

    const refreshed = await this.projections.all()
    return {
      entries: refreshed.records
        .filter((item): item is { id: string; value: HistoryArchiveV1 } =>
          isHistoryArchive(item.value)
        )
        .map(({ value }) => summarizeHistory(value))
        .sort((left, right) =>
          right.sealedAt.localeCompare(left.sealedAt, "en-US")
        ),
      issues
    }
  }

  async search(query: string): Promise<HistoryCatalog> {
    const catalog = await this.rebuild()
    const normalized = query.normalize("NFC").trim().toLocaleLowerCase("en-US")
    if (!normalized) return catalog
    return {
      ...catalog,
      entries: catalog.entries.filter((entry) =>
        entry.searchText.includes(normalized)
      )
    }
  }

  async open(sessionId: string): Promise<HistoryArchiveV1> {
    await this.rebuild()
    const value = await this.projections.get(sessionId, HISTORY_RECORD_TYPE)
    if (!isHistoryArchive(value) || value.sessionId !== sessionId) {
      throw new Error("Archived session is unavailable")
    }
    return structuredClone(value)
  }

  async removeCanonical(sessionId: string): Promise<void> {
    await this.canonical.remove(archiveRecordId(sessionId))
  }

  async removeProjection(sessionId: string): Promise<void> {
    await this.projections.remove(sessionId)
  }
}
