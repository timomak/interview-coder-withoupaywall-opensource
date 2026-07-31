import { readFile } from "node:fs/promises"
import path from "node:path"
import { expect, it } from "vitest"
import { projectHistoryArchive } from "../../src/features/history"
import { withTempDirectory } from "../storage/testHelpers.cjs"
import { HistoryExportService, exportedFiles } from "./exportService"
import { historyFixture } from "./testSupport"

it("exports one safe versioned session with consent", async () => {
  await withTempDirectory(async (root: string) => {
    const archive = projectHistoryArchive(historyFixture())
    const exporter = new HistoryExportService()
    await expect(exporter.export(archive, {
      sessionId: archive.sessionId,
      format: "json",
      destination: path.join(root, "rejected.json"),
      disclosureAccepted: false as true,
      overwriteConfirmed: false
    })).rejects.toThrow(/disclosure/i)
    const jsonPath = path.join(root, "session.json")
    await exporter.export(archive, {
      sessionId: archive.sessionId,
      format: "json",
      destination: jsonPath,
      disclosureAccepted: true,
      overwriteConfirmed: false
    })
    const parsed = JSON.parse(await readFile(jsonPath, "utf8"))
    expect(parsed).toMatchObject({ schemaVersion: 1, migration: "M-09", archive: { sessionId: archive.sessionId } })
    expect(JSON.stringify(parsed).toLowerCase()).not.toMatch(/raw[-_ ]?audio|access_token|password/)
    const markdownPath = path.join(root, "session-bundle")
    await exporter.export(archive, {
      sessionId: archive.sessionId,
      format: "markdown",
      destination: markdownPath,
      disclosureAccepted: true,
      overwriteConfirmed: false
    })
    expect(await exportedFiles(markdownPath)).toEqual([
      expect.stringMatching(/^assets\/[a-f0-9]{64}\.png$/),
      "session.md"
    ])
    expect(await readFile(path.join(markdownPath, "session.md"), "utf8")).toContain("Architecture HISTORY_SEARCH_MARKER")
  })
})
