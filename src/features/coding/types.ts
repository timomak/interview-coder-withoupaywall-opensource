export const CODING_INTENTS = [
  "analyze",
  "generate-code",
  "debug",
  "follow-up"
] as const

export type CodingIntent = (typeof CODING_INTENTS)[number]

export const CODING_INTENT_LABELS: Readonly<Record<CodingIntent, string>> =
  Object.freeze({
    analyze: "Analyze",
    "generate-code": "Generate Code",
    debug: "Debug",
    "follow-up": "Follow-up"
  })

export type CodingSectionId =
  | "answer"
  | "plan"
  | "code"
  | "explain"
  | `fix-${number}`

export interface CodingProblemBranch {
  readonly id: string
  readonly question: string
  readonly createdAt: string
  readonly closedAt?: string
  readonly sectionIds: readonly string[]
  readonly screenshotArtifactIds: readonly string[]
}

export interface CodingBranchHistory {
  readonly current: CodingProblemBranch
  readonly prior: readonly CodingProblemBranch[]
  readonly chronology: readonly string[]
  readonly transcriptArtifactIds: readonly string[]
}

export interface CodingFixCard {
  readonly version: number
  readonly supported: boolean
  readonly issue: string
  readonly correction?: string
  readonly explanation: string
  readonly requestedEvidence?: string
}

export function isCodingIntent(value: unknown): value is CodingIntent {
  return (
    typeof value === "string" &&
    CODING_INTENTS.includes(value as CodingIntent)
  )
}

export function sectionsForCodingIntent(
  intent: CodingIntent,
  nextFixVersion = 1
): readonly CodingSectionId[] {
  switch (intent) {
    case "analyze":
      return ["answer", "plan", "explain"]
    case "generate-code":
      return ["answer", "plan", "code", "explain"]
    case "debug":
      return [`fix-${nextFixVersion}`]
    case "follow-up":
      return ["answer", "explain"]
  }
}
