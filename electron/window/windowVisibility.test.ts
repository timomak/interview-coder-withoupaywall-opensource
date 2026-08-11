import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

describe("window visibility", () => {
  it("reveals onboarding and preserves configured hidden startup", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "electron/main.ts"),
      "utf8"
    )
    const captureSource = fs.readFileSync(
      path.join(process.cwd(), "electron/orchestrator/captureIntegration.ts"),
      "utf8"
    )

    expect(source).toContain("show: false")
    expect(source).toContain(
      "const startupHudState = deriveStartupHudState(configHelper.loadConfig())"
    )
    expect(source).toMatch(
      /mainWindow\.once\("ready-to-show", \(\) => \{\s*state\.visible = false\s*if \(startupHudState === "expanded"\) \{\s*setHudState\(startupHudState\)\s*showMainWindow\(\)\s*\}\s*\}\)/
    )
    expect(captureSource).toContain(
      "restoreVisibility ? this.showMainWindow : () => undefined"
    )
    expect(source).toMatch(
      /initialShortcutRegistration[\s\S]*?if \(!initialShortcutRegistration\.ok\)[\s\S]*?once\("ready-to-show"[\s\S]*?showMainWindow\(\)/
    )
  })
})
