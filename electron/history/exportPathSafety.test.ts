import { mkdir, readFile, readdir, realpath, rename, rm, symlink, writeFile } from "node:fs/promises"
import path from "node:path"
import { expect, it } from "vitest"
import { projectHistoryArchive } from "../../src/features/history"
import { MAX_HISTORY_EXPORT_SCREENSHOT_BYTES } from "../../src/features/history/types"
import { MemoryRecordRepository } from "../orchestrator/testSupport"
import { withTempDirectory } from "../storage/testHelpers.cjs"
import {
  HistoryExportService,
  type ExportBoundary,
  type HistoryExportJournalV1
} from "./exportService"
import { historyFixture } from "./testSupport"

it("confines and atomically writes explicit exports", async () => {
  await withTempDirectory(async (root: string) => {
    root = await realpath(root)
    const archive = projectHistoryArchive(historyFixture())
    const request = (destination: string, overwriteConfirmed = false) => ({
      sessionId: archive.sessionId,
      format: "json" as const,
      destination,
      disclosureAccepted: true as const,
      overwriteConfirmed
    })
    const records = () => new MemoryRecordRepository<HistoryExportJournalV1>()
    await expect(
      new HistoryExportService(records()).export(
        archive,
        request(`${root}${path.sep}a${path.sep}..${path.sep}escape.json`)
      )
    ).rejects.toThrow(/normalized/i)
    const target = path.join(root, "target.json")
    const link = path.join(root, "link.json")
    await writeFile(target, "prior")
    await symlink(target, link)
    await expect(new HistoryExportService(records()).export(archive, request(link)))
      .rejects.toThrow(/symbolic/i)
    await expect(new HistoryExportService(records()).export(archive, request(target)))
      .rejects.toThrow(/overwrite/i)

    const symlinkTargetParent = path.join(root, "symlink-target-parent")
    const symlinkedParent = path.join(root, "symlinked-parent")
    await mkdir(symlinkTargetParent)
    await symlink(symlinkTargetParent, symlinkedParent)
    await expect(new HistoryExportService(records()).export(
      archive,
      request(path.join(symlinkedParent, "session.json"))
    )).rejects.toThrow(/canonical export ancestors/i)

    const boundaries: readonly ExportBoundary[] = [
      "intent-saved",
      "staged",
      "backup-renamed",
      "destination-renamed",
      "accepted",
      "complete"
    ]
    for (const boundary of boundaries) {
      const destination = path.join(root, `${boundary}.json`)
      await writeFile(destination, "prior")
      const journal = records()
      const interrupted = new HistoryExportService(
        journal,
        (observed) => {
          if (observed === boundary) throw new Error(`hard interruption at ${boundary}`)
        },
        false
      )
      await expect(interrupted.export(archive, request(destination, true)))
        .rejects.toThrow(/hard interruption/)
      await new HistoryExportService(journal).recover()
      const content = await readFile(destination, "utf8")
      if (boundary === "accepted" || boundary === "complete") {
        expect(content).toContain('"recordType": "history-export"')
      } else {
        expect(content).toBe("prior")
      }
      expect((await readdir(root)).some((name) => name.includes(`.${boundary}.json.partial-`)))
        .toBe(false)
    }

    const identityTarget = path.join(root, "identity.json")
    await writeFile(identityTarget, "original")
    const identityExporter = new HistoryExportService(records(), async (boundary) => {
      if (boundary !== "staged") return
      await rm(identityTarget)
      await writeFile(identityTarget, "replacement")
    })
    await expect(identityExporter.export(archive, request(identityTarget, true)))
      .rejects.toThrow(/identity changed/i)
    expect(await readFile(identityTarget, "utf8")).toBe("replacement")

    const stableParent = path.join(root, "stable-parent")
    const movedParent = path.join(root, "moved-parent")
    await mkdir(stableParent)
    const ancestorTarget = path.join(stableParent, "session.json")
    const ancestorExporter = new HistoryExportService(records(), async (boundary) => {
      if (boundary !== "staged") return
      await rename(stableParent, movedParent)
      await mkdir(stableParent)
    }, false)
    await expect(ancestorExporter.export(archive, request(ancestorTarget)))
      .rejects.toThrow(/ancestor identity changed/i)

    const oversized = {
      ...archive,
      screenshots: [{
        id: "oversized",
        contentType: "image/png" as const,
        dataUrl: `data:image/png;base64,${Buffer.alloc(MAX_HISTORY_EXPORT_SCREENSHOT_BYTES + 1).toString("base64")}`
      }]
    }
    await expect(new HistoryExportService(records()).export(
      oversized,
      request(path.join(root, "oversized.json"))
    )).rejects.toThrow(/screenshot.*bound/i)
  })
})
