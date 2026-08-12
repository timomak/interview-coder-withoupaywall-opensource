import type {
  OpportunityContext,
  ProfileBundle
} from "./types"
import { sanitizeProfileMarkdown } from "./markdown"

export function saveOpportunity(
  bundle: ProfileBundle,
  opportunity: OpportunityContext
): ProfileBundle {
  const sanitized = {
    ...opportunity,
    markdown: sanitizeProfileMarkdown(opportunity.markdown)
  }
  const exists = bundle.opportunities.some(
    (candidate) => candidate.id === opportunity.id
  )
  return {
    ...bundle,
    opportunities: exists
      ? bundle.opportunities.map((candidate) =>
          candidate.id === opportunity.id ? sanitized : candidate
        )
      : [...bundle.opportunities, sanitized]
  }
}

export function activateOpportunity(
  bundle: ProfileBundle,
  opportunityId: string
): ProfileBundle {
  if (
    !bundle.opportunities.some(
      (opportunity) => opportunity.id === opportunityId
    )
  ) {
    throw new Error("Unknown opportunity")
  }
  return { ...bundle, activeOpportunityId: opportunityId }
}

export function duplicateOpportunity(
  bundle: ProfileBundle,
  opportunityId: string,
  duplicateId: string
): ProfileBundle {
  const source = bundle.opportunities.find(
    (opportunity) => opportunity.id === opportunityId
  )
  if (!source) throw new Error("Unknown opportunity")
  if (!duplicateId || bundle.opportunities.some(({ id }) => id === duplicateId)) {
    throw new Error("Duplicate context identity is invalid")
  }
  return activateOpportunity(
    saveOpportunity(bundle, {
      ...source,
      id: duplicateId,
      name: `${source.name} copy`,
      revision: 1,
      provenance: "manual-edit"
    }),
    duplicateId
  )
}

export function snapshotOpportunity(
  bundle: ProfileBundle
): OpportunityContext | undefined {
  const opportunity = bundle.opportunities.find(
    (candidate) => candidate.id === bundle.activeOpportunityId
  )
  return opportunity ? structuredClone(opportunity) : undefined
}
