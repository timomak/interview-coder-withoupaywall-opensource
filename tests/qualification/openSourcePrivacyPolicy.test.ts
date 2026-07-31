import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import {
  scanDependencyNames,
  scanSourceText
} from "../../scripts/verification/product-policy.mjs"

describe("open-source local-only release policy", () => {
  it("enforces free local-only product policy", () => {
    const root = path.resolve(__dirname, "../..")
    const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"))
    expect(pkg.license).toMatch(/^AGPL/)
    expect(scanDependencyNames(pkg)).toEqual([])
    expect(scanSourceText("diagnostics.ts", fs.readFileSync(
      path.join(root, "electron/diagnostics/DiagnosticService.ts"), "utf8"
    ))).toEqual([])
    expect(pkg.dependencies ?? {}).not.toHaveProperty("@sentry/electron")
    expect(JSON.stringify(pkg)).not.toMatch(/quota|credits|device.?fingerprint/i)
  })
})
