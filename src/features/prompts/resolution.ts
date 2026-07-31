import type { InterviewMode } from "../../shared/interview"
import type {
  PromptResolutionContender,
  PromptResolutionRecord
} from "./types"

const PROVENANCE_RANK = { system: 3, "built-in": 2, user: 1 } as const

export function resolvePromptInstructions(
  mode: InterviewMode,
  contenders: readonly PromptResolutionContender[],
  resolvedAt: string
): { readonly instructions: readonly string[]; readonly record: PromptResolutionRecord } {
  const applicable = contenders.filter((candidate) =>
    candidate.applicableModes.includes(mode)
  )
  const topics = [...new Set(applicable.map((candidate) => candidate.topic))].sort()
  const winners = topics.map((topic) => {
    const candidates = applicable
      .filter((candidate) => candidate.topic === topic)
      .sort(
        (left, right) =>
          right.relevance - left.relevance ||
          right.specificity - left.specificity ||
          Date.parse(right.observedAt) - Date.parse(left.observedAt) ||
          PROVENANCE_RANK[right.provenance] - PROVENANCE_RANK[left.provenance] ||
          right.revision - left.revision ||
          left.id.localeCompare(right.id, "en-US")
      )
    const winner = candidates[0]
    if (!winner) throw new Error("Prompt resolution produced no winner")
    return { winner, candidates }
  })
  return {
    instructions: winners.map(({ winner }) => winner.directive),
    record: {
      schemaVersion: 1,
      mode,
      resolvedAt,
      decisions: winners.map(({ winner, candidates }) => ({
        topic: winner.topic,
        winnerId: winner.id,
        winnerRevision: winner.revision,
        contenderIds: candidates.map((candidate) => candidate.id),
        factors: [
          "relevance",
          "specificity",
          "recency",
          "provenance",
          "mode-applicability"
        ]
      }))
    }
  }
}
