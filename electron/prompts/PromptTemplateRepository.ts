import { createHash } from "node:crypto"
import type { RecordRepository } from "../storage"
import type { InterviewMode } from "../../src/shared/interview"
import {
  BUILT_IN_PROMPTS,
  defaultBuiltIn,
  validatePromptTemplate
} from "../../src/features/prompts/model"
import { resolvePromptInstructions } from "../../src/features/prompts/resolution"
import {
  PROMPT_MIGRATION,
  PROMPT_SCHEMA_VERSION,
  type PromptCatalog,
  type PromptSelectionV1,
  type PromptSessionSnapshot,
  type PromptStoredRecord,
  type PromptTemplateDraft,
  type PromptTemplateV1,
  type ReviewedPromptChange
} from "../../src/features/prompts/types"

const RECORD_TYPE = "application/vnd.interviewcopilot.m08+json"
const CORE_MODES = ["coding", "system-design", "behavioral"] as const

function storageId(logicalId: string): string {
  return createHash("sha256").update("InterviewCopilot/M-08\0").update(logicalId).digest("hex")
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`
  if (typeof value === "object" && value !== null) {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right, "en-US"))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(",")}}`
  }
  return JSON.stringify(value)
}

function reviewDigest(
  draft: PromptTemplateDraft,
  reviewedAt: string
): string {
  return createHash("sha256")
    .update(stable({ schemaVersion: 1, kind: "reviewed-prompt-change", draft, reviewedAt }))
    .digest("hex")
}

function validateSelection(value: unknown): PromptSelectionV1 {
  if (typeof value !== "object" || value === null) throw new Error("Selection is malformed")
  const candidate = value as Partial<PromptSelectionV1>
  if (
    candidate.schemaVersion !== PROMPT_SCHEMA_VERSION ||
    candidate.migration !== PROMPT_MIGRATION ||
    candidate.recordType !== "selection" ||
    !CORE_MODES.includes(candidate.mode as InterviewMode) ||
    typeof candidate.templateId !== "string" ||
    typeof candidate.updatedAt !== "string" ||
    !Number.isFinite(Date.parse(candidate.updatedAt))
  ) {
    throw new Error("Selection is malformed")
  }
  return candidate as PromptSelectionV1
}

function classification(value: unknown): "newer-version" | "malformed" {
  if (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { schemaVersion?: unknown }).schemaVersion === "number" &&
    (value as { schemaVersion: number }).schemaVersion > PROMPT_SCHEMA_VERSION
  ) {
    return "newer-version"
  }
  return "malformed"
}

export class PromptTemplateRepository {
  constructor(
    private readonly records: RecordRepository<PromptStoredRecord | object>,
    private readonly now: () => string = () => new Date().toISOString()
  ) {}

  async catalog(): Promise<PromptCatalog> {
    const scanned = await this.records.all()
    const users: PromptTemplateV1[] = []
    const selectionRecords = new Map<InterviewMode, PromptSelectionV1>()
    const quarantine: PromptCatalog["quarantine"][number][] = scanned.issues.map(
      (issue) => ({ recordId: issue.file, reason: "storage-error" })
    )

    for (const { id, value } of scanned.records) {
      try {
        if ((value as { recordType?: unknown }).recordType === "template") {
          const template = validatePromptTemplate(value)
          if (template.kind !== "user" || storageId(template.id) !== id) {
            throw new Error("Persisted template identity is invalid")
          }
          users.push(template)
        } else if ((value as { recordType?: unknown }).recordType === "selection") {
          const selection = validateSelection(value)
          if (id !== storageId(`selection:${selection.mode}`)) {
            throw new Error("Persisted selection identity is invalid")
          }
          selectionRecords.set(selection.mode, selection)
        } else {
          throw new Error("Unknown M-08 record")
        }
      } catch {
        quarantine.push({ recordId: id, reason: classification(value) })
      }
    }

    const templates = [...BUILT_IN_PROMPTS.map((value) => structuredClone(value)), ...users]
      .sort((left, right) => left.mode.localeCompare(right.mode, "en-US") || left.name.localeCompare(right.name, "en-US") || left.id.localeCompare(right.id, "en-US"))
    const selections = Object.fromEntries(
      CORE_MODES.map((mode) => {
        const requested = selectionRecords.get(mode)?.templateId
        const valid = templates.some(
          (template) => template.id === requested && template.mode === mode
        )
        return [mode, valid ? requested : defaultBuiltIn(mode).id]
      })
    ) as Record<InterviewMode, string>
    return { templates, selections, quarantine }
  }

