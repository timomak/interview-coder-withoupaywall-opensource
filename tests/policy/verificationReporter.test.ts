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
  it("accumulates raw failures counts and immutable plan drift", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "p01-reporter-"))
    const entries: PlanEntry[] = [
      {
        label: "p01",
        argv: [
          process.execPath,
          "-e",
          "console.log('VERIFICATION_COUNTS {\"passed\":1,\"failed\":0,\"skipped\":0}'); process.exit(7)"
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
      planId: "injected-failure",
      entries,
      artifactsDirectory: "artifacts",
      cwd: root,
      quiet: true
    })

    expect(result.report.aggregateExit).toBe(1)
    expect(result.report.entries.map((entry) => entry.rawExit)).toEqual([7, 0])
    expect(result.report.entries[0].counts).toEqual({
      passed: 1,
      failed: 0,
      skipped: 0
    })
    expect(fs.readFileSync(result.jsonPath, "utf8")).toContain('"rawExit": 7')
    expect(fs.readFileSync(result.textPath, "utf8")).toContain("raw_exit=7")
    expect(fs.readFileSync(result.textPath, "utf8")).toContain(
      "raw_exit=0"
    )

    expect(
      entryFailures(entries[0], {
        rawExit: 0,
        signal: null,
        counts: null
      })
    ).toContain("missing or ambiguous passed/failed/skipped counts")

    const verificationRoot = path.join(
      root,
      "scripts/verification"
    )
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
    fs.appendFileSync(
      path.join(verificationRoot, "plans/P01.json"),
      " "
    )
    expect(validatePlanManifest({ root })).toContain(
      "immutable argv plan drift: P01.json"
    )
  })
})
