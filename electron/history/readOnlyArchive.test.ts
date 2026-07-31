import { expect, it } from "vitest"
import { MemoryRecordRepository } from "../orchestrator/testSupport"
import { HistoryRepository } from "./HistoryRepository"
import { historyFixture } from "./testSupport"

it("inspects History without resuming live systems", async () => {
  const canonical = new MemoryRecordRepository<object>()
  const projections = new MemoryRecordRepository<object>()
  await canonical.put("active-interview-session", { protected: "byte-exact-active" })
  await canonical.put("archive:one", historyFixture("one"))
  const history = new HistoryRepository(canonical, projections)
  const activeBefore = await canonical.get("active-interview-session")
  const opened = await history.open("one")
  expect(opened.session.captureActive).toBe(false)
  expect(await canonical.get("active-interview-session")).toEqual(activeBefore)
  expect(Object.keys(opened)).not.toEqual(expect.arrayContaining(["providerRuntime", "capture", "resume"]))
})
