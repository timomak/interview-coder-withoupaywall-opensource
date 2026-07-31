export type ClaimProvenance =
  | "resume-import"
  | "guided-chat"
  | "manual-edit"
  | "verified"
  | "synthetic-draft"

export interface ProvenancedClaim {
  readonly id: string
  readonly text: string
  readonly provenance: ClaimProvenance
  readonly sourceRevision: number
  readonly metric?: string
}

export interface CandidateDossier {
  readonly schemaVersion: 1
  readonly revision: number
  readonly markdown: string
  readonly claims: readonly ProvenancedClaim[]
  readonly status: "draft" | "reviewed"
}

export interface OpportunityContext {
  readonly id: string
  readonly name: string
  readonly revision: number
  readonly markdown: string
  readonly provenance: ClaimProvenance
}

export interface ProfileBundle {
  readonly schemaVersion: 1
  readonly dossier?: CandidateDossier
  readonly opportunities: readonly OpportunityContext[]
  readonly activeOpportunityId?: string
  readonly syntheticEnabled?: boolean
}

export function isProfileBundle(value: unknown): value is ProfileBundle {
  if (typeof value !== "object" || value === null) return false
  const bundle = value as Record<string, unknown>
  if (
    bundle.schemaVersion !== 1 ||
    !Array.isArray(bundle.opportunities) ||
    (bundle.activeOpportunityId !== undefined &&
      typeof bundle.activeOpportunityId !== "string") ||
    (bundle.syntheticEnabled !== undefined &&
      typeof bundle.syntheticEnabled !== "boolean")
  ) {
    return false
  }
  const dossier = bundle.dossier as Record<string, unknown> | undefined
  const provenances = new Set([
    "resume-import",
    "guided-chat",
    "manual-edit",
    "verified",
    "synthetic-draft"
  ])
  if (
    dossier !== undefined &&
    (typeof dossier !== "object" ||
      dossier === null ||
      dossier.schemaVersion !== 1 ||
      !Number.isSafeInteger(dossier.revision) ||
      typeof dossier.markdown !== "string" ||
      !Array.isArray(dossier.claims) ||
      !dossier.claims.every((value) => {
        if (typeof value !== "object" || value === null) return false
        const claim = value as Record<string, unknown>
        return (
          typeof claim.id === "string" &&
          typeof claim.text === "string" &&
          provenances.has(String(claim.provenance)) &&
          Number.isSafeInteger(claim.sourceRevision) &&
          (claim.metric === undefined || typeof claim.metric === "string")
        )
      }) ||
      (dossier.status !== "draft" && dossier.status !== "reviewed"))
  ) {
    return false
  }
  const ids = new Set<string>()
  return bundle.opportunities.every((value) => {
    if (typeof value !== "object" || value === null) return false
    const opportunity = value as Record<string, unknown>
    const valid = (
      typeof opportunity.id === "string" &&
      !ids.has(opportunity.id) &&
      typeof opportunity.name === "string" &&
      Number.isSafeInteger(opportunity.revision) &&
      typeof opportunity.markdown === "string" &&
      provenances.has(String(opportunity.provenance))
    )
    if (valid) ids.add(String(opportunity.id))
    return valid
  })
}
