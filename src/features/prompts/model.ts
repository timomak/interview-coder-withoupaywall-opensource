import type { InterviewMode } from "../../shared/interview"
import {
  PROMPT_MIGRATION,
  PROMPT_MODE_SCHEMAS,
  PROMPT_SCHEMA_VERSION,
  type PromptSemanticChange,
  type PromptTemplateDraft,
  type PromptTemplateV1
} from "./types"

export const BUILT_IN_PROMPTS: readonly PromptTemplateV1[] = Object.freeze([
  {
    schemaVersion: PROMPT_SCHEMA_VERSION,
    migration: PROMPT_MIGRATION,
    recordType: "template",
    id: "built-in:coding",
    kind: "built-in",
    mode: "coding",
    modeSchema: PROMPT_MODE_SCHEMAS.coding,
    name: "Concise coding",
    instructions: "Lead with the approach, then give a concise implementation and one trade-off.",
    revision: 1,
    provenance: "built-in",
    updatedAt: "2026-01-01T00:00:00.000Z"
  },
  {
    schemaVersion: PROMPT_SCHEMA_VERSION,
    migration: PROMPT_MIGRATION,
    recordType: "template",
    id: "built-in:system-design",
    kind: "built-in",
    mode: "system-design",
    modeSchema: PROMPT_MODE_SCHEMAS["system-design"],
    name: "Structured system design",
    instructions: "Keep the fixed design sequence and make assumptions and estimates explicit.",
    revision: 1,
    provenance: "built-in",
    updatedAt: "2026-01-01T00:00:00.000Z"
  },
  {
    schemaVersion: PROMPT_SCHEMA_VERSION,
    migration: PROMPT_MIGRATION,
    recordType: "template",
    id: "built-in:behavioral",
    kind: "built-in",
    mode: "behavioral",
    modeSchema: PROMPT_MODE_SCHEMAS.behavioral,
    name: "Evidence-led behavioral",
    instructions: "Prefer verified candidate facts and clearly label any synthetic draft.",
    revision: 1,
    provenance: "built-in",
    updatedAt: "2026-01-01T00:00:00.000Z"
  }
])

export function defaultBuiltIn(mode: InterviewMode): PromptTemplateV1 {
  const template = BUILT_IN_PROMPTS.find((candidate) => candidate.mode === mode)
  if (!template) throw new Error(`No built-in template for ${mode}`)
  return structuredClone(template)
}

function normalizedText(value: string, label: string, maxLength: number): string {
  const normalized = value.normalize("NFC").trim()
  const unsafeControl = [...normalized].some((character) => {
    const code = character.charCodeAt(0)
    return code === 0x7f || (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d)
  })
  if (!normalized || normalized.length > maxLength || unsafeControl) {
    throw new Error(`${label} is invalid`)
  }
  return normalized
}

const CAPABILITY_ESCALATION = [
  /\b(?:enable|invoke|call|use|add)\s+(?:a\s+)?tools?\b/i,
  /\b(?:switch|change|override|choose)\s+(?:the\s+)?(?:provider|model|effort)\b/i,
  /\b(?:allow|enable|use)\s+(?:provider\s+)?fallback\b/i,
  /\b(?:ignore|override|replace|reveal)\b[\s\S]{0,60}\b(?:system\s+prompt|response\s+schema|protected\s+(?:schema|contract|invariants?)|invariants?)\b/i,
  /\b(?:capture|select|submit)\s+(?:all\s+)?screenshots?\b/i,
  /\b(?:unlock|change|switch)\s+(?:the\s+)?mode\b/i,
  /\b(?:credential|api\s*key|access\s*token|secret)\b/i
] as const

export function validateTemplateInstructions(
  mode: InterviewMode,
  instructions: string
): string {
  const normalized = normalizedText(instructions, "Template instructions", 12_000)
  if (CAPABILITY_ESCALATION.some((pattern) => pattern.test(normalized))) {
    throw new Error("Template instructions attempt to change a protected capability")
  }
  if (
    mode === "coding" &&
    /\b(?:profile|resume|candidate dossier|opportunity context|personal context)\b/i.test(normalized)
  ) {
    throw new Error("Coding templates cannot request personal context")
  }
  return normalized
}

