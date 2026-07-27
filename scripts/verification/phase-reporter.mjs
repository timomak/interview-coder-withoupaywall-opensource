import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import process from "node:process"
import { spawn } from "node:child_process"
import { fileURLToPath, pathToFileURL } from "node:url"
import { assertSourceInventory } from "./source-inventory.mjs"

const REPORTER_DIRECTORY = path.dirname(fileURLToPath(import.meta.url))
const REPOSITORY_ROOT = path.resolve(REPORTER_DIRECTORY, "../..")
const PLAN_MANIFEST_SHA256 =
  "b67a832da00933e0a8b89626f9a08de4ab2e19063146c5a9eaf07712ed38e6bf"
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
const ALLOWED_LABELS = new Set([
  "install",
  "policy",
  "lint",
  "typecheck",
  "legacy",
  "unit",
  "p01",
  "p02",
  "p03",
  "p04",
  "p05",
  "p06",
  "p07",
  "p08",
  "p09",
  "p10",
  "p11",
  "p12",
  "electron-shell",
  "coding-fixtures",
  "system-design-fixtures",
  "behavioral-fixtures",
  "audio-native",
  "audio-retention",
  "prompt-adversarial",
  "history-roundtrip",
  "plaintext-scan",
  "e2e-macos",
  "staff-live-corpus",
  "build",
  "package-mac",
  "mac-package",
  "diagnostics",
  "meet",
  "manifest",
  "release",
  "meet-observer"
])
const SHELL_EXECUTABLES = new Set([
  "bash",
  "cmd",
  "cmd.exe",
  "fish",
  "powershell",
  "pwsh",
  "sh",
  "zsh"
])
const RESULT_PREFIX = "VERIFICATION_COORDINATOR_RESULT "
const TRUSTED_TEST_SCRIPTS = {
  "test": "node scripts/verification/trusted-vitest-runner.mjs all",
  "test:legacy": "node scripts/verification/trusted-vitest-runner.mjs legacy",
  "test:unit": "node scripts/verification/trusted-vitest-runner.mjs unit",
  "test:p01": "node scripts/verification/trusted-vitest-runner.mjs p01"
}
const TRUSTED_TEST_OUTER_ARGUMENTS = {
  "test": [],
  "test:legacy": ["--", "--reporter=verbose"],
  "test:unit": ["--", "--reporter=verbose"],
  "test:p01": ["--", "--reporter=verbose"]
}
const TRUSTED_FILE_SHA256 = {
  "scripts/verification/source-inventory.mjs":
    "510273f267272ab3b2c95aa395fb3d32a08a746d54c933259497359f059d605e",
  "scripts/verification/trusted-vitest-runner.mjs":
    "d4d14f29bde175fde1c854fe71469ced8665ab16f2679200e89474098ccf0be1",
  "scripts/verification/vitest-count-reporter.mjs":
    "1a862e8ae98c57d1af251d69400bac06f8c7fdd4b1ca4340f4beb06fef90a3ff",
  "vitest.config.ts":
    "b25dce60e2facd110c3dd458304002dea228bc9e0e29ed388c182dd22108ceef"
}
const TRUSTED_VITEST = {
  version: "2.1.9",
  resolved: "https://registry.npmjs.org/vitest/-/vitest-2.1.9.tgz",
  integrity:
    "sha512-MSmPM9REYqDGBI8439mA4mWhV5sKmDlBKWIYbA3lRb2PTHACE0mgKwA8yQ2xq9vxDTuk4iPrECBAEW2aoFXY0Q==",
  installedFiles: {
    "node_modules/vitest/package.json":
      "6ea35e567829660d9832744086c18526b9ddebd5358c4a0cadfb0a355925f917",
    "node_modules/vitest/dist/node.js":
      "99a767d7e1a4c8c0a524b48ce64b8536f4bad62baf65f1fe723f19c16f87cd98"
  }
}
export function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex")
}

export function shellEscape(argument) {
  if (/^[A-Za-z0-9_./:=,@%+-]+$/.test(argument)) return argument
  return `'${argument.replaceAll("'", "'\\''")}'`
}

