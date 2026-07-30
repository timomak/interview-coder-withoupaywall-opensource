import { describe, expect, it } from "vitest"
import {
  createCaptureProtectedWindow,
  revealCaptureProtectedWindow
} from "../captureProtection"

describe("capture-protected window lifecycle", () => {
  it("protects before every show and reconfiguration", () => {
    const lifecycle: string[] = []
    const window = createCaptureProtectedWindow(() => ({
      setContentProtection: (enabled: boolean) =>
        lifecycle.push(`protect:${enabled}`),
      show: () => lifecycle.push("show"),
      reconfigure: () => lifecycle.push("reconfigure")
    }))

    revealCaptureProtectedWindow(window, (protectedWindow) =>
      protectedWindow.show()
    )
    revealCaptureProtectedWindow(window, (protectedWindow) =>
      protectedWindow.reconfigure()
    )

    expect(lifecycle).toEqual([
      "protect:true",
      "protect:true",
      "show",
      "protect:true",
      "reconfigure"
    ])
    expect(lifecycle).not.toContain("protect:false")
  })
})
