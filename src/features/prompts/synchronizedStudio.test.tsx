import { expect, it } from "vitest"
import {
  applyGuidedPromptAnswer,
  createPromptDraft,
  defaultBuiltIn
} from "./model"

it("synchronizes guided and manual editing through reviewed diffs", () => {
  const builtIn = defaultBuiltIn("coding")
  const duplicated = createPromptDraft({
    base: builtIn,
    id: "user:shared-draft",
    mode: "coding",
    name: "My coding variant",
    instructions: builtIn.instructions,
    source: "duplicate",
    updatedAt: "2026-07-31T10:00:00.000Z"
  })
  const guided = applyGuidedPromptAnswer(undefined, {
    id: duplicated.candidate.id,
    mode: duplicated.candidate.mode,
    name: duplicated.candidate.name,
    answer: "Prefer a small worked example.",
    updatedAt: "2026-07-31T10:01:00.000Z"
  })
  const manual = createPromptDraft({
    base: guided.candidate,
    id: guided.candidate.id,
    mode: guided.candidate.mode,
    name: "My coding variant renamed",
    instructions: guided.candidate.instructions,
    source: "manual-edit",
    updatedAt: "2026-07-31T10:02:00.000Z"
  })

  expect(guided.candidate.id).toBe(duplicated.candidate.id)
  expect(manual.candidate.id).toBe(guided.candidate.id)
  expect(guided.changes).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ field: "instructions", before: "" })
    ])
  )
  expect(manual.changes).toEqual([
    {
      field: "name",
      before: "My coding variant",
      after: "My coding variant renamed"
    }
  ])
})
