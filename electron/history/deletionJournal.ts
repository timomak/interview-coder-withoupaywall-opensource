import type { RecordRepository } from "../storage"
import { randomUUID } from "node:crypto"
import { HISTORY_MIGRATION } from "../../src/features/history/types"
import type { HistoryRepository } from "./HistoryRepository"

const JOURNAL_ID = "history-delete-journal-v1"
const JOURNAL_TYPE = "application/vnd.interviewcopilot.m09-delete-journal+json"

export type DeleteBoundary =
  | "intent-saved"
  | "before-canonical-delete"
  | "after-canonical-delete"
  | "before-projection-delete"
  | "after-projection-delete"
  | "cursor-saved"
  | "complete"

export interface HistoryDeleteJournalV1 {
  readonly schemaVersion: 1
  readonly migration: typeof HISTORY_MIGRATION
  readonly operation: "delete-history"
  readonly operationId: string
  readonly targets: readonly string[]
  readonly cursor: number
  readonly startedAt: string
}

function validate(value: unknown): HistoryDeleteJournalV1 {
  if (typeof value !== "object" || value === null) throw new Error("Delete journal is malformed")
  const candidate = value as Partial<HistoryDeleteJournalV1>
  if (
    candidate.schemaVersion !== 1 ||
    candidate.migration !== HISTORY_MIGRATION ||
    candidate.operation !== "delete-history" ||
    typeof candidate.operationId !== "string" ||
    candidate.operationId.length === 0 ||
    !Array.isArray(candidate.targets) ||
    candidate.targets.some((id) => typeof id !== "string" || id.length === 0) ||
    new Set(candidate.targets).size !== candidate.targets.length ||
    !Number.isSafeInteger(candidate.cursor) ||
    candidate.cursor! < 0 ||
    candidate.cursor! > candidate.targets.length ||
    typeof candidate.startedAt !== "string"
  ) throw new Error("Delete journal is malformed")
  return candidate as HistoryDeleteJournalV1
}

export class HistoryDeletionJournal {
  private tail = Promise.resolve()

  constructor(
    private readonly records: RecordRepository<HistoryDeleteJournalV1>,
    private readonly history: HistoryRepository,
    private readonly now: () => string = () => new Date().toISOString(),
    private readonly checkpoint?: (boundary: DeleteBoundary) => void | Promise<void>
  ) {}

  delete(sessionIds: readonly string[]): Promise<void> {
    return this.exclusive(async () => {
      await this.resumeUnlocked()
      await this.deleteUnlocked(sessionIds)
    })
  }

  resume(): Promise<void> {
    return this.exclusive(() => this.resumeUnlocked())
  }

  private exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.tail.then(operation, operation)
    this.tail = result.then(() => undefined, () => undefined)
    return result
  }

  private async deleteUnlocked(sessionIds: readonly string[]): Promise<void> {
    const targets = [...new Set(sessionIds)]
    if (targets.length === 0) return
    const journal: HistoryDeleteJournalV1 = {
      schemaVersion: 1,
      migration: HISTORY_MIGRATION,
      operation: "delete-history",
      operationId: randomUUID(),
      targets,
      cursor: 0,
      startedAt: this.now()
    }
    await this.records.put(JOURNAL_ID, journal, JOURNAL_TYPE)
    await this.checkpoint?.("intent-saved")
    await this.run(journal)
  }

  private async resumeUnlocked(): Promise<void> {
    const journal = await this.records.get(JOURNAL_ID, JOURNAL_TYPE)
    if (journal) await this.run(validate(journal))
  }

  private async run(initial: HistoryDeleteJournalV1): Promise<void> {
    let journal = initial
    for (let index = journal.cursor; index < journal.targets.length; index += 1) {
      const sessionId = journal.targets[index]
      await this.checkpoint?.("before-canonical-delete")
      await this.history.removeCanonical(sessionId)
      await this.checkpoint?.("after-canonical-delete")
      await this.checkpoint?.("before-projection-delete")
      await this.history.removeProjection(sessionId)
      await this.checkpoint?.("after-projection-delete")
      journal = { ...journal, cursor: index + 1 }
      await this.records.put(JOURNAL_ID, journal, JOURNAL_TYPE)
      await this.checkpoint?.("cursor-saved")
    }
    await this.records.remove(JOURNAL_ID)
    await this.checkpoint?.("complete")
  }
}
