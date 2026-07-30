import {
  CONTEXT_CATEGORIES,
  ActiveInterviewSession,
  ContextCategory
} from "../../shared/interview"
import { ContextStatusLabel, contextStatusLabel } from "./contextStatus"

export interface ContextDetail {
  readonly label: ContextStatusLabel
  readonly provider: string
  readonly model: string
  readonly mode: string
  readonly lastSuccessfulUpdate?: string
  readonly sourceCounts: Readonly<Record<ContextCategory, number>>
  readonly personalContext: "included" | "coding-excluded"
  readonly usage?: {
    readonly inputTokens: number
    readonly outputTokens: number
  }
  readonly compaction?: {
    readonly reason: string
    readonly reportedAt: string
  }
  readonly issue?: string
}

export function selectContextDetail(
  session: ActiveInterviewSession
): ContextDetail {
  const sourceCounts = Object.fromEntries(
    CONTEXT_CATEGORIES.map((category) => [
      category,
      session.snapshot.context.filter((item) => item.category === category)
        .length
    ])
  ) as Record<ContextCategory, number>
  sourceCounts.transcript += session.artifacts.filter(
    (artifact) => artifact.submitted && artifact.kind === "transcript"
  ).length
  sourceCounts.screenshot += session.artifacts.filter(
    (artifact) => artifact.submitted && artifact.kind === "screenshot"
  ).length
  return {
    label: contextStatusLabel(session),
    provider: session.snapshot.provider,
    model: session.snapshot.model,
    mode: session.snapshot.mode,
    lastSuccessfulUpdate: session.lastSuccessfulContextUpdate,
    sourceCounts,
    personalContext:
      session.snapshot.mode === "coding" ? "coding-excluded" : "included",
    usage: session.providerUsage,
    compaction: session.providerCompaction,
    issue: session.contextIssue
  }
}
