import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { migrateLegacyConfig } from "./migration"
import { DEFAULT_SHORTCUT_BINDINGS } from "../../src/shared/shell"

describe("M-05a live-shell preference migration", () => {
  it("adds safe defaults and replaces invalid additive preferences", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ic-m05a-config-"))
    const configPath = path.join(directory, "config.json")
    const base = {
      schemaVersion: 1,
      responseMode: "fast",
      language: "typescript",
      opacity: 1,
      migration: { id: "M-01", completedAt: "existing-install" }
    }
    fs.writeFileSync(configPath, JSON.stringify(base), { mode: 0o600 })

    try {
      const first = migrateLegacyConfig(
        configPath,
        () => new Date("2026-07-30T23:00:00.000Z")
      )
      expect(first.migrated).toBe(true)
      expect(first.config.shell).toEqual({
        density: "compact",
        textSize: "standard",
        shortcuts: DEFAULT_SHORTCUT_BINDINGS,
        geometry: {}
      })
      expect(first.config.migrations?.m05a?.completedAt).toBe(
        "2026-07-30T23:00:00.000Z"
      )

      fs.writeFileSync(
        configPath,
        JSON.stringify({
          ...first.config,
          shell: {
            ...first.config.shell,
            density: "tiny",
            shortcuts: {
              ...DEFAULT_SHORTCUT_BINDINGS,
              record: DEFAULT_SHORTCUT_BINDINGS.screenshot
            }
          }
        }),
        { mode: 0o600 }
      )
      const repaired = migrateLegacyConfig(configPath)
      expect(repaired.migrated).toBe(true)
      expect(repaired.config.shell?.density).toBe("compact")
      expect(repaired.config.shell?.shortcuts).toEqual(
        DEFAULT_SHORTCUT_BINDINGS
      )
      expect(fs.statSync(configPath).mode & 0o777).toBe(0o600)
    } finally {
      fs.rmSync(directory, { recursive: true })
    }
  })
})