export function validatePromptTemplate(value: unknown): PromptTemplateV1 {
  if (typeof value !== "object" || value === null) throw new Error("Template is malformed")
  const candidate = value as Partial<PromptTemplateV1>
  if (
    candidate.schemaVersion !== PROMPT_SCHEMA_VERSION ||
    candidate.migration !== PROMPT_MIGRATION ||
    candidate.recordType !== "template" ||
    !["coding", "system-design", "behavioral"].includes(String(candidate.mode)) ||
    candidate.modeSchema !== PROMPT_MODE_SCHEMAS[candidate.mode as InterviewMode] ||
    typeof candidate.id !== "string" ||
    !/^(?:built-in|user):[a-z0-9][a-z0-9-]{0,63}$/u.test(candidate.id) ||
    (candidate.kind !== "built-in" && candidate.kind !== "user") ||
    (candidate.kind === "built-in") !== candidate.id.startsWith("built-in:") ||
    !Number.isSafeInteger(candidate.revision) ||
    (candidate.revision as number) < 1 ||
    typeof candidate.updatedAt !== "string" ||
    !Number.isFinite(Date.parse(candidate.updatedAt)) ||
    !["built-in", "duplicate", "guided-chat", "manual-edit"].includes(String(candidate.provenance)) ||
    (candidate.kind === "built-in" && candidate.provenance !== "built-in") ||
    (candidate.kind === "user" && candidate.provenance === "built-in")
  ) {
    throw new Error("Template is malformed")
  }
  return {
    ...(candidate as PromptTemplateV1),
    name: normalizedText(String(candidate.name ?? ""), "Template name", 80),
    instructions: validateTemplateInstructions(
      candidate.mode as InterviewMode,
      String(candidate.instructions ?? "")
    )
  }
}

function semanticChanges(
  before: PromptTemplateV1 | undefined,
  after: PromptTemplateV1
): readonly PromptSemanticChange[] {
  return (["name", "instructions", "mode"] as const).flatMap((field) => {
    const prior = before?.[field] ?? ""
    return prior === after[field]
      ? []
      : [{ field, before: prior, after: after[field] }]
  })
}

export function createPromptDraft(input: {
  readonly base?: PromptTemplateV1
  readonly id: string
  readonly mode: InterviewMode
  readonly name: string
  readonly instructions: string
  readonly source: "duplicate" | "guided-chat" | "manual-edit"
  readonly updatedAt: string
}): PromptTemplateDraft {
  if (input.base?.kind === "built-in" && input.id === input.base.id) {
    throw new Error("Built-in templates are immutable")
  }
  const revision = input.base?.kind === "user" ? input.base.revision + 1 : 1
  const candidate = validatePromptTemplate({
    schemaVersion: PROMPT_SCHEMA_VERSION,
    migration: PROMPT_MIGRATION,
    recordType: "template",
    id: input.id,
    kind: "user",
    mode: input.mode,
    modeSchema: PROMPT_MODE_SCHEMAS[input.mode],
    name: input.name,
    instructions: input.instructions,
    revision,
    provenance: input.source,
    updatedAt: input.updatedAt,
    duplicatedFrom:
      input.source === "duplicate" ? input.base?.id : input.base?.duplicatedFrom
  })
  return {
    source: input.source,
    baseId: input.base?.kind === "user" ? input.base.id : undefined,
    baseRevision: input.base?.kind === "user" ? input.base.revision : 0,
    candidate,
    changes: semanticChanges(input.base, candidate)
  }
}

export function applyGuidedPromptAnswer(
  base: PromptTemplateV1 | undefined,
  input: Omit<Parameters<typeof createPromptDraft>[0], "base" | "instructions" | "source"> & {
    readonly answer: string
  }
): PromptTemplateDraft {
  const answer = normalizedText(input.answer, "Guided answer", 2_000)
  const instructions = base?.instructions
    ? `${base.instructions.trim()}\n${answer}`
    : answer
  return createPromptDraft({
    ...input,
    base,
    instructions,
    source: "guided-chat"
  })
}
