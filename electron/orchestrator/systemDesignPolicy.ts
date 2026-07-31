import { createHash } from "node:crypto"
import type {
  ActiveInterviewSession,
  ResponseSection
} from "../../src/shared/interview"
import { SYSTEM_DESIGN_SECTIONS } from "../../src/features/system-design/types"
import type {
  ArchitectureGraph,
  MaterialCalculation
} from "../../src/features/system-design/types"
import { validateArchitectureGraph } from "../../src/features/system-design/architectureSchema"
import { validateMaterialCalculations } from "../../src/features/system-design/estimates"
import type { BestEffortDecision } from "./responseRouting"

export function buildSystemDesignRequest(
  session: ActiveInterviewSession,
  requestId: string,
  input: string,
  bestEffort: BestEffortDecision,
  sectionIds: readonly string[] = SYSTEM_DESIGN_SECTIONS,
  context: unknown = session.snapshot.context
) {
  return {
    route: "system-design" as const,
    requestId,
    sectionIds,
    input,
    assumptions: bestEffort.assumptions,
    bestEffort,
    context,
    contract: {
      fixedOrder: SYSTEM_DESIGN_SECTIONS,
      calculations: "2-4 unit-bearing with explicit assumptions",
      architecture: "vendor-neutral validated graph",
      clarificationGatesLaterSections: false,
      tools: [] as const
    }
  }
}

function hash(body: string): string {
  return createHash("sha256").update(body).digest("hex")
}

export function applySystemDesignFollowup(
  sections: readonly ResponseSection[],
  impactedIds: readonly string[],
  replacements: Readonly<Record<string, string>>,
  whatChanged: readonly string[]
) {
  const impacted = new Set(impactedIds)
  if (
    impacted.size === 0 ||
    impacted.size !== impactedIds.length ||
    whatChanged.length !== impacted.size ||
    impactedIds.some(
      (id) =>
        !sections.some((section) => section.id === id) ||
        typeof replacements[id] !== "string"
    )
  ) {
    throw new Error("System Design follow-up impact is incomplete")
  }
  const before = Object.fromEntries(
    sections.map((section) => [section.id, hash(section.body)])
  )
  const revised = sections.map((section) =>
    impacted.has(section.id)
      ? { ...section, body: replacements[section.id] }
      : section
  )
  const after = Object.fromEntries(
    revised.map((section) => [section.id, hash(section.body)])
  )
  for (const section of sections) {
    if (!impacted.has(section.id) && before[section.id] !== after[section.id]) {
      throw new Error("System Design follow-up changed an unaffected section")
    }
  }
  return { sections: revised, before, after, whatChanged: [...whatChanged] }
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined
}

export function parseArchitectureGraph(body: string): ArchitectureGraph {
  const parsed = record(JSON.parse(body))
  if (!parsed || !Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
    throw new Error("Architecture section must be a graph object")
  }
  if (
    parsed.nodes.some((value) => {
      const node = record(value)
      return (
        !node ||
        typeof node.id !== "string" ||
        typeof node.type !== "string" ||
        typeof node.label !== "string" ||
        typeof node.detail !== "string"
      )
    }) ||
    parsed.edges.some((value) => {
      const edge = record(value)
      return (
        !edge ||
        typeof edge.id !== "string" ||
        typeof edge.from !== "string" ||
        typeof edge.to !== "string" ||
        typeof edge.label !== "string"
      )
    })
  ) {
    throw new Error("Architecture graph members are malformed")
  }
  const graph = parsed as unknown as ArchitectureGraph
  const errors = validateArchitectureGraph(graph)
  if (errors.length > 0) throw new Error(errors.join("; "))
  return graph
}

export function parseMaterialCalculations(
  body: string
): readonly MaterialCalculation[] {
  const parsed = JSON.parse(body) as unknown
  if (
    !Array.isArray(parsed) ||
    parsed.some((value) => {
      const calculation = record(value)
      return (
        !calculation ||
        typeof calculation.name !== "string" ||
        typeof calculation.expression !== "string" ||
        typeof calculation.result !== "number" ||
        typeof calculation.unit !== "string" ||
        typeof calculation.assumption !== "string"
      )
    })
  ) {
    throw new Error("Estimate section must be a calculation array")
  }
  const calculations = parsed as unknown as readonly MaterialCalculation[]
  const errors = validateMaterialCalculations(calculations)
  if (errors.length > 0) throw new Error(errors.join("; "))
  return calculations
}

export function validateSystemDesignSection(
  sectionId: string,
  body: string
): void {
  if (!body.trim()) throw new Error(`System Design section is empty: ${sectionId}`)
  if (sectionId === "estimate") {
    parseMaterialCalculations(body)
  } else if (sectionId === "architecture") {
    parseArchitectureGraph(body)
  }
}
