import type {
  BehavioralFactView,
  BehavioralStory
} from "./types"

export function validateStoryClaims(
  story: BehavioralStory,
  dossierClaimIds: readonly string[]
): readonly string[] {
  if (story.status === "synthetic-draft") {
    return story.claims.every(
      (claim) => claim.provenance === "synthetic-draft"
    )
      ? []
      : ["Synthetic story contains an unlabeled claim"]
  }
  const allowed = new Set(dossierClaimIds)
  return story.claims
    .filter((claim) => !allowed.has(claim.id))
    .map((claim) => `Unsupported dossier claim: ${claim.id}`)
}

export function createSyntheticStory(
  enabled: boolean,
  story: BehavioralStory
): BehavioralStory {
  if (!enabled) {
    throw new Error("Synthetic stories are off")
  }
  return {
    ...story,
    status: "synthetic-draft",
    claims: story.claims.map((claim) => ({
      ...claim,
      provenance: "synthetic-draft"
    }))
  }
}

export function deriveBehavioralView(
  story: BehavioralStory
): BehavioralFactView {
  const texts = story.claims.map((claim) => claim.text)
  return {
    storyId: story.id,
    synthetic: story.status === "synthetic-draft",
    talkingPoints: texts.slice(0, 3),
    star: {
      situation: texts.slice(0, 1),
      task: texts.slice(1, 2),
      action: texts.slice(2, -1),
      result: texts.slice(-1)
    },
    evidenceClaimIds: story.claims.map((claim) => claim.id),
    followUps: ["What did you learn?", "What would you change?"]
  }
}

export function fullAnswerFacts(
  view: BehavioralFactView,
  story: BehavioralStory
): readonly string[] {
  const allowed = new Set(view.evidenceClaimIds)
  return story.claims
    .filter((claim) => allowed.has(claim.id))
    .map((claim) => claim.text)
}
