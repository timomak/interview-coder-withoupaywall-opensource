import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import {
  aggregateExit,
  entryFailures,
  parseTestCounts,
  type PlanEntry
} from "../../scripts/verification/phase-reporter.mjs"

const INHERITED_CRA_SHA256 =
  "1f0914ca057e799130da87a78d48021657aba67e01fcbcb50b099944ee2ea864"

describe("local gate contract", () => {
  it("executes the inherited CRA test and rejects a zero-test run", () => {
    const craTest = fs.readFileSync(
      path.join(process.cwd(), "renderer/src/App.test.tsx")
    )
    expect(crypto.createHash("sha256").update(craTest).digest("hex")).toBe(
      INHERITED_CRA_SHA256
    )

    const p01Plan = JSON.parse(
      fs.readFileSync(
        path.join(
          process.cwd(),
          "scripts/verification/plans/P01.json"
        ),
        "utf8"
      )
    )
    expect(p01Plan.entries.find((entry: PlanEntry) => entry.label === "legacy"))
      .toMatchObject({
        argv: [
          "npm",
          "run",
          "test:legacy",
          "--",
          "--reporter=verbose"
        ],
        classification: "test",
        minimumPassed: 1
      })

    const zeroCounts = parseTestCounts(
      'VERIFICATION_COUNTS {"passed":0,"failed":0,"skipped":0}'
    )
    expect(
      entryFailures(
        {
          label: "legacy",
          argv: [],
          classification: "test",
          expectedExit: 0,
          minimumPassed: 1
        },
        { rawExit: 0, signal: null, counts: zeroCounts }
      )
    ).toContain("passed=0 below minimum=1")
  })

  it("propagates every child gate exit code", () => {
    const p01Plan = JSON.parse(
      fs.readFileSync(
        path.join(
          process.cwd(),
          "scripts/verification/plans/P01.json"
        ),
        "utf8"
      )
    )
    const requiredLabels = ["lint", "typecheck", "unit", "build"]
    const failures = requiredLabels.map((label) => {
      const entry = p01Plan.entries.find(
        (candidate: PlanEntry) => candidate.label === label
      ) as PlanEntry
      const result = {
        rawExit: 23,
        signal: null,
        counts:
          entry.classification === "test"
            ? { passed: 1, failed: 0, skipped: 0 }
            : null
      }
      return {
        failures: entryFailures(entry, result)
      }
    })

    expect(failures.every((result) => result.failures.length > 0)).toBe(true)
    expect(aggregateExit(failures)).toBe(1)
  })
})
