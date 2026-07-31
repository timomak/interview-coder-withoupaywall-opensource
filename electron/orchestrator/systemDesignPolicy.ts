import { createHash } from "node:crypto"
import type {
  ActiveInterviewSession,
  ResponseSection
} from "../../src/shared/interview"
import { SYSTEM_DESIGN_SECTIONS } from "../../src/features/system-design/types"

export function buildSystemDesignRequest(
  session: ActiveInterviewSession,
  requestId: string,
  input: string,
  assumptions: readonly string[],
  sectionIds: readonly string[] = SYSTEM_DESIGN_SECTIONS
) {
  return {
    route: "system-design" as const,
    requestId,
    sectionIds,
    input,
    assumptions,
    context: session.snapshot.context,
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
