import type { InterviewMode } from "../../shared/interview"

export const PROMPT_SCHEMA_VERSION = 1 as const
export const PROMPT_MIGRATION = "M-08" as const

export const PROMPT_MODE_SCHEMAS = {
  coding: "coding-response-v1",
  "system-design": "system-design-response-v1",
  behavioral: "behavioral-response-v1"
} as const satisfies Readonly<Record<InterviewMode, string>>

export type PromptModeSchema =
  (typeof PROMPT_MODE_SCHEMAS)[keyof typeof PROMPT_MODE_SCHEMAS]
export type PromptProvenance =
  | "built-in"
  | "duplicate"
  | "guided-chat"
  | "manual-edit"

export interface PromptTemplateV1 {
  readonly schemaVersion: typeof PROMPT_SCHEMA_VERSION
  readonly migration: typeof PROMPT_MIGRATION
  readonly recordType: "template"
  readonly id: string
  readonly kind: "built-in" | "user"
  readonly mode: InterviewMode
  readonly modeSchema: PromptModeSchema
  readonly name: string
  readonly instructions: string
  readonly revision: number
  readonly provenance: PromptProvenance
  readonly updatedAt: string
  readonly duplicatedFrom?: string
}

export interface PromptSelectionV1 {
  readonly schemaVersion: typeof PROMPT_SCHEMA_VERSION
  readonly migration: typeof PROMPT_MIGRATION
  readonly recordType: "selection"
  readonly mode: InterviewMode
  readonly templateId: string
  readonly updatedAt: string
}

export type PromptStoredRecord = PromptTemplateV1 | PromptSelectionV1

export interface PromptSemanticChange {
  readonly field: "name" | "instructions" | "mode"
  readonly before: string
  readonly after: string
}

export interface PromptTemplateDraft {
  readonly source: PromptProvenance
  readonly baseId?: string
  readonly baseRevision: number
  readonly candidate: PromptTemplateV1
  readonly changes: readonly PromptSemanticChange[]
}

export interface ReviewedPromptChange {
  readonly schemaVersion: 1
  readonly kind: "reviewed-prompt-change"
  readonly draft: PromptTemplateDraft
  readonly reviewedAt: string
  readonly digest: string
}

export interface PromptResolutionContender {
  readonly id: string
  readonly revision: number
  readonly topic: string
  readonly relevance: number
  readonly specificity: number
  readonly observedAt: string
  readonly provenance: "system" | "built-in" | "user"
  readonly applicableModes: readonly InterviewMode[]
  readonly directive: string
}

export interface PromptResolutionDecision {
  readonly topic: string
  readonly winnerId: string
  readonly winnerRevision: number
  readonly contenderIds: readonly string[]
  readonly factors: readonly [
    "relevance",
    "specificity",
    "recency",
    "provenance",
    "mode-applicability"
  ]
}

export interface PromptResolutionRecord {
  readonly schemaVersion: 1
  readonly mode: InterviewMode
  readonly resolvedAt: string
  readonly decisions: readonly PromptResolutionDecision[]
}

export interface PromptSessionSnapshot {
  readonly schemaVersion: 1
  readonly templateId: string
  readonly templateRevision: number
  readonly mode: InterviewMode
  readonly modeSchema: PromptModeSchema
  readonly name: string
  readonly instructions: string
  readonly resolution: PromptResolutionRecord
}

export interface PromptCatalog {
  readonly templates: readonly PromptTemplateV1[]
  readonly selections: Readonly<Record<InterviewMode, string>>
  readonly quarantine: readonly {
    readonly recordId: string
    readonly reason: "malformed" | "newer-version" | "storage-error"
  }[]
}
