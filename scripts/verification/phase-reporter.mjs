import crypto from "node:crypto"
import path from "node:path"

export const CONTROLLER_RESULT_PREFIX = "VERIFICATION_COORDINATOR_RESULT "
export const HOSTILE_CASE_NAMES = Object.freeze([
  "rejects archived preverify self-removal and gate mutation before reporter start",
  "rejects committed preverify and postverify companions during anchor admission",
  "suppresses companion hooks while preserving the requested npm target argv",
  "rejects joint package bootstrap plan manifest and gate mutation",
  "rejects runner plus colocated current-hash forgery",
  "rejects PATH node npm npmrc NODE_OPTIONS and script-shell substitution",
  "rejects detached-restorer and lifecycle-time mutate-restore",
  "rejects same-size overwrite rename symlink hardlink and case-collision TOCTOU",
  "rejects result-path environment stdout duplicate replay and structured-record forgery",
  "records planned argv resolved executable actual argv raw exit and signal exactly",
  "continues exact injected exits seven then zero and aggregates one",
  "preserves every P01-R1-B01 through P01-R1-B06 hostile probe",
  "rejects any surviving child or detached descendant before zero"
])

const SHA256_PATTERN = /^[a-f0-9]{64}$/
const PLAN_IDS = new Set([
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
])
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
const FORBIDDEN_EXECUTABLES = new Set([
  "bash",
  "cmd",
  "cmd.exe",
  "env",
  "fish",
  "node",
  "npm",
  "npx",
  "powershell",
  "pwsh",
  "sh",
  "zsh"
])
export const FORBIDDEN_LIFECYCLE_HOOKS = Object.freeze([
  "preinstall",
  "install",
  "postinstall",
  "prepublish",
  "preprepare",
  "prepare",
  "postprepare",
  "pretest",
  "posttest",
  "pretest:legacy",
  "posttest:legacy",
  "pretest:unit",
  "posttest:unit",
  "pretest:p01",
  "posttest:p01",
  "preverify:policy",
  "postverify:policy",
  "prelint",
  "postlint",
  "pretypecheck",
  "posttypecheck",
  "prebuild",
  "postbuild",
  "preverify:test-manifest",
  "postverify:test-manifest",
  "preverify:phase",
  "postverify:phase"
])

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

export function canonicalJson(value) {
  return JSON.stringify(sorted(value))
}

export function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex")
}

export function acceptControllerBootstrap(record) {
  const expectedKeys = [
    "anchorSha256",
    "phase",
    "protocol",
    "role",
    "runBindingSha256",
    "schemaVersion"
  ]
  if (
    !record ||
    typeof record !== "object" ||
    Array.isArray(record) ||
    JSON.stringify(Object.keys(record).sort()) !== JSON.stringify(expectedKeys) ||
    record.schemaVersion !== 1 ||
    record.protocol !== "interviewcopilot-controller-bootstrap-v1" ||
    record.phase !== "P01" ||
    record.role !== "local" ||
    !SHA256_PATTERN.test(record.anchorSha256 ?? "") ||
    !SHA256_PATTERN.test(record.runBindingSha256 ?? "")
  ) {
    throw new Error("controller bootstrap record is invalid")
  }
  return {
    anchorSha256: record.anchorSha256,
    phase: record.phase,
    protocol: "interviewcopilot-controller-bootstrap-ready-v1",
    role: record.role,
    runBindingSha256: record.runBindingSha256,
    schemaVersion: 1,
    status: "ready"
  }
}

export function forbiddenLifecycleHooks(scripts) {
  return FORBIDDEN_LIFECYCLE_HOOKS.filter((name) =>
    Object.hasOwn(scripts ?? {}, name)
  )
}

export function validateControllerEnvironment(environment) {
  const expected = {
    CI: "1",
    NODE_ENV: "test",
    NODE_OPTIONS: "",
    PATH:
      "/Users/Shared/InterviewCopilot/verification-controller/v1/toolchain/bin:/usr/bin:/bin",
    npm_config_ignore_scripts: "true",
    npm_config_script_shell: "/bin/sh",
    npm_config_userconfig:
      "/Users/Shared/InterviewCopilot/verification-controller/v1/toolchain/npmrc"
  }
  return Object.entries(expected).flatMap(([key, value]) =>
    environment?.[key] === value ? [] : [`controller environment mismatch: ${key}`]
  )
}

