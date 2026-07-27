import crypto from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { describe, expect, it } from "vitest"
import {
  validateTestManifest
} from "../../scripts/verification/test-manifest.mjs"
import {
  createSourceInventory,
  discoverTestFiles
} from "../../scripts/verification/source-inventory.mjs"

function hash(bytes: string): string {
  return crypto.createHash("sha256").update(bytes).digest("hex")
}

function git(root: string, args: string[]): string {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" })
  if (result.status !== 0) {
    throw new Error(`${result.stdout}\n${result.stderr}`)
  }
  return result.stdout.trim()
}

function initializeRepository(root: string): void {
  git(root, ["init", "--quiet"])
  git(root, ["config", "user.email", "p01@example.invalid"])
  git(root, ["config", "user.name", "P01 fixture"])
}

function stage(root: string, ...relativePaths: string[]): void {
  git(root, ["add", "--force", "--", ...relativePaths])
}

function fixture(source = "it('keeps the contract', () => {})") {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "p01-manifest-"))
  initializeRepository(root)
  const relativePath = "tests/contract.test.ts"
  const absolutePath = path.join(root, relativePath)
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true })
  fs.writeFileSync(absolutePath, source)
  stage(root, relativePath)
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
        includeFiles: [relativePath],
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
    stage(unmanifested.root, "src/features/unmanifested.test.mts")
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
    initializeRepository(root)
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
    stage(root, ...files)
    const generatedTest = path.join(root, "dist/hidden.test.ts")
    fs.mkdirSync(path.dirname(generatedTest), { recursive: true })
    fs.writeFileSync(generatedTest, "it('generated', () => {})")

    expect(discoverTestFiles(root)).toEqual(files.sort())

    const adversarialCases = [
      {
        path: "src/features/uppercase.test.TS",
        tracked: true,
        expected: "noncanonical executable/test path casing"
      },
      {
        path: "src/features/case.Test.ts",
        tracked: true,
        expected: "noncanonical executable/test path casing"
      },
      {
        path: "src/.hidden/nested.test.ts",
        tracked: true,
        expected: "executable/test path in dot-directory is forbidden"
      },
      {
        path: "deep/nested/untracked.test.JSX",
        tracked: false,
        expected: "untracked executable/test candidate"
      }
    ]
    for (const testCase of adversarialCases) {
      const caseRoot = fs.mkdtempSync(path.join(os.tmpdir(), "p01-inventory-case-"))
      initializeRepository(caseRoot)
      const absolutePath = path.join(caseRoot, testCase.path)
      fs.mkdirSync(path.dirname(absolutePath), { recursive: true })
      fs.writeFileSync(absolutePath, "it('candidate', () => {})")
      if (testCase.tracked) stage(caseRoot, testCase.path)
      expect(createSourceInventory(caseRoot).errors.join("\n")).toContain(
        `${testCase.expected}: ${testCase.path}`
      )
    }

    const ignoredRoot = fs.mkdtempSync(path.join(os.tmpdir(), "p01-ignored-"))
    initializeRepository(ignoredRoot)
    fs.mkdirSync(path.join(ignoredRoot, "ignored"), { recursive: true })
    fs.writeFileSync(path.join(ignoredRoot, ".gitignore"), "ignored/\n")
    fs.writeFileSync(
      path.join(ignoredRoot, "ignored/tracked.test.ts"),
      "it('ignored but tracked', () => {})"
    )
    stage(ignoredRoot, ".gitignore", "ignored/tracked.test.ts")
    expect(discoverTestFiles(ignoredRoot)).toEqual([
      "ignored/tracked.test.ts"
    ])

    const symlinkRoot = fs.mkdtempSync(path.join(os.tmpdir(), "p01-symlink-"))
    initializeRepository(symlinkRoot)
    fs.writeFileSync(path.join(symlinkRoot, "target.test.ts"), "it('target', () => {})")
    fs.symlinkSync("target.test.ts", path.join(symlinkRoot, "linked.test.ts"))
    stage(symlinkRoot, "target.test.ts", "linked.test.ts")
    expect(createSourceInventory(symlinkRoot).errors).toEqual(
      expect.arrayContaining([
        "tracked symlink is forbidden: linked.test.ts",
        "filesystem symlink is forbidden: linked.test.ts"
      ])
    )

    const collisionRoot = fs.mkdtempSync(path.join(os.tmpdir(), "p01-case-collision-"))
    initializeRepository(collisionRoot)
    const blobPath = path.join(collisionRoot, "candidate")
    fs.writeFileSync(blobPath, "it('collision', () => {})")
    const blob = git(collisionRoot, ["hash-object", "-w", "candidate"])
    git(collisionRoot, [
      "update-index",
      "--add",
      "--cacheinfo",
      `100644,${blob},src/Case.test.ts`
    ])
    git(collisionRoot, [
      "update-index",
      "--add",
      "--cacheinfo",
      `100644,${blob},src/case.test.ts`
    ])
    expect(createSourceInventory(collisionRoot).errors.join("\n")).toContain(
      "case-colliding repository paths"
    )
  })
})
