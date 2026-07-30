import type { EvidenceArtifact } from "../../src/shared/interview"

export interface EvidenceResolution {
  readonly authority: "screenshot" | "transcript" | "none"
  readonly artifacts: readonly EvidenceArtifact[]
}

export function resolveEvidenceAuthority(
  artifacts: readonly EvidenceArtifact[]
): EvidenceResolution {
  const submitted = artifacts.filter((artifact) => artifact.submitted)
  const screenshots = submitted.filter(
    (artifact) => artifact.kind === "screenshot"
  )
  if (screenshots.length > 0) {
    return { authority: "screenshot", artifacts: screenshots }
  }
  const transcripts = submitted.filter(
    (artifact) => artifact.kind === "transcript"
  )
  return {
    authority: transcripts.length > 0 ? "transcript" : "none",
    artifacts: transcripts
  }
}
