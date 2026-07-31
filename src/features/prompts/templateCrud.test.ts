import { expect, it } from "vitest"
import { MemoryRecordRepository } from "../../../electron/orchestrator/testSupport"
import { PromptTemplateRepository } from "../../../electron/prompts"
import { createPromptDraft, defaultBuiltIn } from "./model"
import type { PromptStoredRecord } from "./types"

it("protects built-ins and completes user CRUD", async () => {
  let tick = 0
  const records = new MemoryRecordRepository<PromptStoredRecord | object>()
  const repository = new PromptTemplateRepository(
    records,
    () => `2026-07-31T10:00:0${tick++}.000Z`
  )
  const builtIn = defaultBuiltIn("coding")
  await expect(repository.delete(builtIn.id, builtIn.name)).rejects.toThrow("Built-in")

  const createdDraft = createPromptDraft({
    base: builtIn,
    id: "user:coding-reviewer",
    mode: "coding",
    name: "Coding reviewer",
    instructions: "Explain the smallest correct change and one trade-off.",
    source: "duplicate",
    updatedAt: "2026-07-31T10:00:00.000Z"
  })
  await repository.apply(repository.review(createdDraft))
  await repository.select("coding", createdDraft.candidate.id)
  expect((await repository.catalog()).selections.coding).toBe("user:coding-reviewer")

  const editedDraft = createPromptDraft({
    base: createdDraft.candidate,
    id: createdDraft.candidate.id,
    mode: "coding",
    name: "Coding reviewer renamed",
    instructions: "Explain the smallest correct change, one example, and one trade-off.",
    source: "manual-edit",
    updatedAt: "2026-07-31T10:00:03.000Z"
  })
  const afterEdit = await repository.apply(repository.review(editedDraft))
  expect(afterEdit.templates.find((value) => value.id === editedDraft.candidate.id)).toMatchObject({
    name: "Coding reviewer renamed",
    revision: 2
  })
  await expect(repository.delete(editedDraft.candidate.id, "wrong")).rejects.toThrow("confirmed")
  await repository.delete(editedDraft.candidate.id, editedDraft.candidate.name)
  const afterDelete = await repository.catalog()
  expect(afterDelete.templates.some((value) => value.id === editedDraft.candidate.id)).toBe(false)
  expect(afterDelete.selections.coding).toBe(builtIn.id)
})
