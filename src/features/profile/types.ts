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
  readonly dossierHistory?: readonly CandidateDossier[]
  readonly opportunities: readonly OpportunityContext[]
  readonly activeOpportunityId?: string
  readonly syntheticEnabled?: boolean
  readonly syntheticStories?: readonly {
    readonly id: string
    readonly title: string
    readonly status: "synthetic-draft"
    readonly claims: readonly ProvenancedClaim[]
  }[]
  readonly guidedMessages?: readonly {
    readonly role: "guide" | "candidate"
    readonly content: string
    readonly at: string
  }[]
}

function isClaim(value: unknown, provenances: ReadonlySet<string>): boolean {
  if (typeof value !== "object" || value === null) return false
  const claim = value as Record<string, unknown>
  return (
    typeof claim.id === "string" &&
    typeof claim.text === "string" &&
    provenances.has(String(claim.provenance)) &&
    Number.isSafeInteger(claim.sourceRevision) &&
    (claim.metric === undefined || typeof claim.metric === "string")
  )
}

function isDossier(
  value: unknown,
  provenances: ReadonlySet<string>
): value is CandidateDossier {
  if (typeof value !== "object" || value === null) return false
  const dossier = value as Record<string, unknown>
  return (
    dossier.schemaVersion === 1 &&
    Number.isSafeInteger(dossier.revision) &&
    typeof dossier.markdown === "string" &&
    Array.isArray(dossier.claims) &&
    dossier.claims.every((claim) => isClaim(claim, provenances)) &&
    (dossier.status === "draft" || dossier.status === "reviewed")
  )
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
  const provenances = new Set([
    "resume-import",
    "guided-chat",
    "manual-edit",
    "verified",
    "synthetic-draft"
  ])
  if (
    (bundle.dossier !== undefined &&
      !isDossier(bundle.dossier, provenances)) ||
    (bundle.dossierHistory !== undefined &&
      (!Array.isArray(bundle.dossierHistory) ||
        !bundle.dossierHistory.every((value) =>
          isDossier(value, provenances)
        ))) ||
    (bundle.syntheticStories !== undefined &&
      (!Array.isArray(bundle.syntheticStories) ||
        !bundle.syntheticStories.every((value) => {
          if (typeof value !== "object" || value === null) return false
          const story = value as Record<string, unknown>
          return (
            typeof story.id === "string" &&
            typeof story.title === "string" &&
            story.status === "synthetic-draft" &&
            Array.isArray(story.claims) &&
            story.claims.every(
              (claim) =>
                isClaim(claim, provenances) &&
                (claim as ProvenancedClaim).provenance === "synthetic-draft"
            )
          )
        }))) ||
    (bundle.guidedMessages !== undefined &&
      (!Array.isArray(bundle.guidedMessages) ||
        !bundle.guidedMessages.every((value) => {
          if (typeof value !== "object" || value === null) return false
          const message = value as Record<string, unknown>
          return (
            (message.role === "guide" || message.role === "candidate") &&
            typeof message.content === "string" &&
            typeof message.at === "string"
          )
        })))
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
