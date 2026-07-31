import type { ActiveInterviewSession } from "../../src/shared/interview"
import { BEHAVIORAL_SECTIONS } from "../../src/features/behavioral/types"
import type {
  BehavioralFactView,
  BehavioralStory
} from "../../src/features/behavioral/types"
import {
  deriveBehavioralView,
  validateStoryClaims
} from "../../src/features/behavioral/facts"
import type { ProvenancedClaim } from "../../src/features/profile/types"
import { providerTemplateEnvelope } from "../prompts"

export interface BehavioralProviderPayload {
  readonly kind: "behavioral"
  readonly story: BehavioralStory
}

function profileClaims(
  session: ActiveInterviewSession
): readonly ProvenancedClaim[] {
  return session.snapshot.context.flatMap((item) => {
    if (item.category !== "profile") return []
    try {
      const value = JSON.parse(item.content) as Record<string, unknown>
      return Array.isArray(value.claims)
        ? (value.claims as ProvenancedClaim[])
        : []
    } catch {
      return []
    }
  })
}

export function parseBehavioralProviderPayload(
  value: unknown
): BehavioralProviderPayload | null {
  if (typeof value !== "object" || value === null) return null
  const payload = value as Record<string, unknown>
  if (
    payload.kind !== "behavioral" ||
    typeof payload.story !== "object" ||
    payload.story === null
  ) {
    return null
  }
  const story = payload.story as Record<string, unknown>
  if (
    typeof story.id !== "string" ||
    typeof story.title !== "string" ||
    !["verified", "user-edited", "synthetic-draft"].includes(
      String(story.status)
    ) ||
    !Array.isArray(story.claims) ||
    !story.claims.every((value) => {
      if (typeof value !== "object" || value === null) return false
      const claim = value as Record<string, unknown>
      return (
        typeof claim.id === "string" &&
        typeof claim.text === "string" &&
        typeof claim.provenance === "string" &&
        Number.isSafeInteger(claim.sourceRevision) &&
        (claim.metric === undefined || typeof claim.metric === "string")
      )
    })
  ) {
    return null
  }
  return {
    kind: "behavioral",
    story: story as unknown as BehavioralStory
  }
}

export function admitBehavioralPayload(
  session: ActiveInterviewSession,
  payload: BehavioralProviderPayload
): { readonly story: BehavioralStory; readonly view: BehavioralFactView } {
  const syntheticEnabled = session.snapshot.context.some(
    (item) => item.id === "synthetic-story-policy"
  )
  if (payload.story.status === "synthetic-draft" && !syntheticEnabled) {
    throw new Error("Synthetic stories are off")
  }
  const claims = profileClaims(session)
  const errors = [
    ...validateStoryClaims(
      payload.story,
      claims.map((claim) => claim.id)
    )
  ]
  if (payload.story.status !== "synthetic-draft") {
    for (const claim of payload.story.claims) {
      const source = claims.find((candidate) => candidate.id === claim.id)
      if (
        !source ||
        source.text !== claim.text ||
        source.metric !== claim.metric ||
        source.sourceRevision !== claim.sourceRevision
      ) {
        errors.push(`Dossier claim changed in provider output: ${claim.id}`)
      }
    }
  }
  if (errors.length > 0) throw new Error(errors.join("; "))
  return {
    story: payload.story,
    view: deriveBehavioralView(payload.story)
  }
}

export function behavioralFactBody(
  admitted: ReturnType<typeof admitBehavioralPayload>
): string {
  return JSON.stringify({
    format: "behavioral-fact-view-v1",
    story: admitted.story,
    view: admitted.view
  })
}

export function buildBehavioralRequest(
  session: ActiveInterviewSession,
  requestId: string,
  input: string,
  sectionIds: readonly string[] = BEHAVIORAL_SECTIONS,
  syntheticEnabled = session.snapshot.context.some(
    (item) => item.id === "synthetic-story-policy"
  )
) {
  const claims = profileClaims(session)
  return {
    route: "behavioral" as const,
    requestId,
    sectionIds,
    input,
    context: session.snapshot.context.filter(
      (item) =>
        item.category === "instructions" ||
        item.category === "transcript" ||
        item.category === "profile" ||
        item.category === "opportunity"
    ),
    profileContextRole: "untrusted-evidence" as const,
    template: providerTemplateEnvelope(session),
    allowedClaims: claims,
    synthetic: {
      enabled: syntheticEnabled,
      requiredLabel: "synthetic-draft"
    },
    contract: {
      oneFactObject: true,
      outputKind: "behavioral" as const,
      absentMetricRemainsQualitative: true,
      unsupportedRealStory: "honest-absence",
      practiceFeedback: false,
      tools: [] as const
    }
  }
}
