import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import process from "node:process"

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
const DOWNSTREAM_FILE_PATHS = [
  "package-lock.json",
  "scripts/verification/injected-failure-proof.mjs",
  "scripts/verification/phase-bootstrap.d.mts",
  "scripts/verification/phase-bootstrap.mjs",
  "scripts/verification/phase-reporter.d.mts",
  "scripts/verification/phase-reporter.mjs",
  "scripts/verification/require-node20.mjs",
  "scripts/verification/source-inventory.d.mts",
  "scripts/verification/source-inventory.mjs",
  "scripts/verification/test-manifest.d.mts",
  "scripts/verification/test-manifest.json",
  "scripts/verification/test-manifest.mjs",
  "scripts/verification/trusted-vitest-runner.mjs",
  "scripts/verification/vitest-count-reporter.mjs",
  "tests/setup.ts",
  "vitest.config.ts"
]
const INSTALLED_VITEST_PATHS = [
  "node_modules/vitest/package.json",
  "node_modules/vitest/dist/node.js"
]
const TEST_SCRIPT_NAMES = ["test", "test:legacy", "test:unit", "test:p01"]
const PACKAGE_SCRIPT_NAMES = [
  "preinstall",
  ...TEST_SCRIPT_NAMES,
  "verify:test-manifest"
]
const FORBIDDEN_LIFECYCLE_HOOKS = [
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
  "preverify:test-manifest",
  "postverify:test-manifest",
  "preverify:phase",
  "postverify:phase"
]
const SHA256_PATTERN = /^[a-f0-9]{64}$/
const BOOTSTRAP_PATH = "scripts/verification/phase-bootstrap.mjs"
const MANIFEST_PATH = "scripts/verification/plan-manifest.json"

export function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex")
}

function exactKeys(value, expected, label, failures) {
  const actual =
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.keys(value)
      : []
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failures.push(`${label} must contain the exact keys in order`)
    return false
  }
  return true
}

function parseJson(bytes, label, failures) {
  try {
    const value = JSON.parse(bytes.toString("utf8"))
    if (`${JSON.stringify(value, null, 2)}\n` !== bytes.toString("utf8")) {
      failures.push(`${label} bytes are not canonical JSON`)
    }
    return value
  } catch {
    failures.push(`${label} is not valid JSON`)
    return null
  }
}

function readRegularFile(root, relativePath, failures) {
  const repositoryRoot = path.resolve(root)
  const absolutePath = path.resolve(repositoryRoot, relativePath)
  if (!absolutePath.startsWith(`${repositoryRoot}${path.sep}`)) {
    failures.push(`trusted path escapes repository: ${relativePath}`)
    return null
  }
  let stats
  try {
    stats = fs.lstatSync(absolutePath)
  } catch {
    failures.push(`missing trusted test input: ${relativePath}`)
    return null
  }
  if (!stats.isFile() || stats.isSymbolicLink()) {
    failures.push(`trusted test input is not a regular file: ${relativePath}`)
    return null
  }
  return fs.readFileSync(absolutePath)
}