export function formatCommand(argv) {
  return argv.map(shellEscape).join(" ")
}

export function validatePlan(plan) {
  const errors = []
  if (
    !plan ||
    typeof plan !== "object" ||
    Array.isArray(plan) ||
    plan.schemaVersion !== 1
  ) {
    return ["plan must be a schemaVersion 1 object"]
  }
  if (!PLAN_IDS.includes(plan.phase)) {
    errors.push(`unknown phase: ${String(plan.phase)}`)
  }
  if (!Array.isArray(plan.entries) || plan.entries.length === 0) {
    errors.push("plan entries must be a non-empty array")
    return errors
  }

  const labels = new Set()
  let lastTestIndex = -1
  let manifestIndex = -1
  plan.entries.forEach((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      errors.push(`entry ${index + 1} must be an object`)
      return
    }
    if ("command" in entry || "shell" in entry) {
      errors.push(`entry ${index + 1} contains a forbidden shell string`)
    }
    if (typeof entry.label !== "string" || !ALLOWED_LABELS.has(entry.label)) {
      errors.push(`entry ${index + 1} has unknown label ${String(entry.label)}`)
    } else if (labels.has(entry.label)) {
      errors.push(`entry ${index + 1} duplicates label ${entry.label}`)
    } else {
      labels.add(entry.label)
    }
    if (
      !Array.isArray(entry.argv) ||
      entry.argv.length === 0 ||
      entry.argv.some((value) => typeof value !== "string" || value.length === 0)
    ) {
      errors.push(`entry ${index + 1} argv must be non-empty strings`)
    } else if (SHELL_EXECUTABLES.has(path.basename(entry.argv[0]))) {
      errors.push(`entry ${index + 1} may not invoke a shell`)
    }
    if (!["command", "test"].includes(entry.classification)) {
      errors.push(`entry ${index + 1} has invalid classification`)
    }
    if (!Number.isInteger(entry.expectedExit)) {
      errors.push(`entry ${index + 1} expectedExit must be an integer`)
    }
    if (entry.classification === "test") {
      lastTestIndex = index
      if (
        !Number.isInteger(entry.minimumPassed) ||
        entry.minimumPassed < 1
      ) {
        errors.push(`entry ${index + 1} minimumPassed must be at least one`)
      }
    } else if ("minimumPassed" in entry) {
      errors.push(`entry ${index + 1} is not a test but has minimumPassed`)
    }
    if (entry.label === "manifest") manifestIndex = index
  })

  if (plan.phase !== "P12-observer") {
    if (manifestIndex === -1) {
      errors.push("plan is missing the manifest gate")
    } else if (manifestIndex <= lastTestIndex) {
      errors.push("manifest gate must run after every test entry")
    }
  }
  return errors
}

export function validatePlanManifest({
  root = REPOSITORY_ROOT,
  expectedManifestHash = PLAN_MANIFEST_SHA256
} = {}) {
  const manifestPath = path.join(
    root,
    "scripts/verification/plan-manifest.json"
  )
  const manifestBytes = fs.readFileSync(manifestPath)
  const errors = []

  if (sha256(manifestBytes) !== expectedManifestHash) {
    errors.push("immutable plan-manifest hash drift")
  }

  let manifest
  try {
    manifest = JSON.parse(manifestBytes.toString("utf8"))
  } catch {
    return [...errors, "plan manifest is not valid JSON"]
  }

  if (manifest.schemaVersion !== 1) {
    errors.push("plan manifest schemaVersion must be 1")
  }
  if (
    JSON.stringify(Object.keys(manifest.plans ?? {})) !==
    JSON.stringify(PLAN_IDS)
  ) {
    errors.push("plan manifest must list the exact frozen plan IDs in order")
  }

  for (const id of PLAN_IDS) {
    const record = manifest.plans?.[id]
    if (
      !record ||
      record.file !== `${id}.json` ||
      !/^[a-f0-9]{64}$/.test(record.sha256)
    ) {
      errors.push(`invalid plan-manifest record for ${id}`)
      continue
    }
    const planPath = path.join(
      root,
      "scripts/verification/plans",
      record.file
    )
    if (!fs.existsSync(planPath)) {
      errors.push(`missing frozen plan ${record.file}`)
      continue
    }
    const planBytes = fs.readFileSync(planPath)
    if (sha256(planBytes) !== record.sha256) {
      errors.push(`immutable argv plan drift: ${record.file}`)
      continue
    }
    try {
      const planErrors = validatePlan(JSON.parse(planBytes.toString("utf8")))
      errors.push(...planErrors.map((error) => `${record.file}: ${error}`))
    } catch {
      errors.push(`${record.file} is not valid JSON`)
    }
  }
  return errors
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"))
  } catch {
    return null
  }
}

