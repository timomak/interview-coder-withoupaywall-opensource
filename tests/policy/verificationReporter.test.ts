import crypto from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { execFileSync, spawnSync } from "node:child_process"
import { describe, expect, it } from "vitest"
import {
  createTrustContext,
  readPackageTrustRoot,
  sha256,
  validateTrustBoundary
} from "../../scripts/verification/phase-bootstrap.mjs"
import {
  entryFailures,
  parseCoordinatorResult,
  runEntries,
  testCommandBinding,
  validateTrustedTestRuntime,
  type PlanEntry
} from "../../scripts/verification/phase-reporter.mjs"

const REVIEW_3_SHA = "cff6a38cffbad8d8d09cfb25981851eaf0e6e39c"
const PLAN_IDS = [
  "P01",
  "P02",
  "P03",
  "P04",
  "P05",
  "P06",
  "P07",
  "P08",
  "P09",
  "P10",
  "P11",
  "P12",
  "P12-observer"
]
const ROOT_TRUST = readPackageTrustRoot(process.cwd())

function manifestBytes(root = process.cwd()) {
  return fs.readFileSync(
    path.join(root, "scripts/verification/plan-manifest.json")
  )
}

function boundaryInputs(root = process.cwd()) {
  return {
    root,
    manifestBytes: manifestBytes(root),
    ...ROOT_TRUST
  }
}

const TRUST_CONTEXT = createTrustContext(boundaryInputs())

function writeCanonicalJson(filePath: string, value: unknown) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

function copyFile(root: string, relativePath: string) {
  const destination = path.join(root, relativePath)
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  fs.copyFileSync(path.join(process.cwd(), relativePath), destination)
}

function copyBoundaryRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "p01-trust-root-"))
  const files = [
    "package.json",
    "scripts/verification/plan-manifest.json",
    ...Object.keys(TRUST_CONTEXT.anchor.files),
    ...Object.keys(TRUST_CONTEXT.anchor.vitest.installedFiles)
  ]
  for (const planId of PLAN_IDS) {
    files.push(`scripts/verification/plans/${planId}.json`)
  }
  for (const relativePath of new Set(files)) copyFile(root, relativePath)
  expect(
    validateTrustBoundary({
      ...boundaryInputs(root),
      requireInstalled: true
    }).failures
  ).toEqual([])
  return root
}

function mutateP01Anchor(
  root: string,
  mutation: (anchor: {
    contract: string
    files: Record<string, string>
  }) => void
) {
  const planPath = path.join(root, "scripts/verification/plans/P01.json")
  const plan = JSON.parse(fs.readFileSync(planPath, "utf8"))
  mutation(plan.testEvidenceTrustAnchor)
  writeCanonicalJson(planPath, plan)
  return sha256(fs.readFileSync(planPath))
}

function updateP01Manifest(root: string, p01Sha256: string) {
  const manifestPath = path.join(
    root,
    "scripts/verification/plan-manifest.json"
  )
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"))
  manifest.plans.P01.sha256 = p01Sha256
  writeCanonicalJson(manifestPath, manifest)
}

