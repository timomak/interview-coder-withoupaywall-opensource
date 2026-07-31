import type { EvidenceArtifact } from "../../src/shared/interview"
import type {
  CodingBranchHistory,
  CodingProblemBranch
} from "../../src/features/coding/types"

export function createCodingBranch(
  id: string,
  question: string,
  createdAt: string,
  artifacts: readonly EvidenceArtifact[]
): CodingProblemBranch {
  return {
    id,
    question,
    createdAt,
    sectionIds: [],
    screenshotArtifactIds: artifacts
      .filter((artifact) => artifact.kind === "screenshot")
      .map((artifact) => artifact.id)
  }
}

export function newCodingQuestion(
  history: CodingBranchHistory,
  next: CodingProblemBranch,
  at: string
): CodingBranchHistory {
  return {
    current: next,
    prior: [...history.prior, { ...history.current, closedAt: at }],
    chronology: [...history.chronology, history.current.id, next.id],
    transcriptArtifactIds: [...history.transcriptArtifactIds]
  }
}
