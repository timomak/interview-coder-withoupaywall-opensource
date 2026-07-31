import type {
  ActiveInterviewSession,
  ContextItem,
  EvidenceArtifact
} from "../../src/shared/interview"
import {
  isCodingIntent,
  sectionsForCodingIntent,
  type CodingIntent,
  type CodingFixCard,
  type CodingSectionId
} from "../../src/features/coding/types"
import { normalizeCodingLanguage } from "../../src/features/coding/language"

const CODING_CONTEXT_CATEGORIES = new Set(["instructions", "transcript", "screenshot"])

export function codingContext(
  session: ActiveInterviewSession
): readonly ContextItem[] {
  return session.snapshot.context.filter((item) =>
    CODING_CONTEXT_CATEGORIES.has(item.category)
  )
}

export interface CodingProviderRequest {
  readonly route: "coding"
  readonly intent: CodingIntent
  readonly requestId: string
  readonly language: string
  readonly sectionIds: readonly string[]
  readonly input: string
  readonly context: readonly ContextItem[]
  readonly history: {
    readonly branchIds: readonly string[]
    readonly priorSections: readonly {
      readonly id: string
      readonly body: string
    }[]
  }
  readonly evidence: readonly EvidenceArtifact[]
  readonly tools: readonly never[]
  readonly responseContract: {
    readonly conciseFirst: true
    readonly approachBullets: "2-4"
    readonly tradeoff: "exactly-one"
    readonly complexity: readonly ["time", "space"]
    readonly codeReadOnly: true
  }
}

export function buildCodingProviderRequest(input: {
  readonly session: ActiveInterviewSession
  readonly intent: unknown
  readonly requestId: string
  readonly input: string
  readonly evidenceArtifactIds?: readonly string[]
  readonly nextFixVersion?: number
  readonly sectionIds?: readonly string[]
}): CodingProviderRequest {
  if (!isCodingIntent(input.intent)) {
    throw new Error("Coding requests require an explicit supported intent")
  }
  const evidenceIds = input.evidenceArtifactIds
  const currentBranchId = input.session.codingQuestions?.currentBranchId
  const evidence = input.session.artifacts.filter((artifact) =>
    evidenceIds
      ? evidenceIds.includes(artifact.id)
      : artifact.submitted &&
        (artifact.kind === "transcript" ||
          !currentBranchId ||
          artifact.codingBranchId === currentBranchId)
  )
  return {
    route: "coding",
    intent: input.intent,
    requestId: input.requestId,
    language: input.session.snapshot.language,
    sectionIds:
      input.sectionIds ??
      sectionsForCodingIntent(input.intent, input.nextFixVersion ?? 1),
    input: input.input,
    context: codingContext(input.session),
    history: {
      branchIds: input.session.codingQuestions?.chronology ?? [],
      priorSections: input.session.sections
        .filter(
          (section) =>
            !input.session.codingQuestions?.branches
              .find((branch) => branch.id === currentBranchId)
              ?.sectionIds.includes(section.id)
        )
        .map((section) => ({ id: section.id, body: section.body }))
    },
    evidence,
    tools: [],
    responseContract: {
      conciseFirst: true,
      approachBullets: "2-4",
      tradeoff: "exactly-one",
      complexity: ["time", "space"],
      codeReadOnly: true
    }
  }
}

export function parseCodingFixCard(value: unknown): CodingFixCard | null {
  if (typeof value !== "object" || value === null) return null
  const card = value as Record<string, unknown>
  if (
    !Number.isSafeInteger(card.version) ||
    (card.version as number) < 1 ||
    typeof card.supported !== "boolean" ||
    typeof card.issue !== "string" ||
    typeof card.explanation !== "string"
  ) {
    return null
  }
  if (card.supported) {
    if (
      typeof card.correction !== "string" ||
      card.correction.trim().length === 0 ||
      card.requestedEvidence !== undefined
    ) {
      return null
    }
  } else if (
    card.correction !== undefined ||
    typeof card.requestedEvidence !== "string" ||
    card.requestedEvidence.trim().length === 0
  ) {
    return null
  }
  return card as unknown as CodingFixCard
}

const FIRST_CLASS_SYNTAX: Readonly<Record<string, RegExp>> = Object.freeze({
  python3: /\b(?:def|class|for|while|return|import)\b/,
  typescript: /\b(?:function|const|let|class|interface|return)\b|=>/,
  java: /\b(?:class|public|private|static|return)\b/,
  go: /\b(?:package|func|type|return|range)\b/,
  cpp: /#include|\b(?:class|struct|vector|return)\b|std::/,
  csharp: /\b(?:namespace|class|public|private|using|return)\b/
})

export function validateFirstClassCode(
  languageId: string,
  code: string
): readonly string[] {
  const language = normalizeCodingLanguage(languageId)
  if (language.quality !== "first-class") return []
  const syntax = FIRST_CLASS_SYNTAX[language.id]
  return syntax?.test(code)
    ? []
    : [`Code does not contain representative ${language.label} syntax`]
}

export function validateCodingSections(
  intent: CodingIntent,
  languageId: string,
  sections: readonly { readonly id: string; readonly body: string }[]
): readonly string[] {
  if (intent === "debug") return []
  const errors: string[] = []
  const required = sectionsForCodingIntent(intent)
  const byBaseId = new Map<CodingSectionId, string>()
  for (const section of sections) {
    const baseId = section.id.replace(/-\d+$/, "") as CodingSectionId
    byBaseId.set(baseId, section.body.trim())
  }
  for (const sectionId of required) {
    const baseId = sectionId.startsWith("fix-") ? sectionId : sectionId
    if (!byBaseId.get(baseId)?.length) {
      errors.push(`Missing non-empty Coding section: ${sectionId}`)
    }
  }
  if (intent === "analyze" || intent === "generate-code") {
    const plan = byBaseId.get("plan") ?? ""
    const bullets = plan
      .split(/\r?\n/)
      .filter((line) => /^\s*(?:[-*]|\d+[.)])\s+\S/.test(line))
    if (bullets.length < 2 || bullets.length > 4) {
      errors.push("Coding plan must contain 2-4 approach bullets")
    }
    if (!/\btrade-?off\b/i.test(plan)) {
      errors.push("Coding plan must state exactly one trade-off")
    }
    if ((plan.match(/\btrade-?off\b/gi) ?? []).length !== 1) {
      errors.push("Coding plan must state exactly one trade-off")
    }
    if (!/\btime\b[\s\S]*\bO\s*\(/i.test(plan)) {
      errors.push("Coding plan must state time complexity")
    }
    if (!/\bspace\b[\s\S]*\bO\s*\(/i.test(plan)) {
      errors.push("Coding plan must state space complexity")
    }
  }
  if (intent === "generate-code") {
    errors.push(...validateFirstClassCode(languageId, byBaseId.get("code") ?? ""))
  }
  return [...new Set(errors)]
}
