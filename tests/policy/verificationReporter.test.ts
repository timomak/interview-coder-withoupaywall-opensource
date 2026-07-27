import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { describe, expect, it } from "vitest"
import {
  CONTROLLER_RESULT_PREFIX,
  FORBIDDEN_LIFECYCLE_HOOKS,
  HOSTILE_CASE_NAMES,
  aggregateExit,
  canonicalJson,
  entryFailures,
  forbiddenLifecycleHooks,
  parseCoordinatorResult,
  validateBrokerRecord,
  validateControllerEnvironment,
  validateFilesystemIdentity,
  validatePlan,
  validateTerminalRecord,
  type PlanEntry
} from "../../scripts/verification/phase-reporter.mjs"

const ROOT = process.cwd()
const FIXED_CONTROLLER =
  "/Users/Shared/InterviewCopilot/verification-controller/v1"
const HASH_A = "a".repeat(64)
const HASH_B = "b".repeat(64)

function readJson(relativePath: string) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"))
}

function resultRecord(
  payloadMutation: Record<string, unknown> = {},
  key = HASH_B
) {
  const payload = {
    bindingHash: HASH_A,
    counts: { failed: 0, passed: 1, skipped: 0 },
    entryLabel: "p01",
    includeFiles: ["tests/policy/verificationReporter.test.ts"],
    nonce: HASH_A,
    protocol: "vitest-coordinator-result-v4",
    reporter: { name: "verification-count-reporter", version: 3 },
    runner: { name: "vitest", version: "2.1.9" },
    schemaVersion: 4,
    tests: [],
    ...payloadMutation
  }
  const payloadBytes = canonicalJson(payload)
  const envelope = {
    hmacSha256: crypto
      .createHmac("sha256", key)
      .update(payloadBytes)
      .digest("hex"),
    payloadBase64: Buffer.from(payloadBytes).toString("base64")
  }
  return `${CONTROLLER_RESULT_PREFIX}${Buffer.from(
    JSON.stringify(envelope)
  ).toString("base64")}`
}

const cleanTerminal = {
  anchorReopenMatches: true,
  bindingReopenMatches: true,
  controllerAggregateExit: 0,
  finalReopen: true,
  mutationCount: 0,
  reporterAggregateExit: 0,
  survivorCount: 0
}