function loadTestManifest(root) {
  return readJson(
    path.join(root, "scripts/verification/test-manifest.json")
  )
}

function installedVitestVersion(root) {
  const packageJson = readJson(path.join(root, "node_modules/vitest/package.json"))
  return typeof packageJson?.version === "string" ? packageJson.version : null
}

function trustedFileFailures(root) {
  const failures = []
  for (const [relativePath, expectedHash] of Object.entries({
    ...TRUSTED_FILE_SHA256,
    ...TRUSTED_VITEST.installedFiles
  })) {
    const absolutePath = path.join(root, relativePath)
    if (!fs.existsSync(absolutePath)) {
      failures.push(`missing trusted test input: ${relativePath}`)
    } else if (sha256(fs.readFileSync(absolutePath)) !== expectedHash) {
      failures.push(`trusted test input hash mismatch: ${relativePath}`)
    }
  }
  return failures
}

export function validateTrustedTestRuntime(root = REPOSITORY_ROOT) {
  const failures = trustedFileFailures(root)
  const packageJson = readJson(path.join(root, "package.json"))
  const packageLock = readJson(path.join(root, "package-lock.json"))
  for (const [scriptName, command] of Object.entries(TRUSTED_TEST_SCRIPTS)) {
    if (packageJson?.scripts?.[scriptName] !== command) {
      failures.push(`trusted npm script mismatch: ${scriptName}`)
    }
    for (const hook of [`pre${scriptName}`, `post${scriptName}`]) {
      if (Object.hasOwn(packageJson?.scripts ?? {}, hook)) {
        failures.push(`test lifecycle hook is forbidden: ${hook}`)
      }
    }
  }

  const lockRecord = packageLock?.packages?.["node_modules/vitest"]
  for (const field of ["version", "resolved", "integrity"]) {
    if (lockRecord?.[field] !== TRUSTED_VITEST[field]) {
      failures.push(`trusted Vitest lock ${field} mismatch`)
    }
  }
  if (installedVitestVersion(root) !== TRUSTED_VITEST.version) {
    failures.push("trusted installed Vitest version mismatch")
  }
  return [...new Set(failures)]
}

export function testCommandBinding(entry, root = REPOSITORY_ROOT) {
  const failures = validateTrustedTestRuntime(root)
  let scriptName = null
  let scriptCommand = null
  const actualOuterArguments = entry.argv.slice(3)

  if (
    entry.argv[0] !== "npm" ||
    entry.argv[1] !== "run" ||
    typeof entry.argv[2] !== "string"
  ) {
    failures.push("test argv is not bound to an npm package script")
  } else {
    scriptName = entry.argv[2]
    const packageJson = readJson(path.join(root, "package.json"))
    scriptCommand = packageJson?.scripts?.[scriptName]
    if (!Object.hasOwn(TRUSTED_TEST_SCRIPTS, scriptName)) {
      failures.push(`untrusted package test script: ${String(scriptName)}`)
    } else {
      if (scriptCommand !== TRUSTED_TEST_SCRIPTS[scriptName]) {
        failures.push(`trusted npm script mismatch: ${scriptName}`)
      }
      if (
        JSON.stringify(actualOuterArguments) !==
        JSON.stringify(TRUSTED_TEST_OUTER_ARGUMENTS[scriptName])
      ) {
        failures.push(`trusted npm outer argv mismatch: ${scriptName}`)
      }
    }
  }

  const bindingHash = sha256(
    JSON.stringify({
      argv: entry.argv,
      scriptName,
      scriptCommand,
      trustedFiles: TRUSTED_FILE_SHA256,
      vitest: TRUSTED_VITEST
    })
  )
  return { bindingHash, failures, runnerName: "vitest", scriptName }
}

