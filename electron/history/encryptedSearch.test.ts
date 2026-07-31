import { readFile, readdir } from "node:fs/promises"
import path from "node:path"
import { expect, it } from "vitest"
import { EncryptedRecordRepository, InstallationKeyService, StoragePaths } from "../storage"
import { DeterministicFakeKeyProtector, withTempDirectory } from "../storage/testHelpers.cjs"
import { HistoryRepository } from "./HistoryRepository"
import { historyFixture } from "./testSupport"

it("searches in memory without plaintext index", async () => {
  await withTempDirectory(async (root: string) => {
    const paths = new StoragePaths(root)
    const keys = new InstallationKeyService(paths, new DeterministicFakeKeyProtector())
    const canonical = new EncryptedRecordRepository<object>(paths, keys, undefined, "records")
    const projections = new EncryptedRecordRepository<object>(paths, keys, undefined, "history")
    await canonical.put("archive:history-session-001", historyFixture(), "application/vnd.interviewcopilot.session-archive+json")
    const history = new HistoryRepository(canonical, projections)
    expect((await history.search("HISTORY_SEARCH_MARKER")).entries).toHaveLength(1)
    async function scan(directory: string): Promise<Buffer[]> {
      const result: Buffer[] = []
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const target = path.join(directory, entry.name)
        if (entry.isDirectory()) result.push(...(await scan(target)))
        else result.push(await readFile(target))
      }
      return result
    }
    for (const bytes of await scan(root)) {
      expect(bytes.includes(Buffer.from("HISTORY_SEARCH_MARKER"))).toBe(false)
    }
  })
})