function validateAnchorShape(anchor, failures) {
  if (
    !exactKeys(
      anchor,
      [
        "schemaVersion",
        "contract",
        "files",
        "plans",
        "packageScripts",
        "testOuterArguments",
        "forbiddenLifecycleHooks",
        "vitest"
      ],
      "P01 test-evidence trust anchor",
      failures
    )
  ) {
    return
  }
  if (
    anchor.schemaVersion !== 1 ||
    anchor.contract !== "p01-test-evidence-v1"
  ) {
    failures.push("P01 test-evidence trust anchor identity mismatch")
  }
  exactKeys(
    anchor.files,
    DOWNSTREAM_FILE_PATHS,
    "P01 anchored file table",
    failures
  )
  for (const relativePath of DOWNSTREAM_FILE_PATHS) {
    if (!SHA256_PATTERN.test(anchor.files?.[relativePath] ?? "")) {
      failures.push(`invalid anchored file hash: ${relativePath}`)
    }
  }
  exactKeys(
    anchor.plans,
    PLAN_IDS.slice(1),
    "P01 anchored plan table",
    failures
  )
  for (const planId of PLAN_IDS.slice(1)) {
    if (!SHA256_PATTERN.test(anchor.plans?.[planId] ?? "")) {
      failures.push(`invalid anchored plan hash: ${planId}`)
    }
  }
  exactKeys(
    anchor.packageScripts,
    PACKAGE_SCRIPT_NAMES,
    "anchored package boundary scripts",
    failures
  )
  if (
    Object.values(anchor.packageScripts ?? {}).some(
      (command) => typeof command !== "string" || command.length === 0
    )
  ) {
    failures.push("anchored package boundary scripts must be non-empty strings")
  }
  exactKeys(
    anchor.testOuterArguments,
    TEST_SCRIPT_NAMES,
    "anchored test outer arguments",
    failures
  )
  if (
    Object.values(anchor.testOuterArguments ?? {}).some(
      (arguments_) =>
        !Array.isArray(arguments_) ||
        arguments_.some((argument) => typeof argument !== "string")
    )
  ) {
    failures.push("anchored test outer arguments must be string arrays")
  }
  if (
    JSON.stringify(anchor.forbiddenLifecycleHooks) !==
    JSON.stringify(FORBIDDEN_LIFECYCLE_HOOKS)
  ) {
    failures.push("forbidden lifecycle-hook contract mismatch")
  }
  if (
    exactKeys(
      anchor.vitest,
      ["version", "resolved", "integrity", "installedFiles"],
      "anchored Vitest contract",
      failures
    )
  ) {
    if (
      typeof anchor.vitest.version !== "string" ||
      typeof anchor.vitest.resolved !== "string" ||
      typeof anchor.vitest.integrity !== "string"
    ) {
      failures.push("anchored Vitest lock identity is invalid")
    }
    exactKeys(
      anchor.vitest.installedFiles,
      INSTALLED_VITEST_PATHS,
      "anchored installed Vitest files",
      failures
    )
    for (const relativePath of INSTALLED_VITEST_PATHS) {
      if (!SHA256_PATTERN.test(anchor.vitest.installedFiles?.[relativePath] ?? "")) {
        failures.push(`invalid installed Vitest hash: ${relativePath}`)
      }
    }
  }
}

function validatePackageContract({
  root,
  anchor,
  bootstrapSha256,
  manifestSha256,
  failures
}) {
  const packageBytes = readRegularFile(root, "package.json", failures)
  if (!packageBytes) return
  const packageJson = parseJson(packageBytes, "package.json", failures)
  if (!packageJson) return
  const scripts = packageJson.scripts ?? {}
  for (const scriptName of PACKAGE_SCRIPT_NAMES) {
    if (scripts[scriptName] !== anchor.packageScripts?.[scriptName]) {
      failures.push(`trusted npm script mismatch: ${scriptName}`)
    }
  }
  if (
    scripts["verify:phase"] !==
    expectedVerifyPhaseScript({ bootstrapSha256, manifestSha256 })
  ) {
    failures.push("immutable verify:phase root contract mismatch")
  }
  for (const hook of anchor.forbiddenLifecycleHooks ?? []) {
    if (Object.hasOwn(scripts, hook)) {
      failures.push(`verification lifecycle hook is forbidden: ${hook}`)
    }
  }
}

function validateLockContract(root, anchor, failures) {
  const lockBytes = readRegularFile(root, "package-lock.json", failures)
  if (!lockBytes) return
  const packageLock = parseJson(lockBytes, "package-lock.json", failures)
  const record = packageLock?.packages?.["node_modules/vitest"]
  for (const field of ["version", "resolved", "integrity"]) {
    if (record?.[field] !== anchor.vitest?.[field]) {
      failures.push(`trusted Vitest lock ${field} mismatch`)
    }
  }
}

function validateInstalledVitest(root, anchor, requireInstalled, failures) {
  const states = INSTALLED_VITEST_PATHS.map((relativePath) =>
    fs.existsSync(path.resolve(root, relativePath))
  )
  if (!requireInstalled && states.every((present) => !present)) return
  for (const relativePath of INSTALLED_VITEST_PATHS) {
    const bytes = readRegularFile(root, relativePath, failures)
    if (
      bytes &&
      sha256(bytes) !== anchor.vitest?.installedFiles?.[relativePath]
    ) {
      failures.push(`trusted test input hash mismatch: ${relativePath}`)
    }
  }
}

export function expectedVerifyPhaseScript({
  bootstrapSha256,
  manifestSha256
}) {
  return (
    "node --input-type=module --eval " +
    "\"import crypto from'node:crypto';import fs from'node:fs';" +
    `const p='${BOOTSTRAP_PATH}',q='${MANIFEST_PATH}',` +
    "b=fs.readFileSync(p),m=fs.readFileSync(q)," +
    "h=x=>crypto.createHash('sha256').update(x).digest('hex');" +
    `if(h(b)!=='${bootstrapSha256}')throw new Error('immutable phase bootstrap hash drift');` +
    `if(h(m)!=='${manifestSha256}')throw new Error('immutable plan-manifest hash drift');` +
    "const x=await import('data:text/javascript;base64,'+b.toString('base64'));" +
    `await x.main(process.argv.slice(1),{manifestBytes:m,bootstrapSha256:'${bootstrapSha256}',manifestSha256:'${manifestSha256}'})" --`
  )
}

