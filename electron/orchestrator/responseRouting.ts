import { createHash } from "node:crypto"
import type {
  ActiveInterviewSession,
  InterviewMode,
  ResponseSection
} from "../../src/shared/interview"

export interface StructuredPayload {
  readonly kind: "structured"
  readonly sections: readonly {
    readonly id: string
    readonly body: string
    readonly complete?: boolean
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
  const sections: Array<{ id: string; body: string; complete?: boolean }> = []
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
      body: (section as { body: string }).body,
      complete:
        typeof (section as Record<string, unknown>).complete === "boolean"
          ? ((section as Record<string, unknown>).complete as boolean)
          : undefined
    })
  }
  return { kind: candidate.kind, sections }
}

interface ClarificationFixture {
  readonly field: string
  readonly markers: readonly string[]
  readonly material: boolean
  readonly assumption: string
}

export const MODE_CLARIFICATION_FIXTURES: Readonly<
  Record<InterviewMode, readonly ClarificationFixture[]>
> = Object.freeze({
  coding: Object.freeze([
    {
      field: "input constraints",
      markers: ["constraint", "maximum", "minimum", "up to", "complexity"],
      material: true,
      assumption: "Input sizes fit the stated language runtime limits."
    },
    {
      field: "expected output",
      markers: ["return", "output", "print", "produce"],
      material: true,
      assumption: "Return the result instead of printing it."
    },
    {
      field: "example formatting",
      markers: ["example", "format"],
      material: false,
      assumption: ""
    }
  ]),
  "system-design": Object.freeze([
    {
      field: "traffic scale",
      markers: ["qps", "requests per", "users", "traffic", "scale"],
      material: true,
      assumption: "Design for horizontally scalable production traffic."
    },
    {
      field: "consistency requirement",
      markers: ["consistent", "consistency", "stale", "linearizable"],
      material: true,
      assumption: "Prefer availability with bounded eventual consistency."
    },
    {
      field: "cloud preference",
      markers: ["aws", "gcp", "azure", "cloud"],
      material: false,
      assumption: ""
    }
  ]),
  behavioral: Object.freeze([
    {
      field: "personal role",
      markers: ["i ", "my ", "role", "owned", "led"],
      material: true,
      assumption: "Frame the answer around the candidate's direct contribution."
    },
    {
      field: "measurable outcome",
      markers: ["result", "outcome", "improved", "reduced", "increased", "%"],
      material: true,
      assumption: "Describe the strongest verifiable outcome without inventing metrics."
    },
    {
      field: "exact date",
      markers: ["january", "february", "march", "202"],
      material: false,
      assumption: ""
    }
  ])
})

export function deriveBestEffortDecision(
  session: ActiveInterviewSession,
  input: string
): BestEffortDecision {
  const corpus = [
    input,
    ...session.snapshot.context.map((item) => item.content),
    ...session.artifacts
      .filter((artifact) => artifact.submitted)
      .map((artifact) => artifact.content)
  ]
    .join("\n")
    .normalize("NFC")
    .toLocaleLowerCase("en-US")
  const fixtures = MODE_CLARIFICATION_FIXTURES[session.snapshot.mode]
  const missing = fixtures.filter(
    (fixture) => !fixture.markers.some((marker) => corpus.includes(marker))
  )
  return bestEffortDecision(
    missing
      .filter((fixture) => fixture.material)
      .map((fixture) => fixture.assumption),
    missing.map((fixture) => fixture.field),
    Object.fromEntries(
      fixtures.map((fixture) => [fixture.field, fixture.material])
    )
  )
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
