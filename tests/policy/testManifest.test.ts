import crypto from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { describe, expect, it } from "vitest"
import {
  discoverTestFiles,
  validateTestManifest
} from "../../scripts/verification/test-manifest.mjs"

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

    const hashDrift = fixture()
    fs.appendFileSync(
      path.join(hashDrift.root, hashDrift.relativePath),
      "\n// changed"
    )
    expect(validateTestManifest(hashDrift)).toContain(
      `manifest hash drift: ${hashDrift.relativePath}`
    )

    const unmanifested = fixture()
    const futurePath = path.join(
      unmanifested.root,
      "src/features/unmanifested.test.mts"
    )
    fs.mkdirSync(path.dirname(futurePath), { recursive: true })
    fs.writeFileSync(futurePath, "it('unmanifested', () => {})")
    expect(validateTestManifest(unmanifested)).toContain(
      "unmanifested test file: src/features/unmanifested.test.mts"
    )

    const executedExtra = fixture()
    executedExtra.executions[0].tests.push({
      file: "tests/extra.test.ts",
      name: "extra test",
      state: "pass"
    })
    executedExtra.executions[0].counts.passed = 2
    expect(validateTestManifest(executedExtra)).toContain(
      "executed unmanifested test: tests/extra.test.ts — extra test"
    )
  })

  it("P01-R1-B02 discovers every future root and supported extension", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "p01-discovery-"))
    const files = [
      "src/features/future.test.js",
      "src/features/future.test.jsx",
      "src/domain/future.spec.ts",
      "src/domain/future.spec.tsx",
      "scripts/qualification/future.test.mjs",
      "scripts/qualification/future.test.cjs",
      "scripts/qualification/future.spec.mts",
      "scripts/qualification/future.spec.cts"
    ]
    for (const relativePath of files) {
      const absolutePath = path.join(root, relativePath)
      fs.mkdirSync(path.dirname(absolutePath), { recursive: true })
      fs.writeFileSync(absolutePath, "it('future root', () => {})")
    }
    const generatedTest = path.join(root, "dist/hidden.test.ts")
    fs.mkdirSync(path.dirname(generatedTest), { recursive: true })
    fs.writeFileSync(generatedTest, "it('generated', () => {})")

    expect(discoverTestFiles(root)).toEqual(files.sort())
  })
})
