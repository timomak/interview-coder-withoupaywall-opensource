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
  return root
}

describe("executable source gates", () => {
  it("P01-R1-B04 gates JSX MTS CTS retained renderer and verification sources", () => {
    const root = copyRepositoryFixture()
    const probes = {
      "__p01_invalid.jsx": "const invalidJsxGate = missingJsxGate\n",
      "src/__p01_invalid.cts": "const invalidCtsGate: string = 41\n",
      "renderer/src/__p01_invalid.ts":
        "const invalidRetainedRendererGate: string = 42\n",
      "scripts/verification/__p01_invalid.mts":
        "const invalidMtsGate: string = 43\n",
      "scripts/verification/__p01_invalid.ts":
        "const invalidVerificationGate: string = 44\n"
    }

    try {
      for (const [relativePath, source] of Object.entries(probes)) {
        const absolutePath = path.join(root, relativePath)
        fs.mkdirSync(path.dirname(absolutePath), { recursive: true })
        fs.writeFileSync(absolutePath, source)
      }

      const lint = spawnSync("npm", ["run", "lint", "--", "--no-cache"], {
        cwd: root,
        encoding: "utf8",
        env: process.env
      })
      expect(lint.status).not.toBe(0)
      expect(`${lint.stdout}\n${lint.stderr}`).toContain("__p01_invalid.jsx")

      const typecheck = spawnSync("npm", ["run", "typecheck"], {
        cwd: root,
        encoding: "utf8",
        env: process.env
      })
      const output = `${typecheck.stdout}\n${typecheck.stderr}`
      expect(typecheck.status).not.toBe(0)
      expect(output).toContain("src/__p01_invalid.cts")
      expect(output).toContain("renderer/src/__p01_invalid.ts")
      expect(output).toContain("scripts/verification/__p01_invalid.mts")
      expect(output).toContain("scripts/verification/__p01_invalid.ts")
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})
