import { expect, it } from "vitest"
import { PromptTemplateRepository } from "../../../electron/prompts"
import {
  ActiveSessionRepository,
  InterviewOrchestrator
} from "../../../electron/orchestrator"
import {
  FakeProviderFactory,
  MemoryRecordRepository,
  TEST_SNAPSHOT
} from "../../../electron/orchestrator/testSupport"
import type { M04ActiveSnapshot } from "../../../electron/orchestrator"
import type { PromptStoredRecord } from "./types"
import { createPromptDraft } from "./model"

it("locks template revision for active session", async () => {
  let tick = 0
  const prompts = new PromptTemplateRepository(
    new MemoryRecordRepository<PromptStoredRecord | object>(),
    () => `2026-07-31T10:00:0${tick++}.000Z`
  )
  const first = createPromptDraft({
    id: "user:session-template",
    mode: "system-design",
    name: "Design custom",
    instructions: "Emphasize explicit capacity assumptions.",
    source: "manual-edit",
    updatedAt: "2026-07-31T10:00:00.000Z"
  })
  await prompts.apply(prompts.review(first))
  await prompts.select("system-design", first.candidate.id)
  const orchestrator = new InterviewOrchestrator({
    providerFactory: new FakeProviderFactory(),
    repository: new ActiveSessionRepository(new MemoryRecordRepository<M04ActiveSnapshot>()),
    snapshotTemplate: (mode) => prompts.snapshot(mode),
    id: (() => { let id = 0; return () => `opaque-session-id-${++id}` })(),
    now: () => "2026-07-31T10:00:03.000Z"
  })
  await orchestrator.start(TEST_SNAPSHOT)
  const active = orchestrator.current()
  if (active.lifecycle !== "active") throw new Error("Session did not start")
  expect(active.snapshot.template?.templateRevision).toBe(1)

  const edited = createPromptDraft({
    base: first.candidate,
    id: first.candidate.id,
    mode: "system-design",
    name: first.candidate.name,
    instructions: "Emphasize explicit capacity assumptions and bottlenecks.",
    source: "manual-edit",
    updatedAt: "2026-07-31T10:00:04.000Z"
  })
  await prompts.apply(prompts.review(edited))
  expect(active.snapshot.template?.templateRevision).toBe(1)
  expect((await prompts.snapshot("system-design")).templateRevision).toBe(2)
})
