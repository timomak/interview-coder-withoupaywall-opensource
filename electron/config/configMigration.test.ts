import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { migrateLegacyConfig } from "./migration"

describe("M-01 configuration migration", () => {
  it("migrates legacy settings once without persisting secrets", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ic-p02-config-"))
    const configPath = path.join(directory, "config.json")
    const secret = "sk-ant-super-private-material-123456789"
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        apiKey: secret,
        apiProvider: "anthropic",
        extractionModel: "legacy-model",
        solutionModel: "legacy-model",
        debuggingModel: "legacy-model",
        credits: 999,
        language: "typescript",
        opacity: 0.72
      }),
      { mode: 0o644 }
    )
    try {
      const first = migrateLegacyConfig(
        configPath,
        () => new Date("2026-07-30T12:00:00.000Z")
      )
      expect(first).toMatchObject({
        migrated: true,
        config: {
          schemaVersion: 1,
          language: "typescript",
          opacity: 0.72,
          responseMode: "fast"
        }
      })
      expect(first.config).not.toHaveProperty("conversationId")
      expect(first.config).not.toHaveProperty("apiKey")
      expect(fs.statSync(configPath).mode & 0o777).toBe(0o600)
      expect(fs.statSync(first.backupPath!).mode & 0o777).toBe(0o600)

      const beforeSecond = fs.readFileSync(configPath)
      const backupBeforeSecond = fs.readFileSync(first.backupPath!)
      const second = migrateLegacyConfig(
        configPath,
        () => new Date("2030-01-01T00:00:00.000Z")
      )
      expect(second.migrated).toBe(false)
      expect(fs.readFileSync(configPath)).toEqual(beforeSecond)
      expect(fs.readFileSync(first.backupPath!)).toEqual(backupBeforeSecond)

      const allBytes = fs
        .readdirSync(directory)
        .map((file) => fs.readFileSync(path.join(directory, file), "utf8"))
        .join("\n")
      expect(allBytes).not.toContain(secret)
      expect(allBytes).not.toMatch(/legacy-model|999/)
    } finally {
      fs.rmSync(directory, { recursive: true })
    }
  })
})
