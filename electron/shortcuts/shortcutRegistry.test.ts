import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

describe("shortcut registry", () => {
  it("registers the final safe capture submit reset visibility and movement map", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "electron/shortcuts.ts"),
      "utf8"
    )

    for (const shortcut of [
      "CommandOrControl+Shift+H",
      "CommandOrControl+Shift+S",
      "CommandOrControl+Shift+Enter",
      "CommandOrControl+Shift+Backspace",
      "CommandOrControl+Shift+Left",
      "CommandOrControl+Shift+Right",
      "CommandOrControl+Shift+Up",
      "CommandOrControl+Shift+Down"
    ]) {
      expect(source).toContain(shortcut)
    }
    expect(source).not.toContain('globalShortcut.register("CommandOrControl+R"')
    expect(source).not.toContain('globalShortcut.register("CommandOrControl+H"')
  })
})