function validCounts(counts) {
  return (
    counts &&
    Number.isInteger(counts.passed) &&
    Number.isInteger(counts.failed) &&
    Number.isInteger(counts.skipped) &&
    counts.passed >= 0 &&
    counts.failed >= 0 &&
    counts.skipped >= 0
  )
}

export function parseCoordinatorResult({
  stdout,
  authenticationKey,
  entry,
  nonce,
  binding
}) {
  const candidateLines = stdout
    .split(/\r?\n/)
    .filter((line) => line.startsWith(RESULT_PREFIX))
  if (candidateLines.length !== 1) {
    return {
      record: null,
      failures: [
        candidateLines.length === 0
          ? "missing authenticated Vitest coordinator record"
          : "duplicate or extra Vitest coordinator records"
      ]
    }
  }

  let envelope
  try {
    const encoded = candidateLines[0].slice(RESULT_PREFIX.length)
    if (encoded.length > 4_000_000) throw new Error("oversized")
    envelope = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"))
  } catch {
    return { record: null, failures: ["malformed Vitest coordinator record"] }
  }
  const serialized = JSON.stringify(envelope?.payload)
  const expectedHmac = crypto
    .createHmac("sha256", authenticationKey)
    .update(serialized)
    .digest("hex")
  const actualHmac =
    typeof envelope?.hmacSha256 === "string" ? envelope.hmacSha256 : ""
  if (
    actualHmac.length !== expectedHmac.length ||
    !crypto.timingSafeEqual(
      Buffer.from(actualHmac),
      Buffer.from(expectedHmac)
    )
  ) {
    return { record: null, failures: ["Vitest coordinator authentication failed"] }
  }
  const record = envelope.payload
  const failures = []
  if (record?.nonce !== nonce) failures.push("test result nonce mismatch")
  if (record?.entryLabel !== entry.label) {
    failures.push("test result entry label mismatch")
  }
  if (record?.bindingHash !== binding.bindingHash) {
    failures.push("test runner binding hash mismatch")
  }
  return { record, failures }
}

