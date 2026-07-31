import { readFile, realpath } from "node:fs/promises"
import path from "node:path"
import { expect, it } from "vitest"
import { projectHistoryArchive } from "../../src/features/history"
import { MemoryRecordRepository } from "../orchestrator/testSupport"
import { withTempDirectory } from "../storage/testHelpers.cjs"
import {
  HistoryExportService,
  exportedFiles,
  type HistoryExportJournalV1
} from "./exportService"
import { historyFixture } from "./testSupport"

it("exports one safe versioned session with consent", async () => {
  await withTempDirectory(async (root: string) => {
    root = await realpath(root)
    const projected = projectHistoryArchive(historyFixture())
    const archive = {
      ...projected,
      extensions: { credential: "EXTENSION_SECRET_SENTINEL" },
      session: Object.assign(structuredClone(projected.session), {
        credentials: { accessToken: "ACCESS_TOKEN_SENTINEL" },
        diagnostics: { providerTrace: "DIAGNOSTIC_SECRET_SENTINEL" },
        rawAudio: Buffer.from("RAW_AUDIO_SECRET_SENTINEL").toString("base64")
      })
    }
    const exporter = new HistoryExportService(
      new MemoryRecordRepository<HistoryExportJournalV1>()
    )
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
    expect(parsed).toMatchObject({
      schemaVersion: 1,
      migration: "M-09",
      recordType: "history-export",
      session: {
        id: archive.sessionId,
        promptTemplate: { templateId: expect.any(String) },
        pendingQuestion: { text: expect.any(String) },
        evidence: [{ kind: "transcript" }],
        followUps: [{ id: "follow-up-1" }],
        screenshots: [{ contentType: "image/png" }]
      }
    })
    const serialized = JSON.stringify(parsed)
    expect(serialized).not.toMatch(
      /EXTENSION_SECRET_SENTINEL|ACCESS_TOKEN_SENTINEL|DIAGNOSTIC_SECRET_SENTINEL|RAW_AUDIO_SECRET_SENTINEL/
    )
    expect(Object.keys(parsed.session)).not.toEqual(
      expect.arrayContaining(["credentials", "diagnostics", "rawAudio", "extensions"])
    )
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
    const markdown = await readFile(path.join(markdownPath, "session.md"), "utf8")
    expect(markdown).toContain("Architecture HISTORY_SEARCH_MARKER")
    expect(markdown).not.toMatch(
      /EXTENSION_SECRET_SENTINEL|ACCESS_TOKEN_SENTINEL|DIAGNOSTIC_SECRET_SENTINEL|RAW_AUDIO_SECRET_SENTINEL/
    )

    const leakedCredential = "arbitrary-value-that-must-not-leak"
    const secretBearingArchive = {
      ...projected,
      session: Object.assign(structuredClone(projected.session), {
        credentials: { accessToken: leakedCredential }
      })
    }
    Object.assign(secretBearingArchive.session.snapshot.context[0], {
      content: `copied credential: ${leakedCredential}`
    })
    await expect(exporter.export(secretBearingArchive, {
      sessionId: secretBearingArchive.sessionId,
      format: "json",
      destination: path.join(root, "secret-bearing.json"),
      disclosureAccepted: true,
      overwriteConfirmed: false
    })).rejects.toThrow(/credential or secret value/i)

    const shapedSecretArchive = structuredClone(projected)
    Object.assign(shapedSecretArchive.session.audio.segments[0], {
      text: "Authorization: Bearer abcdefghijklmnopqrstuvwxyz"
    })
    await expect(exporter.export(shapedSecretArchive, {
      sessionId: shapedSecretArchive.sessionId,
      format: "markdown",
      destination: path.join(root, "shaped-secret"),
      disclosureAccepted: true,
      overwriteConfirmed: false
    })).rejects.toThrow(/credential or secret value/i)
  })
})
