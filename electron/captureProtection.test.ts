import fs from "node:fs"
import path from "node:path"
import { describe, expect, it, vi } from "vitest"
import {
  applyCaptureProtection,
  createCaptureProtectedWindow,
  revealCaptureProtectedWindow
} from "./captureProtection"

describe("capture protection", () => {
  it("protects creation and reveal lifecycle paths", () => {
    const lifecycle: string[] = []
    const setContentProtection = vi.fn((enabled: boolean) => {
      lifecycle.push(`protect:${enabled}`)
    })

    const window = createCaptureProtectedWindow(() => {
      lifecycle.push("create:hidden")
      return { setContentProtection }
    })

    revealCaptureProtectedWindow(window, () => {
      lifecycle.push("reveal")
    })

    expect(lifecycle).toEqual([
      "create:hidden",
      "protect:true",
      "protect:true",
      "reveal"
    ])
    expect(setContentProtection).toHaveBeenCalledTimes(2)
    expect(setContentProtection).not.toHaveBeenCalledWith(false)

    const mainSource = fs.readFileSync(
      path.join(process.cwd(), "electron/main.ts"),
      "utf8"
    )
    expect(mainSource).toContain("show: false")
    expect(mainSource).toContain("createCaptureProtectedWindow")
    expect(mainSource).toContain("revealCaptureProtectedWindow")
    expect(mainSource).not.toContain(".setContentProtection(")
    expect(
      mainSource.match(/\.(?:focus|restore|show|showInactive)\(/g)
    ).toEqual([
      ".restore(",
      ".showInactive(",
      ".focus(",
      ".showInactive("
    ])
    expect(mainSource).toMatch(
      /function focusMainWindow[\s\S]*?revealCaptureProtectedWindow[\s\S]*?protectedWindow\.focus\(\)/
    )
    expect(mainSource).toMatch(
      /function showMainWindowInactive[\s\S]*?revealCaptureProtectedWindow[\s\S]*?protectedWindow\.showInactive\(\)/
    )
  })

  it("only enables the underlying Electron content-protection flag", () => {
    const setContentProtection = vi.fn()

    applyCaptureProtection({ setContentProtection })

    expect(setContentProtection).toHaveBeenCalledTimes(1)
    expect(setContentProtection).toHaveBeenCalledWith(true)
  })
})