export function validateTestResultRecord({
  record,
  entry,
  nonce,
  binding,
  root = REPOSITORY_ROOT
}) {
  const failures = [...binding.failures]
  if (
    !record ||
    record.schemaVersion !== 3 ||
    record.protocol !== "vitest-coordinator-result-v3"
  ) {
    return {
      counts: null,
      tests: [],
      includeFiles: [],
      failures: [...failures, "missing authenticated Vitest coordinator record"]
    }
  }
  if (record.nonce !== nonce) failures.push("test result nonce mismatch")
  if (record.entryLabel !== entry.label) {
    failures.push("test result entry label mismatch")
  }
  if (record.bindingHash !== binding.bindingHash) {
    failures.push("test runner binding hash mismatch")
  }
  if (record.runner?.name !== "vitest" || record.runner?.version !== TRUSTED_VITEST.version) {
    failures.push("test result runner identity mismatch")
  }
  if (
    record.reporter?.name !== "verification-count-reporter" ||
    record.reporter?.version !== 3
  ) {
    failures.push("test result reporter identity mismatch")
  }

  let inventory
  try {
    inventory = assertSourceInventory(root)
  } catch (error) {
    failures.push(
      `canonical inventory rejected test run: ${
        error instanceof Error ? error.message : String(error)
      }`
    )
    inventory = { testFiles: [] }
  }
  const includeFiles = Array.isArray(record.includeFiles)
    ? [...record.includeFiles].sort()
    : null
  if (
    !includeFiles ||
    JSON.stringify(includeFiles) !== JSON.stringify(inventory.testFiles)
  ) {
    failures.push("Vitest include set does not equal canonical test inventory")
  }

  const manifest = loadTestManifest(root)
  const manifestEntries = Array.isArray(manifest?.tests) ? manifest.tests : []
  const manifestByKey = new Map(
    manifestEntries.map((test) => [
      `${test.path.split(path.sep).join("/")}\u0000${test.name}`,
      test
    ])
  )
  const tests = Array.isArray(record.tests) ? record.tests : []
  if (tests.length === 0) failures.push("test result contains zero tests")

  const seen = new Set()
  const normalizedTests = []
  for (const [index, test] of tests.entries()) {
    if (
      !test ||
      typeof test.file !== "string" ||
      typeof test.name !== "string" ||
      typeof test.fullName !== "string" ||
      !["pass", "fail", "skip"].includes(test.state) ||
      !/^[a-f0-9]{64}$/.test(test.fileSha256 ?? "")
    ) {
      failures.push(`invalid test result item ${index + 1}`)
      continue
    }

    const file = test.file.split(path.sep).join("/")
    const absolutePath = path.resolve(root, file)
    if (!absolutePath.startsWith(`${path.resolve(root)}${path.sep}`)) {
      failures.push(`test result path escapes repository: ${file}`)
      continue
    }
    const key = `${file}\u0000${test.name}`
    if (seen.has(key)) {
      failures.push(`duplicate test result: ${file} — ${test.name}`)
      continue
    }
    seen.add(key)
    const manifestEntry = manifestByKey.get(key)
    if (!manifestEntry) {
      failures.push(`executed unmanifested test: ${file} — ${test.name}`)
      continue
    }
    if (!fs.existsSync(absolutePath)) {
      failures.push(`executed test file is missing: ${file}`)
      continue
    }
    const actualHash = sha256(fs.readFileSync(absolutePath))
    if (
      actualHash !== manifestEntry.sha256 ||
      actualHash !== test.fileSha256
    ) {
      failures.push(`executed test hash mismatch: ${file}`)
      continue
    }
    normalizedTests.push({ ...test, file })
  }

  const calculatedCounts = {
    passed: normalizedTests.filter((test) => test.state === "pass").length,
    failed: normalizedTests.filter((test) => test.state === "fail").length,
    skipped: normalizedTests.filter((test) => test.state === "skip").length
  }
  if (
    !validCounts(record.counts) ||
    JSON.stringify(calculatedCounts) !== JSON.stringify(record.counts)
  ) {
    failures.push("test result count evidence mismatch")
  }

  return {
    counts: failures.length === 0 ? calculatedCounts : null,
    tests: normalizedTests,
    includeFiles: includeFiles ?? [],
    failures
  }
}

export function entryFailures(entry, result) {
  const failures = [...(result.evidenceFailures ?? [])]
  if (result.signal !== null) {
    failures.push(`terminated by signal ${result.signal}`)
  } else if (result.rawExit !== entry.expectedExit) {
    failures.push(
      `raw exit ${String(result.rawExit)} did not equal ${entry.expectedExit}`
    )
  }
  if (entry.classification === "test") {
    if (!result.counts) {
      failures.push("missing or ambiguous passed/failed/skipped counts")
    } else {
      if (result.counts.failed !== 0) {
        failures.push(`failed=${result.counts.failed}`)
      }
      if (result.counts.skipped !== 0) {
        failures.push(`skipped=${result.counts.skipped}`)
      }
      if (result.counts.passed < entry.minimumPassed) {
        failures.push(
          `passed=${result.counts.passed} below minimum=${entry.minimumPassed}`
        )
      }
    }
  }
  return failures
}

export function aggregateExit(results) {
  return results.some((result) => result.failures.length > 0) ? 1 : 0
}

function nextRunDirectory(artifactsDirectory) {
  fs.mkdirSync(artifactsDirectory, { recursive: true })
  for (let index = 1; index < 10000; index += 1) {
    const candidate = path.join(
      artifactsDirectory,
      `run-${String(index).padStart(3, "0")}`
    )
    try {
      fs.mkdirSync(candidate)
      return candidate
    } catch (error) {
      if (error?.code !== "EEXIST") throw error
    }
  }
  throw new Error("verification artifact run limit reached")
}

