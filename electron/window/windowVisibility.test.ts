import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

describe("window visibility", () => {
  it("launches hidden and restores exact HUD state", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "electron/main.ts"),
      "utf8"
    )
    const captureSource = fs.readFileSync(
      path.join(process.cwd(), "electron/orchestrator/captureIntegration.ts"),
      "utf8"
    )

    expect(source).toContain("show: false")
    expect(source).toMatch(
      /mainWindow\.once\("ready-to-show", \(\) => \{\s*state\.visible = false\s*\}\)/
    )
    const readyBlock = source.match(
      /mainWindow\.once\("ready-to-show", \(\) => \{[\s\S]*?\n {2}\}\)/
    )?.[0]
    expect(readyBlock).not.toContain("showMainWindowInactive")
    expect(captureSource).toContain(
      "restoreVisibility ? this.showMainWindow : () => undefined"
    )
    expect(source).toMatch(
      /initialShortcutRegistration[\s\S]*?if \(!initialShortcutRegistration\.ok\)[\s\S]*?once\("ready-to-show"[\s\S]*?showMainWindow\(\)/
    )
  })
})
