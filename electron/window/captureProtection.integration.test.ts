import { describe, expect, it } from "vitest"
import {
  applyPointerRouting,
  createCaptureProtectedWindow,
  revealCaptureProtectedWindow,
  setCaptureProtectedBounds
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

  it("routes pointer changes through the production shell primitive", () => {
    const calls: unknown[] = []
    applyPointerRouting(
      {
        setIgnoreMouseEvents: (ignore, options) =>
          calls.push({ ignore, forward: options?.forward })
      },
      true,
      true
    )
    applyPointerRouting(
      {
        setIgnoreMouseEvents: (ignore, options) =>
          calls.push({ ignore, forward: options?.forward })
      },
      false,
      false
    )
    expect(calls).toEqual([
      { ignore: true, forward: true },
      { ignore: false, forward: false }
    ])
  })

  it("reapplies protection around every production bounds mutation", () => {
    const calls: string[] = []
    setCaptureProtectedBounds(
      {
        setContentProtection: (enabled) => calls.push(`protect:${enabled}`),
        setBounds: ({ x, y, width, height }) => calls.push(`bounds:${x},${y},${width},${height}`)
      },
      { x: 10, y: 20, width: 300, height: 200 }
    )
    expect(calls).toEqual([
      "protect:true",
      "bounds:10,20,300,200",
      "protect:true"
    ])
  })
})
