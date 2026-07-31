import { mkdir, readFile, symlink, writeFile } from "node:fs/promises"
import path from "node:path"
import { expect, it } from "vitest"
import { projectHistoryArchive } from "../../src/features/history"
import { withTempDirectory } from "../storage/testHelpers.cjs"
import { HistoryExportService } from "./exportService"
import { historyFixture } from "./testSupport"

it("confines and atomically writes explicit exports", async () => {
  await withTempDirectory(async (root: string) => {
    const archive = projectHistoryArchive(historyFixture())
    const request = (destination: string, overwriteConfirmed = false) => ({
      sessionId: archive.sessionId,
      format: "json" as const,
      destination,
      disclosureAccepted: true as const,
      overwriteConfirmed
    })
    await expect(
      new HistoryExportService().export(
        archive,
        request(`${root}${path.sep}a${path.sep}..${path.sep}escape.json`)
      )
    ).rejects.toThrow(/normalized/i)
    const target = path.join(root, "target.json")
    const link = path.join(root, "link.json")
    await writeFile(target, "prior")
    await symlink(target, link)
    await expect(new HistoryExportService().export(archive, request(link))).rejects.toThrow(/symbolic/i)
    await expect(new HistoryExportService().export(archive, request(target))).rejects.toThrow(/overwrite/i)
    const interrupted = new HistoryExportService((boundary) => {
      if (boundary === "accepted") throw new Error("simulated interruption")
    })
    await expect(interrupted.export(archive, request(target, true))).rejects.toThrow(/interruption/i)
    expect(await readFile(target, "utf8")).toBe("prior")
    await mkdir(path.join(root, "nested"))
  })
})
