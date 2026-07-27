import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { describe, expect, it } from "vitest"
import {
  entryFailures,
  runEntries,
  validatePlanManifest,
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
    expect(result.report.entries.map((entry) => entry.rawExit)).toEqual([0, 0])
    expect(result.report.entries[0].counts).toBeNull()
    expect(result.report.entries[0].failures).toEqual(
      expect.arrayContaining([
        "test argv is not bound to an npm package script",
        "missing authenticated Vitest result record",
        "missing or ambiguous passed/failed/skipped counts"
      ])
    )
    expect(fs.readFileSync(result.textPath, "utf8")).toContain(
      "passed=n/a failed=n/a skipped=n/a"
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
    expect(result.report.entries.map((entry) => entry.rawExit)).toEqual([7, 0])
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