function runChild({ entry, index, cwd, runDirectory, environment, quiet }) {
  return new Promise((resolve) => {
    const commandText = formatCommand(entry.argv)
    const logName = `${String(index + 1).padStart(2, "0")}-${entry.label}.log`
    const logPath = path.join(runDirectory, logName)
    const logStream = fs.createWriteStream(logPath, { flags: "wx" })
    const startedAt = new Date()
    const binding =
      entry.classification === "test" ? testCommandBinding(entry, cwd) : null
    const header = [
      `label=${entry.label}`,
      `command=${commandText}`,
      `started_at=${startedAt.toISOString()}`,
      ""
    ].join("\n")

    if (!quiet) process.stdout.write(`\n[${index + 1}] ${commandText}\n`)
    logStream.write(header)

    if (binding?.failures.length > 0) {
      const endedAt = new Date()
      const result = {
        label: entry.label,
        argv: entry.argv,
        actualSpawnArgv: null,
        spawnFile: null,
        spawned: false,
        command: commandText,
        classification: entry.classification,
        expectedExit: entry.expectedExit,
        rawExit: null,
        signal: null,
        counts: null,
        tests: [],
        includeFiles: [],
        evidenceFailures: binding.failures,
        startedAt: startedAt.toISOString(),
        endedAt: endedAt.toISOString(),
        durationMs: endedAt.getTime() - startedAt.getTime(),
        logPath: path.relative(cwd, logPath)
      }
      result.failures = entryFailures(entry, result)
      const footer = [
        ...binding.failures.map((failure) => `pre_spawn_failure=${failure}`),
        `raw_exit=${String(result.rawExit)}`,
        `entry_failures=${JSON.stringify(result.failures)}`,
        ""
      ].join("\n")
      logStream.end(footer, () => resolve(result))
      return
    }

    const childEnvironment = { ...environment }
    if (entry.classification === "test") {
      for (const key of Object.keys(childEnvironment)) {
        if (key.startsWith("VERIFICATION_")) delete childEnvironment[key]
      }
    } else {
      childEnvironment.VERIFICATION_ARTIFACT_DIRECTORY = runDirectory
    }
    const nonce = crypto.randomBytes(32).toString("hex")
    const authenticationKey = crypto.randomBytes(32).toString("hex")
    const challenge = {
      schemaVersion: 1,
      protocol: "vitest-controller-challenge-v1",
      nonce,
      entryLabel: entry.label,
      bindingHash: binding?.bindingHash ?? "",
      authenticationKey
    }
    const child = spawn(entry.argv[0], entry.argv.slice(1), {
      cwd,
      env: childEnvironment,
      shell: false,
      stdio:
        entry.classification === "test"
          ? ["pipe", "pipe", "pipe"]
          : ["ignore", "pipe", "pipe"]
    })

    /** @type {Buffer[]} */
    const testStdout = []
    const tee = (stream, destination, capture = false) => {
      stream.on("data", (chunk) => {
        if (capture) {
          testStdout.push(Buffer.from(chunk))
        } else {
          if (!quiet) destination.write(chunk)
          logStream.write(chunk)
        }
      })
    }
    tee(
      child.stdout,
      process.stdout,
      entry.classification === "test"
    )
    tee(child.stderr, process.stderr)
    if (entry.classification === "test") {
      child.stdin.end(`${JSON.stringify(challenge)}\n`)
    }

    child.on("error", (error) => {
      const bytes = Buffer.from(`\nchild spawn error: ${error.message}\n`)
      process.stderr.write(bytes)
      logStream.write(bytes)
    })
    child.on("close", (code, signal) => {
      const endedAt = new Date()
      const stdout = Buffer.concat(testStdout).toString("utf8")
      if (entry.classification === "test") {
        const visibleOutput = stdout
          .split(/\r?\n/)
          .filter((line) => !line.startsWith(RESULT_PREFIX))
          .join("\n")
        if (visibleOutput) {
          const bytes = Buffer.from(`${visibleOutput}\n`)
          if (!quiet) process.stdout.write(bytes)
          logStream.write(bytes)
        }
      }
      const actualSpawnArgv = [...child.spawnargs]
      const spawnIdentityFailures =
        JSON.stringify(actualSpawnArgv) === JSON.stringify(entry.argv)
          ? []
          : ["actual child spawn argv differs from recorded plan argv"]
      let evidence = {
        counts: null,
        tests: [],
        includeFiles: [],
        failures: spawnIdentityFailures
      }
      if (entry.classification === "test") {
        const parsed = parseCoordinatorResult({
          stdout,
          authenticationKey,
          entry,
          nonce,
          binding
        })
        const validated = validateTestResultRecord({
          record: parsed.record,
          entry,
          nonce,
          binding,
          root: cwd
        })
        evidence = {
          counts: validated.counts,
          tests: validated.tests,
          includeFiles: validated.includeFiles,
          failures: [
            ...spawnIdentityFailures,
            ...parsed.failures,
            ...validated.failures,
            ...validateTrustedTestRuntime(cwd).map(
              (failure) => `post-run ${failure}`
            )
          ]
        }
      }
      const result = {
        label: entry.label,
        argv: entry.argv,
        actualSpawnArgv,
        spawnFile: child.spawnfile,
        spawned: true,
        command: commandText,
        classification: entry.classification,
        expectedExit: entry.expectedExit,
        rawExit: code,
        signal: signal ?? null,
        counts: evidence.counts,
        tests: evidence.tests,
        includeFiles: evidence.includeFiles,
        evidenceFailures: evidence.failures,
        startedAt: startedAt.toISOString(),
        endedAt: endedAt.toISOString(),
        durationMs: endedAt.getTime() - startedAt.getTime(),
        logPath: path.relative(cwd, logPath)
      }
      result.failures = entryFailures(entry, result)
      const footer = [
        "",
        `ended_at=${result.endedAt}`,
        `duration_ms=${result.durationMs}`,
        `raw_exit=${String(result.rawExit)}`,
        `signal=${result.signal ?? ""}`,
        `spawn_file=${result.spawnFile}`,
        `actual_spawn_argv=${JSON.stringify(result.actualSpawnArgv)}`,
        result.counts
          ? `passed=${result.counts.passed} failed=${result.counts.failed} skipped=${result.counts.skipped}`
          : "passed=missing failed=missing skipped=missing",
        `entry_failures=${JSON.stringify(result.failures)}`,
        ""
      ].join("\n")
      logStream.end(footer, () => resolve(result))
    })
  })
}

