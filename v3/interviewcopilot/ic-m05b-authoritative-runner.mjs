import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import process from "node:process"
import { spawnSync } from "node:child_process"

const EXPECTED_CANDIDATE = "6d72db12de8ebda93e5b193e57144e7cf3ab22c6"
const ATTEMPT_ID = "IC-M05B-AUTH-02"
const RESULT_PREFIX = "VERIFICATION_COORDINATOR_RESULT "
const MAX_BUFFER = 128 * 1024 * 1024
const NODE20_BIN = "/opt/homebrew/opt/node@20/bin"
const SUITE_LABELS = [
  "install",
  "electron-install",
  "policy",
  "lint",
  "typecheck",
  "legacy",
  "unit",
  "p12",
  "e2e-macos",
  "staff-live-corpus",
  "manifest",
  "build",
  "diagnostics"
]
const DEFERRED_EXTERNAL_LABELS = [
  "package-mac",
  "mac-package",
  "meet",
  "release"
]

const [repositoryRoot, evidenceRoot] = process.argv.slice(2)
if (!repositoryRoot || !evidenceRoot) {
  throw new Error(
    "usage: node ic-m05b-authoritative-runner.mjs REPOSITORY EVIDENCE_ROOT"
  )
}

function sorted(value) {
  if (Array.isArray(value)) return value.map(sorted)
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sorted(value[key])])
    )
  }
  return value
}

function canonicalJson(value) {
  return JSON.stringify(sorted(value))
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex")
}

function fileSha256(filePath) {
  return sha256(fs.readFileSync(filePath))
}