export function validatePlan(plan) {
  const errors = []
  if (
    !plan ||
    typeof plan !== "object" ||
    Array.isArray(plan) ||
    plan.schemaVersion !== 1 ||
    !PLAN_IDS.has(plan.phase) ||
    !Array.isArray(plan.entries) ||
    plan.entries.length === 0
  ) {
    return ["plan must be a supported schemaVersion 1 phase with entries"]
  }
  if (Object.keys(plan).some((key) => !["schemaVersion", "phase", "entries"].includes(key))) {
    errors.push("plan has candidate-owned acceptance authority")
  }
  const labels = new Set()
  let lastTest = -1
  let manifest = -1
  plan.entries.forEach((entry, index) => {
    if (
      !entry ||
      typeof entry !== "object" ||
      Array.isArray(entry) ||
      Object.keys(entry).some(
        (key) =>
          ![
            "label",
            "argv",
            "classification",
            "expectedExit",
            "minimumPassed"
          ].includes(key)
      )
    ) {
      errors.push(`entry ${index + 1} has an invalid closed shape`)
      return
    }
    if (!ALLOWED_LABELS.has(entry.label) || labels.has(entry.label)) {
      errors.push(`entry ${index + 1} has an unknown or duplicate label`)
    }
    labels.add(entry.label)
    if (
      !Array.isArray(entry.argv) ||
      entry.argv.length === 0 ||
      entry.argv.some((value) => typeof value !== "string" || value.length === 0)
    ) {
      errors.push(`entry ${index + 1} argv is invalid`)
    }
    if (
      entry.argv?.[0] !== "npm" ||
      entry.argv?.[1] !== "run" && !(index === 0 && entry.argv?.[1] === "ci") ||
      entry.argv?.some((argument, argumentIndex) =>
        argumentIndex > 0 &&
        FORBIDDEN_EXECUTABLES.has(path.basename(argument))
      )
    ) {
      errors.push(`entry ${index + 1} is not a closed npm argv`)
    }
    if (!["command", "test"].includes(entry.classification)) {
      errors.push(`entry ${index + 1} classification is invalid`)
    }
    if (!Number.isInteger(entry.expectedExit)) {
      errors.push(`entry ${index + 1} expectedExit is invalid`)
    }
    if (entry.classification === "test") {
      lastTest = index
      if (!Number.isInteger(entry.minimumPassed) || entry.minimumPassed < 1) {
        errors.push(`entry ${index + 1} minimumPassed is invalid`)
      }
    } else if (Object.hasOwn(entry, "minimumPassed")) {
      errors.push(`entry ${index + 1} has an unexpected minimumPassed`)
    }
    if (entry.label === "manifest") manifest = index
  })
  if (plan.phase !== "P12-observer" && (manifest === -1 || manifest <= lastTest)) {
    errors.push("manifest gate must run after every test entry")
  }
  return errors
}

export function entryFailures(entry, result) {
  const failures = []
  if (result.rawExit !== entry.expectedExit) {
    failures.push(
      `raw exit ${String(result.rawExit)} did not equal ${entry.expectedExit}`
    )
  }
  if (result.signal !== null) {
    failures.push(`terminated by signal ${String(result.signal)}`)
  }
  if (entry.classification === "test") {
    if (!result.counts) {
      failures.push("missing passed/failed/skipped counts")
    } else {
      if (result.counts.passed < (entry.minimumPassed ?? 1)) {
        failures.push(
          `passed=${result.counts.passed} below minimum=${entry.minimumPassed ?? 1}`
        )
      }
      if (result.counts.failed !== 0 || result.counts.skipped !== 0) {
        failures.push("nonzero failed/skipped count")
      }
    }
  }
  return failures
}

export function aggregateExit(results) {
  return results.some((result) => result.failures.length > 0) ? 1 : 0
}

