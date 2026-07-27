import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { describe, expect, it } from "vitest"

const GENERATED_DIRECTORIES = new Set([
  ".artifacts",
  ".git",
  "coverage",
  "dist",
  "dist-electron",
  "node_modules",
  "release"
])

function copyRepositoryFixture(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "p01-source-gates-"))
  fs.cpSync(process.cwd(), root, {
    recursive: true,
    filter: (source) =>
      !source
        .split(path.sep)
        .some((segment) => GENERATED_DIRECTORIES.has(segment))
  })
  fs.symlinkSync(path.join(process.cwd(), "node_modules"), path.join(root, "node_modules"))
  for (const args of [
    ["init", "--quiet"],
    ["config", "user.email", "p01@example.invalid"],
    ["config", "user.name", "P01 fixture"],
    ["add", "--force", "."]
  ]) {
    const result = spawnSync("git", args, { cwd: root, encoding: "utf8" })
    if (result.status !== 0) {
      throw new Error(`${result.stdout}\n${result.stderr}`)
    }
  }
  return root
}

describe("executable source gates", () => {
  it("P01-R1-B04 gates JSX MTS CTS retained renderer and verification sources", () => {
    const root = copyRepositoryFixture()
    const probes = {
      "__p01_invalid_root_js.js":
        "/** @type {string} */ const invalidRootJsGate = 41\n",
      "__p01_invalid_root_jsx.jsx":
        "/** @type {string} */ const invalidRootJsxGate = 42\n",
      "src/__p01_invalid.cts": "const invalidCtsGate: string = 41\n",
      "renderer/src/__p01_invalid_renderer_ts.ts":
        "const invalidRetainedRendererGate: string = 42\n",
      "renderer/src/__p01_invalid_renderer_jsx.jsx":
        "/** @type {string} */ const invalidRendererJsxGate = 43\n",
      "scripts/qualification/__p01_invalid.cjs":
        "/** @type {string} */ const invalidQualificationCjsGate = 44\n",
      "scripts/verification/__p01_invalid_verification_mjs.mjs":
        "/** @type {string} */ const invalidVerificationMjsGate = 45\n",
      "scripts/verification/__p01_invalid_verification_mts.mts":
        "const invalidMtsGate: string = 46\n"
    }

    try {
      for (const [relativePath, source] of Object.entries(probes)) {
        const absolutePath = path.join(root, relativePath)
        fs.mkdirSync(path.dirname(absolutePath), { recursive: true })
        fs.writeFileSync(absolutePath, source)
      }
      const stage = spawnSync(
        "git",
        ["add", "--force", "--", ...Object.keys(probes)],
        { cwd: root, encoding: "utf8" }
      )
      expect(stage.status).toBe(0)

      const lint = spawnSync("npm", ["run", "lint", "--", "--no-cache"], {
        cwd: root,
        encoding: "utf8",
        env: process.env
      })
      expect(lint.status).not.toBe(0)

      const typecheck = spawnSync("npm", ["run", "typecheck"], {
        cwd: root,
        encoding: "utf8",
        env: process.env
      })
      const output = `${typecheck.stdout}\n${typecheck.stderr}`
      expect(typecheck.status).not.toBe(0)
      expect(output).toContain("__p01_invalid_root_js.js")
      expect(output).toContain("__p01_invalid_root_jsx.jsx")
      expect(output).toContain("src/__p01_invalid.cts")
      expect(output).toContain("renderer/src/__p01_invalid_renderer_ts.ts")
      expect(output).toContain("renderer/src/__p01_invalid_renderer_jsx.jsx")
      expect(output).toContain("scripts/qualification/__p01_invalid.cjs")
      expect(output).toContain(
        "scripts/verification/__p01_invalid_verification_mjs.mjs"
      )
      expect(output).toContain(
        "scripts/verification/__p01_invalid_verification_mts.mts"
      )
      expect(output).toContain(
        "Type 'number' is not assignable to type 'string'"
      )
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})
