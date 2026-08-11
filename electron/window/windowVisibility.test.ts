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
    const packageMetadata = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8")
    ) as { build?: { mac?: { extendInfo?: { LSUIElement?: boolean } } } }

    expect(source).toContain("show: false")
    expect(source).toContain('app.setActivationPolicy("accessory")')
    expect(source).toContain("app.dock.hide()")
    expect(source).toContain("skipTaskbar: true")
    expect(source).toContain('type: "panel"')
    expect(packageMetadata.build?.mac?.extendInfo?.LSUIElement).toBe(true)
    expect(source).toContain(
      "const startupHudState = deriveStartupHudState(configHelper.loadConfig())"
    )
    expect(source).toMatch(
      /mainWindow\.once\("ready-to-show", \(\) => \{\s*state\.visible = false\s*if \(startupHudState === "expanded"\) \{\s*setHudState\(startupHudState, false\)\s*showMainWindow\(\)\s*\}\s*\}\)/
    )
    expect(captureSource).toContain(
      "restoreVisibility ? this.showMainWindow : () => undefined"
    )
    expect(source).toMatch(
      /initialShortcutRegistration[\s\S]*?if \(!initialShortcutRegistration\.ok\)[\s\S]*?once\("ready-to-show"[\s\S]*?showMainWindow\(\)/
    )
  })
})
