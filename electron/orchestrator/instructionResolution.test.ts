import { expect, it } from "vitest"
import { resolvePromptInstructions } from "../../src/features/prompts"
import {
  PROMPT_MODE_SCHEMAS,
  type PromptResolutionContender,
  type PromptSessionSnapshot
} from "../../src/features/prompts"
import { resolveTemplateForTask } from "../prompts"
import { reduceAccepted, startedSession } from "./testSupport"

it("resolves and records conflicts deterministically", () => {
  const contenders: PromptResolutionContender[] = [
    {
      id: "user-old",
      revision: 1,
      topic: "detail",
      relevance: 8,
      specificity: 9,
      observedAt: "2026-07-30T10:00:00.000Z",
      provenance: "user",
      applicableModes: ["coding"],
      directive: "SECRET_OLD"
    },
    {
      id: "user-new",
      revision: 2,
      topic: "detail",
      relevance: 8,
      specificity: 9,
      observedAt: "2026-07-31T10:00:00.000Z",
      provenance: "user",
      applicableModes: ["coding"],
      directive: "SECRET_WINNER"
    },
    {
      id: "wrong-mode",
      revision: 9,
      topic: "detail",
      relevance: 100,
      specificity: 100,
      observedAt: "2026-07-31T11:00:00.000Z",
      provenance: "system",
      applicableModes: ["behavioral"],
      directive: "WRONG_MODE"
    }
  ]
  const forward = resolvePromptInstructions("coding", contenders, "2026-07-31T12:00:00.000Z")
  const reversed = resolvePromptInstructions("coding", [...contenders].reverse(), "2026-07-31T12:00:00.000Z")
  expect(forward).toEqual(reversed)
  expect(forward.instructions).toEqual(["SECRET_WINNER"])
  expect(forward.record.decisions[0]).toMatchObject({
    winnerId: "user-new",
    contenderIds: ["user-new", "user-old"]
  })
  expect(JSON.stringify(forward.record)).not.toContain("SECRET_")
  expect(JSON.stringify(forward.record)).not.toContain("WRONG_MODE")

  const snapshot: PromptSessionSnapshot = {
    schemaVersion: 1,
    templateId: "user:task-aware",
    templateRevision: 3,
    mode: "system-design",
    modeSchema: PROMPT_MODE_SCHEMAS["system-design"],
    name: "Task aware",
    selectedInstructions: "Prefer bottleneck analysis.",
    instructions: "Prefer bottleneck analysis.",
    resolution: forward.record
  }
  const resolved = resolveTemplateForTask({
    template: snapshot,
    context: [
      {
        id: "detail:old",
        category: "instructions",
        revision: 1,
        content: "Prefer a generic overview."
      },
      {
        id: "detail:new",
        category: "instructions",
        revision: 2,
        content: "Explain database bottlenecks."
      }
    ],
    task: "Design a database and explain bottlenecks",
    resolvedAt: "2026-07-31T13:00:00.000Z"
  })
  expect(resolved.resolution.task.fingerprintSha256).toMatch(/^[a-f0-9]{64}$/)
  expect(resolved.resolution.decisions.flatMap((decision) => decision.contenderIds)).toEqual(
    expect.arrayContaining(["user:task-aware", "context:detail:old", "context:detail:new"])
  )
  expect(JSON.stringify(resolved.resolution)).not.toContain("database")
  expect(JSON.stringify(resolved.resolution)).not.toContain("noFallback")

  const initial = startedSession({
    mode: "system-design",
    provider: "codex",
    model: "gpt-5.4",
    responseMode: "fast",
    language: "typescript",
    context: [],
    template: snapshot
  })
  const updated = reduceAccepted(initial, {
    type: "template-resolution-updated",
    template: resolved
  })
  expect(updated.snapshot.template?.resolution).toEqual(resolved.resolution)
})
