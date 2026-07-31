import { expect, it } from "vitest"
import { MemoryRecordRepository } from "../orchestrator/testSupport"
import { HistoryDeletionJournal, type HistoryDeleteJournalV1 } from "./deletionJournal"
import { HistoryExportService, type HistoryExportJournalV1 } from "./exportService"
import { HistoryRepository } from "./HistoryRepository"
import { HistoryService } from "./HistoryService"
import { historyFixture } from "./testSupport"

it("deletes only selected archived sessions", async () => {
  const canonical = new MemoryRecordRepository<object>()
  const projections = new MemoryRecordRepository<object>()
  const journals = new MemoryRecordRepository<HistoryDeleteJournalV1>()
  await canonical.put("active-interview-session", { protected: "active" })
  await canonical.put("preferences", { protected: "preferences" })
  await canonical.put("profile", { protected: "profile" })
  await canonical.put("opportunity", { protected: "opportunity" })
  await canonical.put("template", { protected: "template" })
  const repository = new HistoryRepository(canonical, projections)

  await canonical.put("archive:one", historyFixture("one"))
  await canonical.put("archive:two", historyFixture("two"))
  await repository.rebuild()
  const failing = new HistoryDeletionJournal(journals, repository, undefined, (boundary) => {
    if (boundary === "after-canonical-delete") throw new Error("crash")
  })
  await expect(failing.delete(["one"])).rejects.toThrow("crash")
  await new HistoryDeletionJournal(journals, repository).resume()
  expect(await canonical.get("archive:one")).toBeUndefined()
  expect(await canonical.get("archive:two")).toBeDefined()

  await canonical.put("archive:one", historyFixture("one"))
  const serialized = new HistoryDeletionJournal(journals, repository)
  await Promise.all([serialized.delete(["one"]), serialized.delete(["two"])])
  expect(await canonical.get("archive:one")).toBeUndefined()
  expect(await canonical.get("archive:two")).toBeUndefined()

  await canonical.put("archive:matching", historyFixture("matching", "ONLY_MATCH"))
  await canonical.put("archive:hidden", historyFixture("hidden", "NOT_VISIBLE"))
  expect((await repository.search("ONLY_MATCH")).entries.map((entry) => entry.sessionId))
    .toEqual(["matching"])
  const service = new HistoryService(
    repository,
    new HistoryDeletionJournal(journals, repository),
    new HistoryExportService(new MemoryRecordRepository<HistoryExportJournalV1>())
  )
  await service.delete({ scope: "all", sessionIds: [], confirmed: true })
  expect(await canonical.get("archive:matching")).toBeUndefined()
  expect(await canonical.get("archive:hidden")).toBeUndefined()

  for (const id of ["active-interview-session", "preferences", "profile", "opportunity", "template"]) {
    expect(await canonical.get(id)).toEqual(
      expect.objectContaining({ protected: expect.any(String) })
    )
  }
})
