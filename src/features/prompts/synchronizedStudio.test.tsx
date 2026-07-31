import { expect, it } from "vitest"
import {
  answerPromptChat,
  createPromptDraft,
  defaultBuiltIn,
  startPromptChat
} from "./model"
import { PromptTemplateRepository } from "../../../electron/prompts"
import { MemoryRecordRepository } from "../../../electron/orchestrator/testSupport"
import type { PromptStoredRecord } from "./types"

it("synchronizes guided and manual editing through reviewed diffs", async () => {
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
  let chat = startPromptChat({
    mode: "coding",
    draftId: duplicated.candidate.id,
    at: "2026-07-31T10:01:00.000Z"
  })
  chat = answerPromptChat(chat, "Prefer a small worked example.", undefined, "2026-07-31T10:01:01.000Z")
  chat = answerPromptChat(chat, "Use it for algorithm trade-offs.", undefined, "2026-07-31T10:01:02.000Z")
  chat = answerPromptChat(chat, "Stay concise.", undefined, "2026-07-31T10:01:03.000Z")
  const guided = chat.proposal!
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
      before: "Custom variant",
      after: "My coding variant renamed"
    }
  ])
  expect(chat.messages.filter((message) => message.role === "guide")).toHaveLength(4)
  expect(chat.explanation).toContain("typed template revision")

  const repository = new PromptTemplateRepository(
    new MemoryRecordRepository<PromptStoredRecord | object>(),
    (() => { let tick = 0; return () => `2026-07-31T11:00:0${tick++}.000Z` })()
  )
  await repository.apply(await repository.review(duplicated))
  const persisted = (await repository.catalog()).templates.find(
    (template) => template.id === duplicated.candidate.id
  )!
  let concurrentChat = startPromptChat({
    mode: "coding",
    draftId: persisted.id,
    base: persisted,
    at: "2026-07-31T11:01:00.000Z"
  })
  concurrentChat = answerPromptChat(concurrentChat, "Show examples.", persisted, "2026-07-31T11:01:01.000Z")
  concurrentChat = answerPromptChat(concurrentChat, "During debugging.", persisted, "2026-07-31T11:01:02.000Z")
  concurrentChat = answerPromptChat(concurrentChat, "Keep it brief.", persisted, "2026-07-31T11:01:03.000Z")
  const concurrentManual = createPromptDraft({
    base: persisted,
    id: persisted.id,
    mode: persisted.mode,
    name: "Manual concurrent edit",
    instructions: persisted.instructions,
    source: "manual-edit",
    updatedAt: "2026-07-31T11:01:04.000Z"
  })
  const [chatReview, manualReview] = await Promise.all([
    repository.review(concurrentChat.proposal!),
    repository.review(concurrentManual)
  ])
  const results = await Promise.allSettled([
    repository.apply(chatReview),
    repository.apply(manualReview)
  ])
  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1)
  expect(results.filter((result) => result.status === "rejected")).toHaveLength(1)
  const winner = (await repository.catalog()).templates.find(
    (template) => template.id === persisted.id
  )!
  expect(winner.revision).toBe(2)
})
