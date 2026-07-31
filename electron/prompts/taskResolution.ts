import { createHash } from "node:crypto"
import type { ContextItem, InterviewMode } from "../../src/shared/interview"
import {
  defaultBuiltIn
} from "../../src/features/prompts/model"
import { resolvePromptInstructions } from "../../src/features/prompts/resolution"
import type {
  PromptResolutionContender,
  PromptSessionSnapshot
} from "../../src/features/prompts/types"

function terms(value: string): ReadonlySet<string> {
  return new Set(
    value
      .normalize("NFC")
      .toLocaleLowerCase("en-US")
      .match(/[a-z0-9]{3,}/gu) ?? []
  )
}

function relevance(directive: string, taskTerms: ReadonlySet<string>): number {
  const directiveTerms = terms(directive)
  return Math.min(
    100,
    [...directiveTerms].filter((term) => taskTerms.has(term)).length * 10
  )
}

function topicForContext(id: string): string {
  return `context:${id.split(":", 1)[0]}`
}

export function resolveTemplateForTask(input: {
  readonly template: PromptSessionSnapshot
  readonly context: readonly ContextItem[]
  readonly task: string
  readonly resolvedAt: string
}): PromptSessionSnapshot {
  const taskFingerprintSha256 = createHash("sha256")
    .update(input.task.normalize("NFC"))
    .digest("hex")
  const taskTerms = terms(input.task)
  const builtIn = defaultBuiltIn(input.template.mode)
  const contenders: PromptResolutionContender[] = [
    {
      id: input.template.templateId,
      revision: input.template.templateRevision,
      topic: "template-style",
      relevance: relevance(
        input.template.selectedInstructions ?? input.template.instructions,
        taskTerms
      ),
      specificity: 100,
      observedAt: input.template.resolution.resolvedAt,
      provenance: input.template.templateId.startsWith("built-in:")
        ? "built-in"
        : "user",
      applicableModes: [input.template.mode],
      directive:
        input.template.selectedInstructions ?? input.template.instructions
    },
    ...(input.template.templateId === builtIn.id
      ? []
      : [
          {
            id: builtIn.id,
            revision: builtIn.revision,
            topic: "template-style",
            relevance: relevance(builtIn.instructions, taskTerms),
            specificity: 50,
            observedAt: builtIn.updatedAt,
            provenance: "built-in" as const,
            applicableModes: [input.template.mode],
            directive: builtIn.instructions
          }
        ]),
    ...input.context
      .filter((item) => item.category === "instructions")
      .map((item) => ({
        id: `context:${item.id}`,
        revision: item.revision,
        topic: topicForContext(item.id),
        relevance: relevance(item.content, taskTerms),
        specificity: Math.min(100, terms(item.content).size),
        observedAt: input.resolvedAt,
        provenance: "system" as const,
        applicableModes: [input.template.mode] as readonly InterviewMode[],
        directive: item.content
      }))
  ]
  const resolved = resolvePromptInstructions(
    input.template.mode,
    contenders,
    input.resolvedAt,
    taskFingerprintSha256
  )
  return {
    ...input.template,
    instructions: resolved.instructions.join("\n"),
    resolution: resolved.record
  }
}