  review(draft: PromptTemplateDraft): ReviewedPromptChange {
    const candidate = validatePromptTemplate(draft.candidate)
    if (candidate.kind !== "user" || draft.changes.length === 0) {
      throw new Error("A semantic user-template change is required")
    }
    const reviewedAt = this.now()
    const normalized = { ...draft, candidate }
    return {
      schemaVersion: 1,
      kind: "reviewed-prompt-change",
      draft: normalized,
      reviewedAt,
      digest: reviewDigest(normalized, reviewedAt)
    }
  }

  async apply(reviewed: ReviewedPromptChange): Promise<PromptCatalog> {
    if (
      reviewed.schemaVersion !== 1 ||
      reviewed.kind !== "reviewed-prompt-change" ||
      reviewed.digest !== reviewDigest(reviewed.draft, reviewed.reviewedAt)
    ) {
      throw new Error("Prompt change has not passed semantic review")
    }
    const template = validatePromptTemplate(reviewed.draft.candidate)
    if (template.kind !== "user" || reviewed.draft.changes.length === 0) {
      throw new Error("Reviewed prompt change is invalid")
    }
    const catalog = await this.catalog()
    const existing = catalog.templates.find((candidate) => candidate.id === template.id)
    if (existing?.kind === "built-in") throw new Error("Built-in templates are immutable")
    const stale =
      reviewed.draft.baseRevision === 0
        ? existing !== undefined || template.revision !== 1
        : !existing ||
          existing.kind !== "user" ||
          existing.revision !== reviewed.draft.baseRevision ||
          reviewed.draft.baseId !== existing.id ||
          template.revision !== existing.revision + 1
    if (stale) {
      throw new Error("Prompt changed after review")
    }
    await this.records.put(storageId(template.id), template, RECORD_TYPE)
    return this.catalog()
  }

  async delete(id: string, confirmedName: string): Promise<PromptCatalog> {
    const catalog = await this.catalog()
    const template = catalog.templates.find((candidate) => candidate.id === id)
    if (!template || template.kind === "built-in") {
      throw new Error("Built-in templates cannot be deleted")
    }
    if (confirmedName !== template.name) throw new Error("Template deletion is not confirmed")
    await this.records.remove(storageId(id))
    for (const mode of CORE_MODES) {
      if (catalog.selections[mode] === id) await this.restoreBuiltIn(mode)
    }
    return this.catalog()
  }

  async select(mode: InterviewMode, templateId: string): Promise<PromptCatalog> {
    const catalog = await this.catalog()
    if (!catalog.templates.some((template) => template.id === templateId && template.mode === mode)) {
      throw new Error("Template does not belong to the selected mode")
    }
    await this.records.put(
      storageId(`selection:${mode}`),
      {
        schemaVersion: PROMPT_SCHEMA_VERSION,
        migration: PROMPT_MIGRATION,
        recordType: "selection",
        mode,
        templateId,
        updatedAt: this.now()
      },
      RECORD_TYPE
    )
    return this.catalog()
  }

  restoreBuiltIn(mode: InterviewMode): Promise<PromptCatalog> {
    return this.select(mode, defaultBuiltIn(mode).id)
  }

  async snapshot(mode: InterviewMode): Promise<PromptSessionSnapshot> {
    const catalog = await this.catalog()
    const selected =
      catalog.templates.find((candidate) => candidate.id === catalog.selections[mode] && candidate.mode === mode) ??
      defaultBuiltIn(mode)
    const resolution = resolvePromptInstructions(
      mode,
      [
        {
          id: selected.id,
          revision: selected.revision,
          topic: "session-style",
          relevance: 100,
          specificity: 100,
          observedAt: selected.updatedAt,
          provenance: selected.kind === "built-in" ? "built-in" : "user",
          applicableModes: [selected.mode],
          directive: selected.instructions
        }
      ],
      this.now()
    )
    return {
      schemaVersion: 1,
      templateId: selected.id,
      templateRevision: selected.revision,
      mode,
      modeSchema: selected.modeSchema,
      name: selected.name,
      instructions: resolution.instructions.join("\n"),
      resolution: resolution.record
    }
  }
}
