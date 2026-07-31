import { expect, it } from "vitest"
import { MemoryRecordRepository } from "../orchestrator/testSupport"
import { HistoryDeletionJournal, type HistoryDeleteJournalV1 } from "./deletionJournal"
import { HistoryRepository } from "./HistoryRepository"
import { historyFixture } from "./testSupport"

it("deletes only selected archived sessions", async () => {
  const canonical = new MemoryRecordRepository<object>()
  const projections = new MemoryRecordRepository<object>()
  const journals = new MemoryRecordRepository<HistoryDeleteJournalV1>()
  await canonical.put("active-interview-session", { protected: "active" })
  await canonical.put("archive:one", historyFixture("one"))
  await canonical.put("archive:two", historyFixture("two"))
  await canonical.put("preferences", { protected: "preferences" })
  await canonical.put("profile", { protected: "profile" })
  await canonical.put("opportunity", { protected: "opportunity" })
  await canonical.put("template", { protected: "template" })
  const repository = new HistoryRepository(canonical, projections)
  await repository.rebuild()
  const failing = new HistoryDeletionJournal(journals, repository, undefined, (boundary) => {
    if (boundary === "after-canonical-delete") throw new Error("crash")
  })
  await expect(failing.delete(["one"])).rejects.toThrow("crash")
  await new HistoryDeletionJournal(journals, repository).resume()
  expect(await canonical.get("archive:one")).toBeUndefined()
  expect(await canonical.get("archive:two")).toBeDefined()
  for (const id of ["active-interview-session", "preferences", "profile", "opportunity", "template"]) {
    expect(await canonical.get(id)).toEqual(expect.objectContaining({ protected: expect.any(String) }))
  }
})