export function readPackageTrustRoot(root = process.cwd()) {
  const packageJson = JSON.parse(
    fs.readFileSync(path.resolve(root, "package.json"), "utf8")
  )
  const command = packageJson?.scripts?.["verify:phase"]
  if (typeof command !== "string") {
    throw new Error("verify:phase root contract is missing")
  }
  const bootstrapMatch = command.match(
    /immutable phase bootstrap hash drift'\);if\(h\(m\)!=='([a-f0-9]{64})'/
  )
  const leadingBootstrapMatch = command.match(
    /if\(h\(b\)!=='([a-f0-9]{64})'/
  )
  if (!leadingBootstrapMatch || !bootstrapMatch) {
    throw new Error("verify:phase root contract is malformed")
  }
  return {
    bootstrapSha256: leadingBootstrapMatch[1],
    manifestSha256: bootstrapMatch[1]
  }
}

export function validateTrustBoundary({
  root = process.cwd(),
  manifestBytes,
  bootstrapSha256,
  manifestSha256,
  requireInstalled = false
}) {
  const repositoryRoot = path.resolve(root)
  const failures = []
  if (!SHA256_PATTERN.test(bootstrapSha256 ?? "")) {
    failures.push("external bootstrap root hash is invalid")
  }
  if (!SHA256_PATTERN.test(manifestSha256 ?? "")) {
    failures.push("external plan-manifest root hash is invalid")
  }
  if (!Buffer.isBuffer(manifestBytes)) {
    failures.push("externally verified plan-manifest bytes are missing")
    manifestBytes = Buffer.alloc(0)
  } else if (sha256(manifestBytes) !== manifestSha256) {
    failures.push("immutable plan-manifest hash drift")
  }
  const currentManifestBytes = readRegularFile(
    repositoryRoot,
    MANIFEST_PATH,
    failures
  )
  if (
    currentManifestBytes &&
    !currentManifestBytes.equals(manifestBytes)
  ) {
    failures.push("plan-manifest changed after external verification")
  }

  const manifest = parseJson(
    manifestBytes,
    "plan-manifest.json",
    failures
  )
  if (
    manifest &&
    (!exactKeys(
      manifest,
      ["schemaVersion", "plans"],
      "plan manifest",
      failures
    ) ||
      manifest.schemaVersion !== 1)
  ) {
    failures.push("plan manifest schemaVersion must be 1")
  }
  exactKeys(manifest?.plans, PLAN_IDS, "plan manifest plans", failures)

  const plans = {}
  for (const planId of PLAN_IDS) {
    const record = manifest?.plans?.[planId]
    if (
      !record ||
      !exactKeys(
        record,
        ["file", "sha256"],
        `plan-manifest record ${planId}`,
        failures
      ) ||
      record.file !== `${planId}.json` ||
      !SHA256_PATTERN.test(record.sha256 ?? "")
    ) {
      failures.push(`invalid plan-manifest record for ${planId}`)
      continue
    }
    const relativePath = `scripts/verification/plans/${record.file}`
    const bytes = readRegularFile(repositoryRoot, relativePath, failures)
    if (!bytes) continue
    if (sha256(bytes) !== record.sha256) {
      failures.push(`immutable argv plan drift: ${record.file}`)
      continue
    }
    plans[planId] = parseJson(bytes, record.file, failures)
  }

  const p01 = plans.P01
  if (
    !p01 ||
    !exactKeys(
      p01,
      ["schemaVersion", "phase", "entries", "testEvidenceTrustAnchor"],
      "P01 plan",
      failures
    ) ||
    p01.schemaVersion !== 1 ||
    p01.phase !== "P01" ||
    !Array.isArray(p01.entries)
  ) {
    failures.push("P01 plan trust-root shape is invalid")
  }
  const anchor = p01?.testEvidenceTrustAnchor
  validateAnchorShape(anchor, failures)
  if (
    anchor?.files?.[BOOTSTRAP_PATH] !== bootstrapSha256
  ) {
    failures.push("P01 bootstrap anchor does not match external root")
  }
  for (const planId of PLAN_IDS.slice(1)) {
    if (manifest?.plans?.[planId]?.sha256 !== anchor?.plans?.[planId]) {
      failures.push(`anchored plan-manifest mismatch: ${planId}`)
    }
    if (
      plans[planId] &&
      Object.hasOwn(plans[planId], "testEvidenceTrustAnchor")
    ) {
      failures.push(`unexpected test-evidence trust anchor: ${planId}`)
    }
  }

  for (const relativePath of DOWNSTREAM_FILE_PATHS) {
    const bytes = readRegularFile(repositoryRoot, relativePath, failures)
    if (bytes && sha256(bytes) !== anchor?.files?.[relativePath]) {
      failures.push(`trusted test input hash mismatch: ${relativePath}`)
    }
  }
  validatePackageContract({
    root: repositoryRoot,
    anchor: anchor ?? {},
    bootstrapSha256,
    manifestSha256,
    failures
  })
  validateLockContract(repositoryRoot, anchor ?? {}, failures)
  validateInstalledVitest(
    repositoryRoot,
    anchor ?? {},
    requireInstalled,
    failures
  )
  return {
    failures: [...new Set(failures)],
    value:
      failures.length === 0
        ? {
            root: repositoryRoot,
            anchor,
            anchorDigest: sha256(
              Buffer.from(JSON.stringify(anchor), "utf8")
            ),
            manifestSha256,
            planHashes: Object.fromEntries(
              PLAN_IDS.map((planId) => [
                planId,
                manifest.plans[planId].sha256
              ])
            ),
            plans
          }
        : null
  }
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) {
    return value
  }
  Object.freeze(value)
  for (const child of Object.values(value)) deepFreeze(child)
  return value
}

