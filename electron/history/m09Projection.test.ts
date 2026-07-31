import { expect, it } from "vitest"
import { MemoryRecordRepository } from "../orchestrator/testSupport"
import { HistoryRepository } from "./HistoryRepository"
import { historyFixture } from "./testSupport"

it("rebuilds the disposable M-09 projection without changing canonical archives", async () => {
  const canonical = new MemoryRecordRepository<object>()
  const projections = new MemoryRecordRepository<object>()
  const archive = { ...historyFixture("one"), futureField: { preserved: true } }
  await canonical.put("archive:one", archive)
  await projections.put("stale", { schemaVersion: 99 })
  const history = new HistoryRepository(canonical, projections)
  expect((await history.rebuild()).entries.map((entry) => entry.sessionId)).toEqual(["one"])
  expect(await projections.get("stale")).toBeUndefined()
  expect((await history.open("one")).source).not.toHaveProperty("futureField")
  expect(await canonical.get("archive:one")).toEqual(archive)
})
