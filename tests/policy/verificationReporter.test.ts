import crypto from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { describe, expect, it } from "vitest"
import {
  entryFailures,
  parseCoordinatorResult,
  runEntries,
  testCommandBinding,
  validatePlanManifest,
  validateTrustedTestRuntime,
  type PlanEntry
} from "../../scripts/verification/phase-reporter.mjs"

describe("verification reporter", () => {
  it("P01-R1-B03 rejects forged stdout from a zero-test child", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "p01-forged-counts-"))
    fs.writeFileSync(
      path.join(root, "package.json"),
      JSON.stringify({ scripts: {} })
    )
    const entries: PlanEntry[] = [
      {
        label: "p01",
        argv: [
          process.execPath,
          "-e",
          "console.log('VERIFICATION_COUNTS {\"passed\":999,\"failed\":0,\"skipped\":0}')"
        ],
        classification: "test",
        expectedExit: 0,
        minimumPassed: 1
      },
      {
        label: "build",
        argv: [process.execPath, "-e", "console.log('later child executed')"],
        classification: "command",
        expectedExit: 0
      }
    ]

    const result = await runEntries({
      planId: "forged-stdout",
      entries,
      artifactsDirectory: "artifacts",
      cwd: root,
      quiet: true
    })

    expect(result.report.aggregateExit).toBe(1)
    expect(result.report.entries.map((entry) => entry.rawExit)).toEqual([null, 0])
    expect(result.report.entries.map((entry) => entry.spawned)).toEqual([
      false,
      true
    ])
    expect(result.report.entries[0].counts).toBeNull()
    expect(result.report.entries[0].failures).toEqual(
      expect.arrayContaining([
        "test argv is not bound to an npm package script",
        "missing or ambiguous passed/failed/skipped counts"
      ])
    )
    expect(fs.readFileSync(result.textPath, "utf8")).toContain(
      "passed=n/a failed=n/a skipped=n/a"
    )
  })

  it("P01-R1-B03 authenticates one coordinator record and rejects every channel substitution", () => {
    expect(validateTrustedTestRuntime(process.cwd())).toEqual([])
    const entry: PlanEntry = {
      label: "p01",
      argv: [
        "npm",
        "run",
        "test:p01",
        "--",
        "--reporter=verbose"
      ],
      classification: "test",
      expectedExit: 0,
      minimumPassed: 7
    }
    const binding = testCommandBinding(entry)
    expect(binding.failures).toEqual([])
    const nonce = "a".repeat(64)
    const authenticationKey = "b".repeat(64)
    const payload = {
      schemaVersion: 3,
      protocol: "vitest-coordinator-result-v3",
      nonce,
      entryLabel: entry.label,
      bindingHash: binding.bindingHash
    }
    const envelope = (record: object, key = authenticationKey) => {
      const serialized = JSON.stringify(record)
      return `VERIFICATION_COORDINATOR_RESULT ${Buffer.from(
        JSON.stringify({
          payload: record,
          hmacSha256: crypto
            .createHmac("sha256", key)
            .update(serialized)
            .digest("hex")
        })
      ).toString("base64")}`
    }
    expect(
      parseCoordinatorResult({
        stdout: envelope(payload),
        authenticationKey,
        entry,
        nonce,
        binding
      }).failures
    ).toEqual([])

    const hostileRecords = [
      "",
      "VERIFICATION_COORDINATOR_RESULT truncated",
      `${envelope(payload)}\n${envelope(payload)}`,
      envelope(payload, "c".repeat(64)),
      envelope({ ...payload, nonce: "d".repeat(64) }),
      envelope({ ...payload, entryLabel: "unit" }),
      envelope({ ...payload, bindingHash: "e".repeat(64) })
    ]
    for (const stdout of hostileRecords) {
      expect(
        parseCoordinatorResult({
          stdout,
          authenticationKey,
          entry,
          nonce,
          binding
        }).failures.length
      ).toBeGreaterThan(0)
    }

    expect(
      Object.keys(process.env).filter((key) => key.startsWith("VERIFICATION_"))
    ).toEqual([])
    expect(process.argv.join(" ")).not.toContain(authenticationKey)
    expect(process.argv.join(" ")).not.toContain(nonce)
  })

  it("P01-R1-B03 records the exact npm argv that was actually spawned", async () => {
    const entry: PlanEntry = {
      label: "legacy",
      argv: [
        "npm",
        "run",
        "test:legacy",
        "--",
        "--reporter=verbose"
      ],
      classification: "test",
      expectedExit: 0,
      minimumPassed: 1
    }
    const result = await runEntries({
      planId: "actual-spawn-identity",
      entries: [entry],
      artifactsDirectory: ".artifacts/actual-spawn-identity",
      quiet: true
    })
    expect(result.report.aggregateExit).toBe(0)
    expect(result.report.entries[0]).toMatchObject({
      argv: entry.argv,
      actualSpawnArgv: entry.argv,
      spawnFile: "npm",
      spawned: true,
      rawExit: 0,
      failures: []
    })
  })

  it("P01-R1-B03 fails closed on script wrapper config reporter and runner tampering", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "p01-trusted-runtime-"))
    fs.mkdirSync(path.join(root, "scripts/verification"), { recursive: true })
    fs.copyFileSync("package.json", path.join(root, "package.json"))
    fs.copyFileSync("package-lock.json", path.join(root, "package-lock.json"))
    fs.copyFileSync("vitest.config.ts", path.join(root, "vitest.config.ts"))
    for (const file of [
      "source-inventory.mjs",
      "trusted-vitest-runner.mjs",
      "vitest-count-reporter.mjs"
    ]) {
      fs.copyFileSync(
        path.join("scripts/verification", file),
        path.join(root, "scripts/verification", file)
      )
    }
    fs.symlinkSync(path.join(process.cwd(), "node_modules"), path.join(root, "node_modules"))
    expect(validateTrustedTestRuntime(root)).toEqual([])

    const packageJson = JSON.parse(
      fs.readFileSync(path.join(root, "package.json"), "utf8")
    )
    packageJson.scripts["test:p01"] = "node -e \"process.exit(0)\""
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify(packageJson))
    expect(validateTrustedTestRuntime(root)).toContain(
      "trusted npm script mismatch: test:p01"
    )
    fs.copyFileSync("package.json", path.join(root, "package.json"))

    for (const relativePath of [
      "vitest.config.ts",
      "scripts/verification/source-inventory.mjs",
      "scripts/verification/trusted-vitest-runner.mjs",
      "scripts/verification/vitest-count-reporter.mjs"
    ]) {
      fs.appendFileSync(path.join(root, relativePath), "\n// tampered")
      expect(validateTrustedTestRuntime(root).join("\n")).toContain(
        `trusted test input hash mismatch: ${relativePath}`
      )
      fs.copyFileSync(relativePath, path.join(root, relativePath))
    }

    const lock = JSON.parse(
      fs.readFileSync(path.join(root, "package-lock.json"), "utf8")
    )
    lock.packages["node_modules/vitest"].integrity = "sha512-forged"
    fs.writeFileSync(path.join(root, "package-lock.json"), JSON.stringify(lock))
    expect(validateTrustedTestRuntime(root)).toContain(
      "trusted Vitest lock integrity mismatch"
    )
  })

  it("accumulates raw failures counts and immutable plan drift", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "p01-reporter-"))
    fs.writeFileSync(
      path.join(root, "package.json"),
      JSON.stringify({ scripts: {} })
    )
    const entries: PlanEntry[] = [
      {
        label: "p01",
        argv: [process.execPath, "-e", "process.exit(7)"],
        classification: "test",
        expectedExit: 0,
        minimumPassed: 1
      },
      {
        label: "build",
        argv: [process.execPath, "-e", "console.log('later child executed')"],
        classification: "command",
        expectedExit: 0
      }
    ]

    const result = await runEntries({
      planId: "injected-failure",
      entries,
      artifactsDirectory: "artifacts",
      cwd: root,
      quiet: true
    })
    expect(result.report.entries.map((entry) => entry.rawExit)).toEqual([null, 0])
    expect(result.report.aggregateExit).toBe(1)

    expect(
      entryFailures(entries[0], {
        rawExit: 0,
        signal: null,
        counts: null
      })
    ).toContain("missing or ambiguous passed/failed/skipped counts")

    const verificationRoot = path.join(root, "scripts/verification")
    fs.mkdirSync(verificationRoot, { recursive: true })
    fs.cpSync(
      path.join(process.cwd(), "scripts/verification/plan-manifest.json"),
      path.join(verificationRoot, "plan-manifest.json")
    )
    fs.cpSync(
      path.join(process.cwd(), "scripts/verification/plans"),
      path.join(verificationRoot, "plans"),
      { recursive: true }
    )
    expect(validatePlanManifest({ root })).toEqual([])
    fs.appendFileSync(path.join(verificationRoot, "plans/P01.json"), " ")
    expect(validatePlanManifest({ root })).toContain(
      "immutable argv plan drift: P01.json"
    )

    fs.copyFileSync(
      path.join(process.cwd(), "scripts/verification/plans/P01.json"),
      path.join(verificationRoot, "plans/P01.json")
    )
    fs.appendFileSync(
      path.join(verificationRoot, "plan-manifest.json"),
      " "
    )
    expect(validatePlanManifest({ root })).toContain(
      "immutable plan-manifest hash drift"
    )
  })
})
