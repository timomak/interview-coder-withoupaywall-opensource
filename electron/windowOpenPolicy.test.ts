import fs from "node:fs"
import path from "node:path"
import { describe, expect, it, vi } from "vitest"
import { createWindowOpenHandler } from "./windowOpenPolicy"

describe("window-open capture lifecycle policy", () => {
  it("P01-R1-B01 denies every implicit child while preserving external links", () => {
    const openExternal = vi.fn()
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    const handler = createWindowOpenHandler(openExternal)

    expect(handler({ url: "https://example.com/untrusted-child" })).toEqual({
      action: "deny"
    })
    expect(handler({ url: "about:blank" })).toEqual({ action: "deny" })
    expect(handler({ url: "not a valid URL" })).toEqual({ action: "deny" })
    expect(openExternal).not.toHaveBeenCalled()

    expect(handler({ url: "https://docs.google.com/document/1" })).toEqual({
      action: "deny"
    })
    expect(handler({ url: "https://project.supabase.co/dashboard" })).toEqual({
      action: "deny"
    })
    expect(openExternal).toHaveBeenNthCalledWith(
      1,
      "https://docs.google.com/document/1"
    )
    expect(openExternal).toHaveBeenNthCalledWith(
      2,
      "https://project.supabase.co/dashboard"
    )

    const mainSource = fs.readFileSync(
      path.join(process.cwd(), "electron/main.ts"),
      "utf8"
    )
    expect(mainSource).toContain(
      "setWindowOpenHandler(\n    createWindowOpenHandler"
    )
    expect(mainSource).not.toContain('action: "allow"')
  })
})
