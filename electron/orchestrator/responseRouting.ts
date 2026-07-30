import { createHash } from "node:crypto"
import type { ResponseSection } from "../../src/shared/interview"

export interface StructuredPayload {
  readonly kind: "structured"
  readonly sections: readonly {
    readonly id: string
    readonly body: string
  }[]
}

export interface CorrectionPayload {
  readonly kind: "correction"
  readonly sections: readonly {
    readonly id: string
    readonly body: string
  }[]
}

export type ParsedProviderPayload = StructuredPayload | CorrectionPayload

export function parseProviderPayload(value: unknown): ParsedProviderPayload | null {
  if (typeof value !== "object" || value === null) return null
  const candidate = value as Record<string, unknown>
  if (candidate.kind !== "structured" && candidate.kind !== "correction") {
    return null
  }
  if (!Array.isArray(candidate.sections)) return null
  const sections: Array<{ id: string; body: string }> = []
  for (const section of candidate.sections) {
    if (
      typeof section !== "object" ||
      section === null ||
      typeof (section as Record<string, unknown>).id !== "string" ||
      typeof (section as Record<string, unknown>).body !== "string"
    ) {
      return null
    }
    sections.push({
      id: (section as { id: string }).id,
      body: (section as { body: string }).body
    })
  }
  return { kind: candidate.kind, sections }
}

export interface BestEffortDecision {
  readonly answer: true
  readonly assumptions: readonly string[]
  readonly clarificationSuggestions: readonly string[]
}

export function bestEffortDecision(
  consequentialAssumptions: readonly string[],
  missingFields: readonly string[],
  materialImpactFixture: Readonly<Record<string, boolean>>
): BestEffortDecision {
  return {
    answer: true,
    assumptions: [...consequentialAssumptions],
    clarificationSuggestions: missingFields.filter(
      (field) => materialImpactFixture[field] === true
    )
  }
}

export interface CorrectionResult {
  readonly sections: readonly ResponseSection[]
  readonly changedSectionIds: readonly string[]
  readonly beforeHashes: Readonly<Record<string, string>>
  readonly afterHashes: Readonly<Record<string, string>>
}

function hash(body: string): string {
  return createHash("sha256").update(body).digest("hex")
}

export function applyCorrection(
  sections: readonly ResponseSection[],
  replacements: Readonly<Record<string, string>>,
  affectedSectionIds: readonly string[]
): CorrectionResult {
  const affected = new Set(affectedSectionIds)
  if (
    affected.size !== affectedSectionIds.length ||
    [...affected].some(
      (id) =>
        !sections.some((section) => section.id === id) ||
        typeof replacements[id] !== "string"
    ) ||
    Object.keys(replacements).some((id) => !affected.has(id))
  ) {
    throw new Error("Correction impact does not match the frozen section set")
  }
  const beforeHashes = Object.fromEntries(
    sections.map((section) => [section.id, hash(section.body)])
  )
  const revised = sections.map((section) =>
    affected.has(section.id)
      ? { ...section, body: replacements[section.id] }
      : section
  )
  const afterHashes = Object.fromEntries(
    revised.map((section) => [section.id, hash(section.body)])
  )
  return {
    sections: revised,
    changedSectionIds: affectedSectionIds.filter(
      (id) => beforeHashes[id] !== afterHashes[id]
    ),
    beforeHashes,
    afterHashes
  }
}
