import type {
  ProviderId,
  ResponseMode
} from "../provider"

export const INTERVIEW_MODES = [
  "coding",
  "system-design",
  "behavioral"
] as const

export type InterviewMode = (typeof INTERVIEW_MODES)[number]

export const CONTEXT_CATEGORIES = [
  "instructions",
  "transcript",
  "screenshot",
  "profile",
  "opportunity"
] as const

export type ContextCategory = (typeof CONTEXT_CATEGORIES)[number]

export interface ContextItem {
  readonly id: string
  readonly category: ContextCategory
  readonly revision: number
  readonly content: string
}

export interface StartSnapshot {
  readonly mode: InterviewMode
  readonly provider: ProviderId
  readonly model: string
  readonly responseMode: ResponseMode
  readonly language: string
  readonly context: readonly ContextItem[]
}

export type ArtifactKind = "transcript" | "screenshot"

export interface EvidenceArtifact {
  readonly id: string
  readonly kind: ArtifactKind
  readonly finalizedAt: string
  readonly content: string
  readonly selected: boolean
  readonly submitted: boolean
}

export type ContextSyncPhase = "new" | "updating" | "full" | "issue"

export interface ProviderUsage {
  readonly inputTokens: number
  readonly outputTokens: number
}

export interface ProviderCompaction {
  readonly reason: string
  readonly reportedAt: string
}

export interface ResponseSection {
  readonly id: string
  readonly order: number
  readonly body: string
  readonly state: "partial" | "complete"
}

export interface ResponseRequest {
  readonly id: string
  readonly sectionIds: readonly string[]
  readonly cancelled: boolean
  readonly completed: boolean
}

export interface CompactExchange {
  readonly id: string
  readonly prompt: string
  readonly answer: string
}

export interface ActiveInterviewSession {
  readonly schemaVersion: 1
  readonly lifecycle: "active"
  readonly sessionId: string
  readonly sequence: number
  readonly seenEventIds: readonly string[]
  readonly startedAt: string
  readonly preferences: Readonly<Record<string, string>>
  readonly reusableRecordIds: readonly string[]
  readonly snapshot: StartSnapshot
  readonly contextPhase: ContextSyncPhase
  readonly contextIssue?: string
  readonly lastSuccessfulContextUpdate?: string
  readonly providerUsage?: ProviderUsage
  readonly providerCompaction?: ProviderCompaction
  readonly artifacts: readonly EvidenceArtifact[]
  readonly acceptedArtifactIds: readonly string[]
  readonly sections: readonly ResponseSection[]
  readonly requests: readonly ResponseRequest[]
  readonly compactExchanges: readonly CompactExchange[]
  readonly captureActive: boolean
}

export interface ResetArchive {
  readonly sealedAt: string
  readonly session: ActiveInterviewSession
}

export interface IdleInterviewSession {
  readonly schemaVersion: 1
  readonly lifecycle: "idle"
  readonly preferences: Readonly<Record<string, string>>
  readonly reusableRecordIds: readonly string[]
  readonly lastArchive?: ResetArchive
}

export type InterviewSession = IdleInterviewSession | ActiveInterviewSession

interface EventEnvelope {
  readonly eventId: string
  readonly sessionId: string
  readonly sequence: number
  readonly at: string
}

export type InterviewSessionEvent =
  | (EventEnvelope & {
      readonly type: "start"
      readonly snapshot: StartSnapshot
    })
  | (EventEnvelope & {
      readonly type: "context-update-started"
    })
  | (EventEnvelope & {
      readonly type: "context-update-succeeded"
      readonly usage?: ProviderUsage
      readonly compaction?: ProviderCompaction
    })
  | (EventEnvelope & {
      readonly type: "context-update-failed"
      readonly detail: string
    })
  | (EventEnvelope & {
      readonly type: "artifact-staged"
      readonly artifact: Omit<EvidenceArtifact, "selected" | "submitted">
    })
  | (EventEnvelope & {
      readonly type: "artifact-selection-changed"
      readonly artifactId: string
      readonly selected: boolean
    })
  | (EventEnvelope & {
      readonly type: "artifacts-submitted"
      readonly artifactIds: readonly string[]
    })
  | (EventEnvelope & {
      readonly type: "request-started"
      readonly requestId: string
      readonly sectionIds: readonly string[]
    })
  | (EventEnvelope & {
      readonly type: "section-delta"
      readonly requestId: string
      readonly sectionId: string
      readonly delta: string
      readonly complete: boolean
    })
  | (EventEnvelope & {
      readonly type: "request-cancelled"
      readonly requestId: string
    })
  | (EventEnvelope & {
      readonly type: "request-continued"
      readonly requestId: string
      readonly unfinishedSectionIds: readonly string[]
    })
  | (EventEnvelope & {
      readonly type: "compact-exchange-added"
      readonly exchange: CompactExchange
    })
  | (EventEnvelope & {
      readonly type: "sections-corrected"
      readonly replacements: Readonly<Record<string, string>>
      readonly changedSectionIds: readonly string[]
    })
  | (EventEnvelope & {
      readonly type: "capture-state-changed"
      readonly active: boolean
    })
  | (EventEnvelope & {
      readonly type: "reset"
    })

export type InterviewCommand =
  | {
      readonly type: "start"
      readonly snapshot: StartSnapshot
    }
  | {
      readonly type: "stage-artifact"
      readonly artifact: Omit<EvidenceArtifact, "selected" | "submitted">
    }
  | {
      readonly type: "select-artifact"
      readonly artifactId: string
      readonly selected: boolean
    }
  | {
      readonly type: "submit"
      readonly route: "mode-action" | "chat" | "clarification" | "correction"
      readonly input: string
      readonly sectionIds?: readonly string[]
    }
  | { readonly type: "cancel"; readonly requestId: string }
  | { readonly type: "continue"; readonly requestId: string }
  | { readonly type: "reset" }
  | { readonly type: "resume" }

export interface CommandResult {
  readonly ok: boolean
  readonly state: InterviewSession
  readonly error?: string
}

export interface RecoveryChoice {
  readonly available: boolean
  readonly sessionId?: string
  readonly captureActive: false
}

export const INTERVIEW_STATE_EVENT = "interview:state" as const
export const INTERVIEW_COMMAND_CHANNEL = "interview:command" as const
export const INTERVIEW_STATE_CHANNEL = "interview:get-state" as const
export const INTERVIEW_RECOVERY_CHANNEL = "interview:get-recovery" as const
