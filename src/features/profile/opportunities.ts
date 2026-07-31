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

export function snapshotOpportunity(
  bundle: ProfileBundle
): OpportunityContext | undefined {
  const opportunity = bundle.opportunities.find(
    (candidate) => candidate.id === bundle.activeOpportunityId
  )
  return opportunity ? structuredClone(opportunity) : undefined
}
