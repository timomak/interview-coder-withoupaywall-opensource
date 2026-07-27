import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { validatePackagedInventory } from "../../scripts/verification/package-inventory.mjs"

describe("production package inventory", () => {
  it("P01-R1-B06 rejects tests verification files and raw runtime source", () => {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8")
    )
    expect(packageJson.scripts.build).toContain(
      "npm run verify:package-inventory"
    )
    expect(packageJson.build.files).not.toContain("electron/**/*")

    const requiredRuntime = ["dist/index.html", "dist-electron/main.js"]
    expect(
      validatePackagedInventory({
        asarEntries: requiredRuntime,
        bundleFiles: ["Contents/Resources/app.asar"]
      })
    ).toEqual([])

    const errors = validatePackagedInventory({
      asarEntries: [
        ...requiredRuntime,
        "electron/main.ts",
        "electron/captureProtection.test.ts",
        "scripts/verification/product-policy.mjs",
        "dist-electron/main.js.map"
      ],
      bundleFiles: ["Contents/Resources/app.asar"]
    })
    expect(errors).toEqual(
      expect.arrayContaining([
        "project source root leaked into app.asar: electron/main.ts",
        "test/spec source leaked into app.asar: electron/captureProtection.test.ts",
        "verification source leaked into app.asar: scripts/verification/product-policy.mjs",
        "source map leaked into app.asar: dist-electron/main.js.map"
      ])
    )
  })
})