export function createTrustContext({
  root = process.cwd(),
  manifestBytes,
  bootstrapSha256,
  manifestSha256
}) {
  const rootInputs = {
    root: path.resolve(root),
    manifestBytes: Buffer.from(manifestBytes),
    bootstrapSha256,
    manifestSha256
  }
  const initial = validateTrustBoundary(rootInputs)
  if (initial.failures.length > 0 || !initial.value) {
    throw new Error(initial.failures.join("\n"))
  }
  const value = deepFreeze(initial.value)
  return Object.freeze({
    ...value,
    revalidate({ requireInstalled = true } = {}) {
      return validateTrustBoundary({
        ...rootInputs,
        requireInstalled
      }).failures
    }
  })
}

async function loadVerifiedReporter(context) {
  const inventoryPath = path.resolve(
    context.root,
    "scripts/verification/source-inventory.mjs"
  )
  const reporterPath = path.resolve(
    context.root,
    "scripts/verification/phase-reporter.mjs"
  )
  const inventoryBytes = fs.readFileSync(inventoryPath)
  const reporterBytes = fs.readFileSync(reporterPath)
  if (
    sha256(inventoryBytes) !==
      context.anchor.files["scripts/verification/source-inventory.mjs"] ||
    sha256(reporterBytes) !==
      context.anchor.files["scripts/verification/phase-reporter.mjs"]
  ) {
    throw new Error("trusted reporter bytes changed after bootstrap validation")
  }
  const inventoryUrl = `data:text/javascript;base64,${inventoryBytes.toString(
    "base64"
  )}`
  const importStatement =
    'import { assertSourceInventory } from "./source-inventory.mjs"'
  const source = reporterBytes.toString("utf8")
  if (source.split(importStatement).length !== 2) {
    throw new Error("phase reporter inventory import contract mismatch")
  }
  const executableSource = source.replace(
    importStatement,
    `import { assertSourceInventory } from ${JSON.stringify(inventoryUrl)}`
  )
  return import(
    `data:text/javascript;base64,${Buffer.from(executableSource).toString(
      "base64"
    )}`
  )
}

export async function main(argv, rootInputs) {
  if (Number.parseInt(process.versions.node.split(".")[0], 10) !== 20) {
    throw new Error(
      `phase verification requires Node 20; received ${process.version}`
    )
  }
  if (
    !rootInputs ||
    !Buffer.isBuffer(rootInputs.manifestBytes) ||
    !SHA256_PATTERN.test(rootInputs.bootstrapSha256 ?? "") ||
    !SHA256_PATTERN.test(rootInputs.manifestSha256 ?? "")
  ) {
    throw new Error("phase bootstrap requires externally verified root inputs")
  }
  const context = createTrustContext({
    root: process.cwd(),
    ...rootInputs
  })
  const reporter = await loadVerifiedReporter(context)
  await reporter.runVerifiedPhase({ argv, trustContext: context })
}