function textReport(report) {
  const lines = [
    `plan=${report.plan}`,
    `plan_sha256=${report.planSha256}`,
    `started_at=${report.startedAt}`,
    `ended_at=${report.endedAt}`,
    `aggregate_raw_exit=${report.aggregateExit}`,
    ""
  ]
  report.entries.forEach((entry, index) => {
    lines.push(
      `[${index + 1}] label=${entry.label}`,
      `command=${entry.command}`,
      `spawned=${String(entry.spawned)}`,
      `spawn_file=${entry.spawnFile ?? ""}`,
      `actual_spawn_argv=${JSON.stringify(entry.actualSpawnArgv)}`,
      `raw_exit=${String(entry.rawExit)}`,
      `expected_exit=${entry.expectedExit}`,
      `signal=${entry.signal ?? ""}`,
      entry.counts
        ? `passed=${entry.counts.passed} failed=${entry.counts.failed} skipped=${entry.counts.skipped}`
        : "passed=n/a failed=n/a skipped=n/a",
      `started_at=${entry.startedAt}`,
      `ended_at=${entry.endedAt}`,
      `duration_ms=${entry.durationMs}`,
      `log=${entry.logPath}`,
      `failures=${JSON.stringify(entry.failures)}`,
      ""
    )
  })
  return `${lines.join("\n")}\n`
}

