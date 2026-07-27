import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
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

    const hostileOuterPaths = [
      "Contents/Resources/leaks/NESTED/RAW.TS",
      "Contents/Resources/app.asar.unpacked/runtime.test.JS",
      "Contents/Resources/app.asar.unpacked/runtime.node",
      "Contents/Resources/source.MAP",
      "Contents/Resources/scripts/VERIFICATION/probe.mjs",
      "Contents/Resources/.ENV.production",
      "Contents/Frameworks/Unexpected.framework/leak.txt",
      "Contents/extraFiles/readme.txt"
    ]
    const outerErrors = validatePackagedInventory({
      asarEntries: requiredRuntime,
      bundleEntries: [
        {
          path: "Contents/Resources/app.asar",
          type: "file",
          size: 1,
          sha256: "fixture"
        },
        ...hostileOuterPaths.map((outerPath) => ({
          path: outerPath,
          type: "file" as const,
          size: 1,
          sha256: "fixture"
        }))
      ]
    })
    for (const outerPath of hostileOuterPaths) {
      expect(outerErrors.join("\n")).toContain(outerPath)
    }
  })

  it(
    "P01-R1-B06 fails an actual fresh build that injects extraResources source",
    () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "p01-package-build-"))
      const excluded = new Set([
        ".artifacts",
        ".git",
        "coverage",
        "dist",
        "dist-electron",
        "node_modules",
        "release"
      ])
      fs.cpSync(process.cwd(), root, {
        recursive: true,
        filter: (source) =>
          !source
            .split(path.sep)
            .some((segment) => excluded.has(segment))
      })
      fs.symlinkSync(
        path.join(process.cwd(), "node_modules"),
        path.join(root, "node_modules")
      )
      fs.mkdirSync(path.join(root, "leaks"), { recursive: true })
      fs.writeFileSync(
        path.join(root, "leaks/__p01_bundle_leak.ts"),
        "export const leaked: string = 'raw project source'\n"
      )
      const packageJsonPath = path.join(root, "package.json")
      const packageJson = JSON.parse(
        fs.readFileSync(packageJsonPath, "utf8")
      )
      packageJson.build.extraResources = [
        {
          from: "leaks",
          to: "leaks",
          filter: ["**/*"]
        }
      ]
      fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`)

      const build = spawnSync("npm", ["run", "build"], {
        cwd: root,
        encoding: "utf8",
        env: process.env,
        timeout: 120_000
      })
      const output = `${build.stdout}\n${build.stderr}`
      expect(build.status).not.toBe(0)
      expect(output).toContain(
        "forbidden outer bundle resource: Contents/Resources/leaks/__p01_bundle_leak.ts"
      )
    },
    120_000
  )
})
