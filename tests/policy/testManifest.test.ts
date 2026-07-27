import crypto from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { validateTestManifest } from "../../scripts/verification/test-manifest.mjs"

function hash(bytes: string): string {
  return crypto.createHash("sha256").update(bytes).digest("hex")
}

function fixture(source = "it('keeps the contract', () => {})") {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "p01-manifest-"))
  const relativePath = "tests/contract.test.ts"
  const absolutePath = path.join(root, relativePath)
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true })
  fs.writeFileSync(absolutePath, source)
  return {
    root,
    relativePath,
    manifest: {
      schemaVersion: 1,
      tests: [
        {
          path: relativePath,
          name: "keeps the contract",
          sha256: hash(source)
        }
      ]
    },
    executions: [
      {
        entryLabel: "p01",
        counts: { passed: 1, failed: 0, skipped: 0 },
        tests: [
          {
            file: relativePath,
            name: "keeps the contract",
            state: "pass" as const
          }
        ]
      }
    ]
  }
}

describe("immutable test manifest", () => {
  it("rejects missing renamed skipped and unexecuted tests", () => {
    const missing = fixture()
    fs.rmSync(path.join(missing.root, missing.relativePath))
    expect(validateTestManifest(missing)).toContain(
      `missing or renamed manifest file: ${missing.relativePath}`
    )

    const renamed = fixture()
    renamed.executions[0].tests[0].name = "renamed contract"
    expect(validateTestManifest(renamed)).toContain(
      `manifest test was not executed: ${renamed.relativePath} — keeps the contract`
    )

    const skippedSource = [
      "it",
      ".",
      "skip",
      "('keeps the contract', () => {})"
    ].join("")
    const skipped = fixture(skippedSource)
    expect(validateTestManifest(skipped)).toContain(
      `forbidden skip form: ${skipped.relativePath}`
    )

    const forbiddenForms = [
      {
        label: "todo",
        source: ["it", ".", "todo", "('keeps the contract')"].join("")
      },
      {
        label: "xit",
        source: ["x", "it", "('keeps the contract', () => {})"].join("")
      },
      {
        label: "xdescribe",
        source: [
          "x",
          "describe",
          "('keeps the contract', () => {})"
        ].join("")
      }
    ]
    for (const forbidden of forbiddenForms) {
      const testFixture = fixture(forbidden.source)
      expect(validateTestManifest(testFixture)).toContain(
        `forbidden ${forbidden.label} form: ${testFixture.relativePath}`
      )
    }

    const unexecuted = fixture()
    unexecuted.executions = []
    expect(validateTestManifest(unexecuted)).toContain(
      `manifest test was not executed: ${unexecuted.relativePath} — keeps the contract`
    )
  })
})
