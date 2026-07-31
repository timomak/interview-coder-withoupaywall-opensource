import type {
  ActiveInterviewSession,
  InterviewMode,
  ResetArchive
} from "../../shared/interview"
import type { ProviderId, ResponseMode } from "../../shared/provider"

export const HISTORY_SCHEMA_VERSION = 1 as const
export const HISTORY_MIGRATION = "M-09" as const
export const MAX_HISTORY_EXPORT_SCREENSHOT_BYTES = 16 * 1024 * 1024
export const MAX_HISTORY_EXPORT_SCREENSHOT_TOTAL_BYTES = 128 * 1024 * 1024

export interface HistoryScreenshotV1 {
  readonly id: string
  readonly contentType: "image/png"
  readonly dataUrl: string
}
export interface HistoryArchiveV1 {
  readonly schemaVersion: typeof HISTORY_SCHEMA_VERSION
  readonly migration: typeof HISTORY_MIGRATION
  readonly recordType: "archive-projection"
  readonly sessionId: string
  readonly startedAt: string
  readonly sealedAt: string
  readonly mode: InterviewMode
  readonly provider: ProviderId
  readonly model: string
  readonly responseMode: ResponseMode
  readonly language: string
  readonly session: ActiveInterviewSession
  readonly screenshots: readonly HistoryScreenshotV1[]
  readonly source: ResetArchive
  readonly extensions: Readonly<Record<string, unknown>>
}

export interface HistorySummaryV1 {
  readonly schemaVersion: typeof HISTORY_SCHEMA_VERSION
  readonly migration: typeof HISTORY_MIGRATION
  readonly recordType: "summary"
  readonly sessionId: string
  readonly startedAt: string
  readonly sealedAt: string
  readonly mode: InterviewMode
  readonly provider: ProviderId
  readonly model: string
  readonly title: string
  readonly searchText: string
}

export interface HistoryCatalog {
  readonly entries: readonly HistorySummaryV1[]
  readonly issues: readonly { readonly recordId: string; readonly reason: string }[]
}

export interface HistoryExportRequest {
  readonly sessionId: string
  readonly format: "markdown" | "json"
  readonly destination: string
  readonly disclosureAccepted: true
  readonly overwriteConfirmed: boolean
}

export interface HistoryDeleteRequest {
  readonly scope: "selected" | "all"
  readonly sessionIds: readonly string[]
  readonly confirmed: true
}

export interface HistoryExportReceipt {
  readonly schemaVersion: 1
  readonly sessionId: string
  readonly format: "markdown" | "json"
  readonly destination: string
  readonly files: readonly string[]
}
