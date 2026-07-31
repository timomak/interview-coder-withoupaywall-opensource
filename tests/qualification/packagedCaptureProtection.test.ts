import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import {
  createCaptureProtectedWindow,
  revealCaptureProtectedWindow
} from "../../electron/captureProtection"

describe("packaged capture protection", () => {
  it("traces protection in the packaged app", () => {
    const trace: string[] = []
    const window = createCaptureProtectedWindow(() => ({
      setContentProtection: (enabled: boolean) => trace.push(`protect:${enabled}`),
      show: () => trace.push("show"),
      reconfigure: () => trace.push("reconfigure")
    }))
    revealCaptureProtectedWindow(window, (item) => item.show())
    revealCaptureProtectedWindow(window, (item) => item.reconfigure())
    expect(trace).toEqual([
      "protect:true",
      "protect:true",
      "show",
      "protect:true",
      "reconfigure"
    ])
    const build = fs.existsSync(path.resolve(__dirname, "../../dist-electron/main.js"))
      ? fs.readFileSync(path.resolve(__dirname, "../../dist-electron/main.js"), "utf8")
      : fs.readFileSync(path.resolve(__dirname, "../../electron/window/runtimeShell.cjs"), "utf8")
    expect(build).toContain("setContentProtection(true)")
    expect(build).not.toContain("setContentProtection(false)")
  })
})