describe("controller boundary hostile probes", () => {
  it(HOSTILE_CASE_NAMES[0], () => {
    const packageJson = readJson("package.json")
    expect(packageJson.scripts["verify:phase"]).toBeUndefined()
    expect(packageJson.scripts["verify:reporter-injected-failure"]).toBeUndefined()

    const direct = spawnSync(
      process.execPath,
      ["scripts/verification/phase-bootstrap.mjs"],
      {
        cwd: ROOT,
        encoding: "utf8",
        input: `${canonicalJson({
          anchorSha256: HASH_A,
          phase: "P01",
          protocol: "interviewcopilot-controller-bootstrap-v1",
          role: "local",
          runBindingSha256: HASH_B,
          schemaVersion: 1
        })}\n`
      }
    )
    expect(direct.status).toBe(1)
    expect(direct.stderr).toContain("controller-only preflight")
    expect(
      fs.readFileSync(
        path.join(ROOT, "scripts/verification/phase-reporter.mjs"),
        "utf8"
      )
    ).not.toMatch(/node:child_process|\bspawn(?:Sync)?\s*\(/u)
  })

  it(HOSTILE_CASE_NAMES[1], () => {
    const scripts = readJson("package.json").scripts
    expect(forbiddenLifecycleHooks(scripts)).toEqual([])
    const injected = Object.fromEntries(
      FORBIDDEN_LIFECYCLE_HOOKS.map((name) => [name, "exit 0"])
    )
    expect(forbiddenLifecycleHooks(injected)).toEqual([
      ...FORBIDDEN_LIFECYCLE_HOOKS
    ])
  })

  it(HOSTILE_CASE_NAMES[2], () => {
    const plan = readJson("scripts/verification/plans/P01.json")
    expect(validatePlan(plan)).toEqual([])
    const hostile = structuredClone(plan)
    hostile.entries[1].argv = ["npm", "run", "verify:policy", "--", "sh"]
    expect(validatePlan(hostile).join("\n")).toContain("closed npm argv")
    hostile.entries[1].command = "npm run verify:policy"
    expect(validatePlan(hostile).join("\n")).toContain("invalid closed shape")
  })

  it(HOSTILE_CASE_NAMES[3], () => {
    const plan = readJson("scripts/verification/plans/P01.json")
    const hostile = {
      ...plan,
      testEvidenceTrustAnchor: {
        "scripts/verification/phase-reporter.mjs": HASH_A
      }
    }
    expect(validatePlan(hostile)).toContain(
      "plan has candidate-owned acceptance authority"
    )
    expect(Object.keys(plan).sort()).toEqual([
      "entries",
      "phase",
      "schemaVersion"
    ])
  })

  it(HOSTILE_CASE_NAMES[4], () => {
    const forged = resultRecord({}, HASH_A)
    expect(
      parseCoordinatorResult({
        authenticationKey: HASH_B,
        bindingHash: HASH_A,
        entryLabel: "p01",
        nonce: HASH_A,
        stdout: forged
      }).failures
    ).not.toEqual([])
    expect(
      fs.readFileSync(
        path.join(ROOT, "scripts/verification/trusted-vitest-runner.mjs"),
        "utf8"
      )
    ).not.toMatch(/expectedSha|currentHash|readFileSync/u)
  })

  it(HOSTILE_CASE_NAMES[5], () => {
    const environment = {
      CI: "1",
      NODE_ENV: "test",
      NODE_OPTIONS: "",
      PATH: `${FIXED_CONTROLLER}/toolchain/bin:/usr/bin:/bin`,
      npm_config_ignore_scripts: "true",
      npm_config_script_shell: "/bin/sh",
      npm_config_userconfig: `${FIXED_CONTROLLER}/toolchain/npmrc`
    }
    expect(validateControllerEnvironment(environment)).toEqual([])
    for (const [key, value] of [
      ["PATH", "/tmp/hostile"],
      ["NODE_OPTIONS", "--require=/tmp/hostile.cjs"],
      ["npm_config_userconfig", "/tmp/hostile.npmrc"],
      ["npm_config_script_shell", "/tmp/hostile-shell"]
    ]) {
      expect(
        validateControllerEnvironment({ ...environment, [key]: value })
      ).not.toEqual([])
    }
  })

  it(HOSTILE_CASE_NAMES[6], () => {
    expect(validateTerminalRecord(cleanTerminal)).toEqual([])
    expect(
      validateTerminalRecord({
        ...cleanTerminal,
        finalReopen: false,
        mutationCount: 2
      })
    ).not.toEqual([])
  })

  it(HOSTILE_CASE_NAMES[7], () => {
    const identity = {
      device: 1,
      extendedAcl: false,
      expectedSha256: HASH_A,
      inode: 2,
      linkCount: 1,
      mountTransition: false,
      sha256: HASH_A,
      size: 99,
      symlink: false,
      type: "regular"
    }
    expect(validateFilesystemIdentity(identity)).toEqual([])
    for (const mutation of [
      { size: 98 },
      { symlink: true },
      { linkCount: 2 },
      { mountTransition: true },
      { extendedAcl: true },
      { sha256: HASH_B }
    ]) {
      expect(
        validateFilesystemIdentity({ ...identity, ...mutation })
      ).not.toEqual([])
    }
  })

  it(HOSTILE_CASE_NAMES[8], () => {
    const valid = resultRecord()
    expect(
      parseCoordinatorResult({
        authenticationKey: HASH_B,
        bindingHash: HASH_A,
        entryLabel: "p01",
        nonce: HASH_A,
        stdout: valid
      }).failures
    ).toEqual([])
    for (const stdout of [
      "",
      `${valid}\n${valid}`,
      resultRecord({ nonce: HASH_B }),
      resultRecord({ entryLabel: "unit" }),
      resultRecord({ bindingHash: HASH_B }),
      `${CONTROLLER_RESULT_PREFIX}forged`
    ]) {
      expect(
        parseCoordinatorResult({
          authenticationKey: HASH_B,
          bindingHash: HASH_A,
          entryLabel: "p01",
          nonce: HASH_A,
          stdout
        }).failures
      ).not.toEqual([])
    }
  })

  it(HOSTILE_CASE_NAMES[9], () => {
    const record = {
      actualSpawnArgv: [
        `${FIXED_CONTROLLER}/toolchain/bin/npm`,
        "run",
        "lint"
      ],
      label: "lint",
      plannedArgv: ["npm", "run", "lint"],
      rawExit: 7,
      resolvedExecutable: `${FIXED_CONTROLLER}/toolchain/bin/npm`,
      signal: null
    }
    expect(validateBrokerRecord(record)).toEqual([])
    expect(
      validateBrokerRecord({
        ...record,
        actualSpawnArgv: [
          `${FIXED_CONTROLLER}/toolchain/bin/npm`,
          "run",
          "typecheck"
        ]
      })
    ).not.toEqual([])
  })

  it(HOSTILE_CASE_NAMES[10], () => {
    const entries: PlanEntry[] = [
      {
        argv: ["npm", "run", "lint"],
        classification: "command",
        expectedExit: 0,
        label: "lint"
      },
      {
        argv: ["npm", "run", "typecheck"],
        classification: "command",
        expectedExit: 0,
        label: "typecheck"
      }
    ]
    const rawExits = [7, 0]
    const results = entries.map((entry, index) => ({
      failures: entryFailures(entry, {
        counts: null,
        rawExit: rawExits[index],
        signal: null
      })
    }))
    expect(rawExits).toEqual([7, 0])
    expect(results).toHaveLength(2)
    expect(aggregateExit(results)).toBe(1)
  })

  it(HOSTILE_CASE_NAMES[11], () => {
    const closureSources = {
      B01: fs.readFileSync(path.join(ROOT, "electron/windowOpenPolicy.test.ts"), "utf8"),
      B02: fs.readFileSync(path.join(ROOT, "tests/policy/testManifest.test.ts"), "utf8"),
      B04: fs.readFileSync(path.join(ROOT, "tests/policy/sourceGate.test.ts"), "utf8"),
      B05: fs.readFileSync(path.join(ROOT, "tests/policy/productPolicy.test.ts"), "utf8"),
      B06: fs.readFileSync(path.join(ROOT, "tests/policy/packageInventory.test.ts"), "utf8")
    }
    for (const finding of ["B01", "B02", "B04", "B05", "B06"]) {
      expect(closureSources[finding as keyof typeof closureSources]).toContain(
        `P01-R1-${finding}`
      )
    }
    expect(
      fs.readFileSync(path.join(ROOT, "electron/captureProtection.test.ts"), "utf8")
    ).toContain("setContentProtection")
  })

  it(HOSTILE_CASE_NAMES[12], () => {
    expect(validateTerminalRecord(cleanTerminal)).toEqual([])
    expect(
      validateTerminalRecord({ ...cleanTerminal, survivorCount: 1 })
    ).not.toEqual([])
  })
})