export function validateBrokerRecord(record) {
  const keys = [
    "actualSpawnArgv",
    "label",
    "plannedArgv",
    "rawExit",
    "resolvedExecutable",
    "signal"
  ]
  if (
    !record ||
    typeof record !== "object" ||
    Array.isArray(record) ||
    JSON.stringify(Object.keys(record).sort()) !== JSON.stringify(keys) ||
    !Array.isArray(record.plannedArgv) ||
    !Array.isArray(record.actualSpawnArgv) ||
    typeof record.resolvedExecutable !== "string" ||
    !record.resolvedExecutable.startsWith(
      "/Users/Shared/InterviewCopilot/verification-controller/v1/"
    ) ||
    record.actualSpawnArgv[0] !== record.resolvedExecutable ||
    JSON.stringify(record.plannedArgv.slice(1)) !==
      JSON.stringify(record.actualSpawnArgv.slice(1)) ||
    !Number.isInteger(record.rawExit) ||
    !(record.signal === null || typeof record.signal === "string")
  ) {
    return ["controller broker record is invalid"]
  }
  return []
}

export function validateFilesystemIdentity(record) {
  if (
    !record ||
    record.type !== "regular" ||
    record.symlink !== false ||
    record.linkCount !== 1 ||
    record.mountTransition !== false ||
    record.extendedAcl !== false ||
    !SHA256_PATTERN.test(record.sha256 ?? "") ||
    record.sha256 !== record.expectedSha256 ||
    !Number.isInteger(record.device) ||
    !Number.isInteger(record.inode) ||
    !Number.isInteger(record.size)
  ) {
    return ["controller filesystem identity is invalid"]
  }
  return []
}

export function validateTerminalRecord(record) {
  if (
    !record ||
    record.finalReopen !== true ||
    record.anchorReopenMatches !== true ||
    record.bindingReopenMatches !== true ||
    record.mutationCount !== 0 ||
    record.survivorCount !== 0 ||
    record.controllerAggregateExit !== 0 ||
    record.reporterAggregateExit !== 0
  ) {
    return ["controller terminal record is not a clean success"]
  }
  return []
}

export function parseCoordinatorResult({
  stdout,
  authenticationKey,
  nonce,
  entryLabel,
  bindingHash
}) {
  const records = stdout
    .split(/\r?\n/u)
    .filter((line) => line.startsWith(CONTROLLER_RESULT_PREFIX))
  if (records.length !== 1) {
    return { record: null, failures: ["expected exactly one result record"] }
  }
  try {
    const envelopeBytes = Buffer.from(
      records[0].slice(CONTROLLER_RESULT_PREFIX.length),
      "base64"
    )
    const envelope = JSON.parse(envelopeBytes.toString("utf8"))
    if (
      JSON.stringify(Object.keys(envelope).sort()) !==
        JSON.stringify(["hmacSha256", "payloadBase64"]) ||
      !SHA256_PATTERN.test(envelope.hmacSha256 ?? "")
    ) {
      throw new Error("invalid result envelope")
    }
    const payloadBytes = Buffer.from(envelope.payloadBase64, "base64")
    const expectedHmac = crypto
      .createHmac("sha256", authenticationKey)
      .update(payloadBytes)
      .digest("hex")
    if (
      !crypto.timingSafeEqual(
        Buffer.from(expectedHmac, "hex"),
        Buffer.from(envelope.hmacSha256, "hex")
      )
    ) {
      throw new Error("result HMAC mismatch")
    }
    const record = JSON.parse(payloadBytes.toString("utf8"))
    if (
      canonicalJson(record) !== payloadBytes.toString("utf8") ||
      record.schemaVersion !== 4 ||
      record.protocol !== "vitest-coordinator-result-v4" ||
      record.nonce !== nonce ||
      record.entryLabel !== entryLabel ||
      record.bindingHash !== bindingHash
    ) {
      throw new Error("result payload binding mismatch")
    }
    return { record, failures: [] }
  } catch (error) {
    return {
      record: null,
      failures: [
        error instanceof Error ? error.message : "invalid result record"
      ]
    }
  }
}