function writeValidatedTestLedger(runDirectory, results) {
  const ledgerPath = path.join(runDirectory, "validated-test-results.json")
  const executions = results
    .filter((result) => result.classification === "test")
    .map((result) => ({
      entryLabel: result.label,
      counts: result.counts,
      includeFiles: result.includeFiles,
      tests: result.tests
    }))
  fs.writeFileSync(
    ledgerPath,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        executions
      },
      null,
      2
    )}\n`,
    { flag: "wx" }
  )
  return ledgerPath
}

export async function runEntries({
  planId,
  planSha256 = "injected-test-plan",
  entries,
  artifactsDirectory,
  cwd = REPOSITORY_ROOT,
  environment = process.env,
  quiet = false
}) {
  const runDirectory = nextRunDirectory(path.resolve(cwd, artifactsDirectory))
  fs.mkdirSync(path.join(runDirectory, "test-results"))
  const startedAt = new Date()
  const results = []

  for (const [index, entry] of entries.entries()) {
    const entryEnvironment = { ...environment }
    if (entry.label === "manifest") {
      entryEnvironment.VERIFICATION_VALIDATED_TEST_RESULTS_PATH =
        writeValidatedTestLedger(runDirectory, results)
    }
    results.push(
      await runChild({
        entry,
        index,
        cwd,
        runDirectory,
        environment: entryEnvironment,
        quiet
      })
    )
  }

  const report = {
    schemaVersion: 1,
    plan: planId,
    planSha256,
    startedAt: startedAt.toISOString(),
    endedAt: new Date().toISOString(),
    aggregateExit: aggregateExit(results),
    entries: results
  }
  const jsonPath = path.join(runDirectory, "aggregate.json")
  const textPath = path.join(runDirectory, "aggregate.txt")
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, {
    flag: "wx"
  })
  fs.writeFileSync(textPath, textReport(report), { flag: "wx" })
  return { report, jsonPath, textPath, runDirectory }
}

function parseArguments(argv) {
  const options = {}
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]
    if (!["--phase", "--artifacts", "--role", "--pair"].includes(flag)) {
      throw new Error(`unknown argument: ${flag}`)
    }
    const value = argv[index + 1]
    if (!value || value.startsWith("--")) {
      throw new Error(`missing value for ${flag}`)
    }
    options[flag.slice(2)] = value
    index += 1
  }
  if (!options.phase || !options.artifacts) {
    throw new Error("--phase and --artifacts are required")
  }
  if (options.role && options.role !== "meet-observer") {
    throw new Error(`unknown role: ${options.role}`)
  }
  if (options.role === "meet-observer" && (!options.pair || options.phase !== "P12")) {
    throw new Error("P12 meet-observer requires --pair")
  }
  if (!options.role && options.pair) {
    throw new Error("--pair is only valid for the meet-observer role")
  }
  return options
}

function loadFrozenPlan(options) {
  const planId =
    options.phase === "P12" && options.role === "meet-observer"
      ? "P12-observer"
      : options.phase
  if (!PLAN_IDS.includes(planId) || planId === "P12-observer" && !options.role) {
    throw new Error(`unknown phase plan: ${planId}`)
  }

  const manifest = JSON.parse(
    fs.readFileSync(
      path.join(REPORTER_DIRECTORY, "plan-manifest.json"),
      "utf8"
    )
  )
  const record = manifest.plans[planId]
  const plan = JSON.parse(
    fs.readFileSync(
      path.join(REPORTER_DIRECTORY, "plans", record.file),
      "utf8"
    )
  )
  if (options.pair) {
    for (const entry of plan.entries) {
      entry.argv = entry.argv.map((argument) =>
        argument === "<one-time-pairing-url>" ? options.pair : argument
      )
    }
  }
  return { planId, plan, planSha256: record.sha256 }
}

async function main() {
  if (Number.parseInt(process.versions.node.split(".")[0], 10) !== 20) {
    throw new Error(
      `phase verification requires Node 20; received ${process.version}`
    )
  }
  const options = parseArguments(process.argv.slice(2))
  const manifestErrors = validatePlanManifest()
  if (manifestErrors.length > 0) {
    throw new Error(manifestErrors.join("\n"))
  }
  const { planId, plan, planSha256 } = loadFrozenPlan(options)
  const result = await runEntries({
    planId,
    planSha256,
    entries: plan.entries,
    artifactsDirectory: options.artifacts
  })
  console.log(
    `\nAGGREGATE raw_exit=${result.report.aggregateExit} json=${path.relative(
      REPOSITORY_ROOT,
      result.jsonPath
    )} text=${path.relative(REPOSITORY_ROOT, result.textPath)}`
  )
  process.exitCode = result.report.aggregateExit
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