function runGit(args) {
  const result = spawnSync("/usr/bin/git", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    maxBuffer: MAX_BUFFER
  })
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr.trim()}`)
  }
  return result.stdout.trim()
}

const candidate = runGit(["rev-parse", "HEAD"])
if (candidate !== EXPECTED_CANDIDATE) {
  throw new Error(`candidate mismatch: ${candidate}`)
}
if (runGit(["status", "--porcelain=v1"]) !== "") {
  throw new Error("authoritative worktree is not clean before execution")
}

fs.mkdirSync(evidenceRoot, { recursive: false })
const startedAt = new Date().toISOString()
const runId = `${ATTEMPT_ID}-${startedAt.replaceAll(/[:.]/g, "-")}`
const bindingHash = sha256(
  canonicalJson({
    candidate,
    protocol: "interviewcopilot-safe-authoritative-v1",
    runId,
    suiteLabels: SUITE_LABELS,
    deferredExternalLabels: DEFERRED_EXTERNAL_LABELS
  })
)
const npmPath = path.join(NODE20_BIN, "npm")
const nodePath = path.join(NODE20_BIN, "node")
const environment = {
  ...process.env,
  CI: "1",
  NODE_ENV: "test",
  NODE_OPTIONS: "",
  PATH: `${NODE20_BIN}:/usr/bin:/bin:/usr/sbin:/sbin`,
  npm_config_ignore_scripts: "true",
  npm_config_script_shell: "/bin/sh"
}
delete environment.VERIFICATION_VALIDATED_TEST_RESULTS_PATH

const commands = []
const executions = []

function writeLog(label, result) {
  const base = `${String(commands.length + 1).padStart(2, "0")}-${label}`
  const stdoutPath = path.join(evidenceRoot, `${base}.stdout.log`)
  const stderrPath = path.join(evidenceRoot, `${base}.stderr.log`)
  fs.writeFileSync(stdoutPath, result.stdout ?? "")
  fs.writeFileSync(stderrPath, result.stderr ?? "")
  return {
    stdoutPath,
    stderrPath,
    stdoutSha256: fileSha256(stdoutPath),
    stderrSha256: fileSha256(stderrPath)
  }
}

function runCommand(label, args, options = {}) {
  const started = new Date().toISOString()
  const executable = options.executable ?? npmPath
  const result = spawnSync(executable, args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: { ...environment, ...(options.environment ?? {}) },
    input: options.input,
    maxBuffer: MAX_BUFFER
  })
  const logs = writeLog(label, result)
  commands.push({
    label,
    argv: [executable, ...args],
    startedAt: started,
    completedAt: new Date().toISOString(),
    rawExit: result.status,
    signal: result.signal,
    ...logs
  })
  process.stdout.write(
    `${label}: exit=${String(result.status)} signal=${String(result.signal)}\n`
  )
  if (result.error) throw result.error
  if (result.status !== 0 || result.signal !== null) {
    throw new Error(`${label} failed; see ${logs.stderrPath}`)
  }
  return result
}

function validateAuthenticatedResult(label, result, challenge, minimumPassed) {
  const lines = (result.stdout ?? "")
    .split(/\r?\n/u)
    .filter((line) => line.startsWith(RESULT_PREFIX))
  if (lines.length !== 1) {
    throw new Error(`${label}: expected exactly one authenticated result`)
  }
  const envelope = JSON.parse(
    Buffer.from(lines[0].slice(RESULT_PREFIX.length), "base64").toString("utf8")
  )
  if (
    JSON.stringify(Object.keys(envelope).sort()) !==
      JSON.stringify(["hmacSha256", "payloadBase64"]) ||
    !/^[a-f0-9]{64}$/u.test(envelope.hmacSha256 ?? "")
  ) {
    throw new Error(`${label}: invalid result envelope`)
  }
  const payloadBytes = Buffer.from(envelope.payloadBase64, "base64")
  const expectedHmac = crypto
    .createHmac("sha256", challenge.authenticationKey)
    .update(payloadBytes)
    .digest("hex")
  if (
    !crypto.timingSafeEqual(
      Buffer.from(expectedHmac, "hex"),
      Buffer.from(envelope.hmacSha256, "hex")
    )
  ) {
    throw new Error(`${label}: result HMAC mismatch`)
  }
  const payloadText = payloadBytes.toString("utf8")
  const payload = JSON.parse(payloadText)
  if (
    canonicalJson(payload) !== payloadText ||
    payload.schemaVersion !== 4 ||
    payload.protocol !== "vitest-coordinator-result-v4" ||
    payload.nonce !== challenge.nonce ||
    payload.entryLabel !== label ||
    payload.bindingHash !== bindingHash
  ) {
    throw new Error(`${label}: authenticated payload binding mismatch`)
  }
  if (
    payload.counts?.passed < minimumPassed ||
    payload.counts?.failed !== 0 ||
    payload.counts?.skipped !== 0
  ) {
    throw new Error(
      `${label}: unacceptable counts ${canonicalJson(payload.counts)}`
    )
  }
  return payload
}

function runTest(label, script, minimumPassed) {
  const challenge = {
    schemaVersion: 1,
    protocol: "vitest-controller-challenge-v1",
    nonce: crypto.randomBytes(32).toString("hex"),
    entryLabel: label,
    bindingHash,
    authenticationKey: crypto.randomBytes(32).toString("hex")
  }
  const result = runCommand(label, ["run", script, "--", "--reporter=verbose"], {
    input: `${JSON.stringify(challenge)}\n`
  })
  const payload = validateAuthenticatedResult(
    label,
    result,
    challenge,
    minimumPassed
  )
  executions.push(payload)
  process.stdout.write(
    `${label}: authenticated ${payload.counts.passed} passed, ` +
      `${payload.counts.failed} failed, ${payload.counts.skipped} skipped\n`
  )
}

runCommand("install", ["ci"])
runCommand("electron-install", ["node_modules/electron/install.js"], {
  executable: nodePath
})
runCommand("policy", ["run", "verify:policy"])
runCommand("lint", ["run", "lint"])
runCommand("typecheck", ["run", "typecheck"])
runTest("legacy", "test:legacy", 1)
runTest("unit", "test:unit", 1)
runTest("p12", "test:p12", 14)
runTest("e2e-macos", "test:e2e-macos", 1)
runTest("staff-live-corpus", "test:staff-live-corpus", 1)

const ledgerPath = path.join(evidenceRoot, "validated-test-results.json")
fs.writeFileSync(
  ledgerPath,
  `${canonicalJson({
    schemaVersion: 1,
    candidate,
    runId,
    bindingHash,
    executions
  })}\n`
)

runCommand("manifest", ["run", "verify:test-manifest"], {
  environment: {
    VERIFICATION_VALIDATED_TEST_RESULTS_PATH: ledgerPath
  }
})
runCommand("build", ["run", "build"])
runCommand("diagnostics", ["run", "verify:diagnostics"])

const endingHead = runGit(["rev-parse", "HEAD"])
const endingTree = runGit(["rev-parse", "HEAD^{tree}"])
const endingStatus = runGit(["status", "--porcelain=v1"])
if (endingHead !== candidate || endingStatus !== "") {
  throw new Error("candidate identity changed during authoritative execution")
}

const resultPath = path.join(evidenceRoot, "authoritative-result.json")
fs.writeFileSync(
  resultPath,
  `${canonicalJson({
    schemaVersion: 1,
    protocol: "interviewcopilot-safe-authoritative-result-v1",
    status: "PASS_SAFE_REPOSITORY_NATIVE_AWAITING_EXTERNAL_RELEASE_BOUNDARIES",
    runId,
    candidate,
    endingTree,
    bindingHash,
    startedAt,
    completedAt: new Date().toISOString(),
    suiteLabels: SUITE_LABELS,
    deferredExternalLabels: DEFERRED_EXTERNAL_LABELS,
    commands,
    validatedTestResults: {
      path: ledgerPath,
      sha256: fileSha256(ledgerPath)
    },
    endingHead,
    endingStatus
  })}\n`
)
process.stdout.write(`PASS ${resultPath} ${fileSha256(resultPath)}\n`)