const MALICIOUS_MANIFEST_FORGING_RUNNER = `
import crypto from "node:crypto"
import fs from "node:fs"
let input = ""
for await (const chunk of process.stdin) input += chunk.toString("utf8")
const challenge = JSON.parse(input)
const manifest = JSON.parse(fs.readFileSync("scripts/verification/test-manifest.json", "utf8"))
const tests = manifest.tests.map((test) => ({
  file: test.path,
  name: test.name,
  fullName: test.name,
  state: "pass",
  fileSha256: test.sha256
}))
const payload = {
  schemaVersion: 3,
  protocol: "vitest-coordinator-result-v3",
  runner: { name: "vitest", version: "2.1.9" },
  reporter: { name: "verification-count-reporter", version: 3 },
  includeFiles: [...new Set(manifest.tests.map((test) => test.path))].sort(),
  counts: { passed: tests.length, failed: 0, skipped: 0 },
  tests,
  nonce: challenge.nonce,
  entryLabel: challenge.entryLabel,
  bindingHash: challenge.bindingHash
}
const serialized = JSON.stringify(payload)
const envelope = {
  payload,
  hmacSha256: crypto.createHmac("sha256", challenge.authenticationKey)
    .update(serialized)
    .digest("hex")
}
console.log("VERIFICATION_COORDINATOR_RESULT " + Buffer.from(JSON.stringify(envelope)).toString("base64"))
`

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
        "trusted test boundary is unavailable",
        "test argv is not bound to an npm package script",
        "missing or ambiguous passed/failed/skipped counts"
      ])
    )
    expect(fs.readFileSync(result.textPath, "utf8")).toContain(
      "passed=n/a failed=n/a skipped=n/a"
    )
  })

  it("P01-R1-B03 authenticates one coordinator record and rejects every channel substitution", () => {
    expect(
      validateTrustedTestRuntime(process.cwd(), TRUST_CONTEXT)
    ).toEqual([])
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
    const binding = testCommandBinding(entry, process.cwd(), TRUST_CONTEXT)
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
      `${envelope(payload)}\nVERIFICATION_COORDINATOR_RESULT raced`,
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
    expect(process.argv.join(" ")).not.toMatch(
      /authentication|binding|challenge|nonce|result-path|endpoint/i
    )
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
      quiet: true,
      trustContext: TRUST_CONTEXT
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
    expect(result.report.entries[0].tests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: "renderer/src/App.test.tsx",
          state: "pass"
        })
      ])
    )
  })

  it("P01-R1-B03 fails closed on script wrapper config reporter and runner tampering", () => {
    for (const relativePath of Object.keys(TRUST_CONTEXT.anchor.files)) {
      const root = copyBoundaryRoot()
      fs.appendFileSync(path.join(root, relativePath), "\n// hostile mutation\n")
      const failures = validateTrustBoundary({
        ...boundaryInputs(root),
        requireInstalled: true
      }).failures
      expect(failures.join("\n")).toContain(
        `trusted test input hash mismatch: ${relativePath}`
      )
    }

    for (const relativePath of Object.keys(
      TRUST_CONTEXT.anchor.vitest.installedFiles
    )) {
      const root = copyBoundaryRoot()
      fs.appendFileSync(path.join(root, relativePath), "\n ")
      expect(
        validateTrustBoundary({
          ...boundaryInputs(root),
          requireInstalled: true
        }).failures.join("\n")
      ).toContain(`trusted test input hash mismatch: ${relativePath}`)
    }

    for (const scriptName of Object.keys(
      TRUST_CONTEXT.anchor.packageScripts
    )) {
      const root = copyBoundaryRoot()
      const packagePath = path.join(root, "package.json")
      const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"))
      packageJson.scripts[scriptName] = "node -e \"process.exit(0)\""
      writeCanonicalJson(packagePath, packageJson)
      expect(
        validateTrustBoundary({
          ...boundaryInputs(root),
          requireInstalled: true
        }).failures
      ).toContain(`trusted npm script mismatch: ${scriptName}`)
    }

    for (const hook of TRUST_CONTEXT.anchor.forbiddenLifecycleHooks) {
      const root = copyBoundaryRoot()
      const packagePath = path.join(root, "package.json")
      const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"))
      packageJson.scripts[hook] = "node -e \"process.exit(0)\""
      writeCanonicalJson(packagePath, packageJson)
      expect(
        validateTrustBoundary({
          ...boundaryInputs(root),
          requireInstalled: true
        }).failures
      ).toContain(`verification lifecycle hook is forbidden: ${hook}`)
    }

    const lockRoot = copyBoundaryRoot()
    const lockPath = path.join(lockRoot, "package-lock.json")
    const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"))
    lock.packages["node_modules/vitest"].integrity = "sha512-forged"
    writeCanonicalJson(lockPath, lock)
    expect(
      validateTrustBoundary({
        ...boundaryInputs(lockRoot),
        requireInstalled: true
      }).failures
    ).toEqual(
      expect.arrayContaining([
        "trusted test input hash mismatch: package-lock.json",
        "trusted Vitest lock integrity mismatch"
      ])
    )
  })

  it("P01-R1-B03 rejects the exact manifest-forging runner plus synthesized current hashes before evidence", () => {
    const root = copyBoundaryRoot()
    const wrapperPath = path.join(
      root,
      "scripts/verification/trusted-vitest-runner.mjs"
    )
    fs.writeFileSync(wrapperPath, MALICIOUS_MANIFEST_FORGING_RUNNER)
    const reporterPath = path.join(
      root,
      "scripts/verification/phase-reporter.mjs"
    )
    fs.appendFileSync(
      reporterPath,
      `\n// attacker-updated former TRUSTED_FILE_SHA256=${sha256(
        fs.readFileSync(wrapperPath)
      )}\n`
    )
    const synthesizedP01Hash = mutateP01Anchor(root, (anchor) => {
      anchor.files["scripts/verification/trusted-vitest-runner.mjs"] =
        sha256(fs.readFileSync(wrapperPath))
      anchor.files["scripts/verification/phase-reporter.mjs"] =
        sha256(fs.readFileSync(reporterPath))
    })
    updateP01Manifest(root, synthesizedP01Hash)

    const validation = validateTrustBoundary({
      ...boundaryInputs(root),
      requireInstalled: true
    })
    expect(validation.value).toBeNull()
    expect(validation.failures).toContain("immutable plan-manifest hash drift")

    const run = spawnSync(
      "npm",
      [
        "run",
        "verify:phase",
        "--",
        "--phase",
        "P01",
        "--artifacts",
        "artifacts"
      ],
      { cwd: root, encoding: "utf8", env: process.env }
    )
    expect(run.status).not.toBe(0)
    expect(`${run.stdout}\n${run.stderr}`).toContain(
      "immutable plan-manifest hash drift"
    )
    expect(fs.existsSync(path.join(root, "artifacts"))).toBe(false)
  })

  it("P01-R1-B03 rejects independent and joint bootstrap plan anchor and manifest mutations", () => {
    const cases = [
      {
        name: "bootstrap",
        mutate(root: string) {
          fs.appendFileSync(
            path.join(root, "scripts/verification/phase-bootstrap.mjs"),
            "\n// mutated\n"
          )
        },
        reason: "trusted test input hash mismatch: scripts/verification/phase-bootstrap.mjs"
      },
      {
        name: "plan",
        mutate(root: string) {
          const planPath = path.join(
            root,
            "scripts/verification/plans/P01.json"
          )
          fs.appendFileSync(planPath, " ")
        },
        reason: "immutable argv plan drift: P01.json"
      },
      {
        name: "manifest",
        mutate(root: string) {
          const manifestPath = path.join(
            root,
            "scripts/verification/plan-manifest.json"
          )
          fs.appendFileSync(manifestPath, " ")
        },
        reason: "immutable plan-manifest hash drift"
      },
      {
        name: "anchor and manifest",
        mutate(root: string) {
          const p01Hash = mutateP01Anchor(root, (anchor) => {
            anchor.contract = "attacker-current-values"
          })
          updateP01Manifest(root, p01Hash)
        },
        reason: "immutable plan-manifest hash drift"
      },
      {
        name: "bootstrap anchor and manifest",
        mutate(root: string) {
          const bootstrapPath = path.join(
            root,
            "scripts/verification/phase-bootstrap.mjs"
          )
          fs.appendFileSync(bootstrapPath, "\n// attacker validator\n")
          const p01Hash = mutateP01Anchor(root, (anchor) => {
            anchor.files["scripts/verification/phase-bootstrap.mjs"] =
              sha256(fs.readFileSync(bootstrapPath))
          })
          updateP01Manifest(root, p01Hash)
        },
        reason: "immutable plan-manifest hash drift"
      }
    ]

    for (const hostile of cases) {
      const root = copyBoundaryRoot()
      hostile.mutate(root)
      const result = validateTrustBoundary({
        ...boundaryInputs(root),
        requireInstalled: true
      })
      expect(
        result.failures.join("\n"),
        `${hostile.name} must fail against the external root`
      ).toContain(hostile.reason)
      expect(result.value).toBeNull()
    }

    const racedRoot = copyBoundaryRoot()
    const context = createTrustContext(boundaryInputs(racedRoot))
    fs.appendFileSync(
      path.join(racedRoot, "scripts/verification/plan-manifest.json"),
      " "
    )
    expect(context.revalidate({ requireInstalled: true })).toContain(
      "plan-manifest changed after external verification"
    )
  })

  it("preserves all thirteen frozen plan entry contracts from review-3", () => {
    const finalManifest = JSON.parse(manifestBytes().toString("utf8"))
    const priorManifest = JSON.parse(
      execFileSync(
        "git",
        ["show", `${REVIEW_3_SHA}:scripts/verification/plan-manifest.json`],
        { encoding: "utf8" }
      )
    )
    for (const planId of PLAN_IDS) {
      const finalPlan = JSON.parse(
        fs.readFileSync(
          path.join(
            process.cwd(),
            `scripts/verification/plans/${planId}.json`
          ),
          "utf8"
        )
      )
      const priorPlan = JSON.parse(
        execFileSync(
          "git",
          [
            "show",
            `${REVIEW_3_SHA}:scripts/verification/plans/${planId}.json`
          ],
          { encoding: "utf8" }
        )
      )
      expect(finalPlan.entries).toEqual(priorPlan.entries)
      if (planId !== "P01") {
        expect(finalManifest.plans[planId]).toEqual(
          priorManifest.plans[planId]
        )
      }
    }
  })

  it("accumulates raw failures counts and immutable plan drift", async () => {
    const entries: PlanEntry[] = [
      {
        label: "p01",
        argv: [process.execPath, "-e", "process.exit(7)"],
        classification: "command",
        expectedExit: 0
      },
      {
        label: "build",
        argv: [
          process.execPath,
          "-e",
          "console.log('later child executed')"
        ],
        classification: "command",
        expectedExit: 0
      }
    ]

    const root = fs.mkdtempSync(path.join(os.tmpdir(), "p01-injected-"))
    const result = await runEntries({
      planId: "injected-failure",
      entries,
      artifactsDirectory: "artifacts",
      cwd: root,
      quiet: true
    })
    expect(result.report.aggregateExit).toBe(1)
    expect(result.report.entries.map((entry) => entry.rawExit)).toEqual([7, 0])
    expect(result.report.entries.map((entry) => entry.spawned)).toEqual([
      true,
      true
    ])
    expect(
      result.report.entries.map((entry) => entry.actualSpawnArgv)
    ).toEqual(entries.map((entry) => entry.argv))
    expect(
      fs.readFileSync(
        path.join(root, result.report.entries[1].logPath),
        "utf8"
      )
    ).toContain("later child executed")

    expect(
      entryFailures(
        {
          label: "legacy",
          argv: [],
          classification: "test",
          expectedExit: 0,
          minimumPassed: 1
        },
        {
          rawExit: 0,
          signal: null,
          counts: null
        }
      )
    ).toContain("missing or ambiguous passed/failed/skipped counts")
  })
})
