import type { ProvenancedClaim } from "../profile/types"

export const BEHAVIORAL_SECTIONS = [
  "answer",
  "star",
  "evidence",
  "follow-ups"
] as const

export interface BehavioralStory {
  readonly id: string
  readonly title: string
  readonly status: "verified" | "user-edited" | "synthetic-draft"
  readonly claims: readonly ProvenancedClaim[]
}

export interface BehavioralFactView {
  readonly storyId: string
  readonly synthetic: boolean
  readonly talkingPoints: readonly string[]
  readonly star: {
    readonly situation: readonly string[]
    readonly task: readonly string[]
    readonly action: readonly string[]
    readonly result: readonly string[]
  }
  readonly evidenceClaimIds: readonly string[]
  readonly followUps: readonly string[]
}
