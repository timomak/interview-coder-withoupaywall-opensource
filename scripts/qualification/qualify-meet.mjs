import fs from "node:fs"
import path from "node:path"
import process from "node:process"
import { createRequire } from "node:module"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { assertPinnedCheckoutUnchanged, requireExternalReleaseBoundary } from "./release-preflight.mjs"
import { validateAllQualificationEvidence } from "./validate-evidence.mjs"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const require = createRequire(import.meta.url)
const GENERATED_MEMBERS = new Set([
  "raw/local-marker-events.ndjson",
  "raw/local-control-events.ndjson",
  "raw/remote-observer-events.ndjson",
  "raw/remote-observer.mov"
])

/** @param {string} parent @param {string} label */
function oneRun(parent, label) {
  if (!fs.existsSync(parent)) throw new Error(`Missing ${label}: ${parent}`)
  const runs = fs.readdirSync(parent, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink() && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(entry.name))
    .map((entry) => entry.name)
  if (runs.length !== 1) throw new Error(`${label} must contain exactly one immutable run`)
  return runs[0]
}

/** @param {string} rootPath @param {string} relative */
function safeRead(rootPath, relative) {
  if (!/^[a-z0-9][a-z0-9./-]*$/.test(relative) || relative.includes("..")) {
    throw new Error("Qualification external member path is invalid")
  }
  const target = path.resolve(rootPath, relative)
  if (!target.startsWith(`${path.resolve(rootPath)}${path.sep}`)) throw new Error("Qualification external member escapes its inbox")
  const realRoot = fs.realpathSync(rootPath)
  const realTarget = fs.realpathSync(target)
  if (!realTarget.startsWith(`${realRoot}${path.sep}`)) throw new Error("Qualification external member resolves outside its inbox")
  let cursor = path.dirname(target)
  while (cursor.startsWith(path.resolve(rootPath))) {
    const parent = fs.lstatSync(cursor)
    if (!parent.isDirectory() || parent.isSymbolicLink() || (parent.mode & 0o022) !== 0) {
      throw new Error(`Qualification external member crosses an unsafe directory: ${relative}`)
    }
    if (cursor === path.resolve(rootPath)) break
    cursor = path.dirname(cursor)
  }
  const stat = fs.lstatSync(target)
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || (stat.mode & 0o022) !== 0) {
    throw new Error(`Qualification external member is unsafe: ${relative}`)
  }
  return fs.readFileSync(target)
}

/** @param {string} rootPath */
function externalMemberInventory(rootPath) {
  const root = path.resolve(rootPath)
  /** @type {string[]} */
  const members = []
  /** @param {string} directory */
  const visit = (directory) => {
    const stat = fs.lstatSync(directory)
    if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o022) !== 0) {
      throw new Error("Qualification external inbox contains an unsafe directory")
    }
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const candidate = path.join(directory, entry.name)
      if (entry.isSymbolicLink()) throw new Error("Qualification external inbox contains a symbolic link")
      if (entry.isDirectory()) visit(candidate)
      else if (entry.isFile()) members.push(path.relative(root, candidate))
      else throw new Error("Qualification external inbox contains an unsupported member")
    }
  }
  visit(root)
  return members.sort()
}

/** @param {string} checkoutRoot @param {string} directory */
function ensurePrivateDirectory(checkoutRoot, directory) {
  const base = path.resolve(checkoutRoot)
  const target = path.resolve(directory)
  if (!target.startsWith(`${base}${path.sep}`)) throw new Error("Qualification receipt directory escapes the checkout")
  let cursor = base
  for (const segment of path.relative(base, target).split(path.sep)) {
    cursor = path.join(cursor, segment)
    if (!fs.existsSync(cursor)) fs.mkdirSync(cursor, { mode: 0o700 })
    const stat = fs.lstatSync(cursor)
    if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o022) !== 0) {
      throw new Error("Qualification receipt directory is unsafe")
    }
  }
}

/** @param {string} checkoutRoot @param {string} target @param {Buffer} bytes */
function writeImmutableReceipt(checkoutRoot, target, bytes) {
  ensurePrivateDirectory(checkoutRoot, path.dirname(target))
  if (fs.existsSync(target)) {
    if (!fs.readFileSync(target).equals(bytes)) throw new Error("Existing independent review receipt disagrees")
    return
  }
  fs.writeFileSync(target, bytes, { flag: "wx", mode: 0o444 })
}

/**
 * @param {string} checkoutRoot
 * @param {any} pinned
 * @param {Record<string, unknown>} entry
 * @param {"entire-display" | "specific-window"} scope
 * @param {"M01" | "M02"} procedure
 * @param {{LiveQualificationProcedure: any; validateQualificationBundle: any; protocol: any}} runtime
 */
export function finalizeQualificationRun(checkoutRoot, pinned, entry, scope, procedure, runtime) {
  const procedureRoot = path.join(checkoutRoot, ".artifacts/qualification", pinned.matrix.matrixRevision, String(entry.tupleId), procedure)
  const runId = oneRun(procedureRoot, `${entry.tupleId}/${procedure}`)
  const runRoot = path.join(procedureRoot, runId)
  const externalRoot = path.join(
    checkoutRoot,
    ".artifacts/qualification-external",
    pinned.matrix.matrixRevision,
    String(entry.tupleId),
    procedure,
    runId
  )
  const exactMembers = [
    ...runtime.protocol.EVIDENCE_MEMBER_PATHS,
    ...runtime.protocol.BUNDLE_MEMBER_PATHS,
    "bundle-manifest.json"
  ]
  const expectedExternal = [
    ...exactMembers.filter((relative) => !GENERATED_MEMBERS.has(relative)),
    "independent-review.json"
  ].sort()
  if (JSON.stringify(externalMemberInventory(externalRoot)) !== JSON.stringify(expectedExternal)) {
    throw new Error("Qualification external inbox member set is invalid")
  }
  const files = new Map()
  const external = new Map()
  for (const relative of exactMembers) {
    const bytes = GENERATED_MEMBERS.has(relative)
      ? safeRead(runRoot, relative)
      : safeRead(externalRoot, relative)
    files.set(relative, bytes)
    if (!GENERATED_MEMBERS.has(relative)) external.set(relative, bytes)
  }
  const independentReview = safeRead(externalRoot, "independent-review.json")
  const releasePackage = pinned.statementPayload.packages.find(
    /** @param {Record<string, unknown>} candidate */
    (candidate) => candidate.architecture === entry.architecture
  )
  if (!releasePackage) throw new Error(`Statement lacks package for ${entry.architecture}`)

  // Validate the complete candidate entirely in memory before the collector
  // is allowed to add a single external byte to the immutable raw run.
  runtime.validateQualificationBundle(
    files,
    independentReview,
    pinned.matrix,
    {
      expectedRcSha: pinned.expectedRcSha,
      matrixRevision: pinned.matrix.matrixRevision,
      tupleId: entry.tupleId,
      scope,
      runId
    },
    {
      appSemver: pinned.statementPayload.appSemver,
      packageSha256: releasePackage.packageSha256,
      signingTeamId: releasePackage.signingTeamId,
      signingCertificateSha256: releasePackage.signingCertificateSha256,
      notarizationTicketId: releasePackage.notarizationTicketId
    }
  )

  const reviewPath = path.join(
    checkoutRoot,
    ".artifacts/qualification-reviews",
    pinned.matrix.matrixRevision,
    String(entry.tupleId),
    procedure,
    runId,
    "independent-review.json"
  )
  writeImmutableReceipt(checkoutRoot, reviewPath, independentReview)
  const live = new runtime.LiveQualificationProcedure(procedureRoot, pinned.matrix)
  live.sealBundle(runId, external)
}

/** @param {string} checkoutRoot @param {any} pinned */
function finalizeAwaitingRuns(checkoutRoot, pinned) {
  const protocol = require(path.join(checkoutRoot, "dist-electron/qualification/protocol.js"))
  const { LiveQualificationProcedure } = require(path.join(checkoutRoot, "dist-electron/qualification/liveProcedure.js"))
  const { validateQualificationBundle } = require(path.join(checkoutRoot, "dist-electron/qualification/artifactValidator.js"))
  const runtime = { LiveQualificationProcedure, validateQualificationBundle, protocol }
  /** @type {Array<["entire-display" | "specific-window", "M01" | "M02"]>} */
  const procedures = [["entire-display", "M01"], ["specific-window", "M02"]]
  for (const entry of pinned.matrix.entries) {
    for (const [scope, procedure] of procedures) {
      const procedureRoot = path.join(checkoutRoot, ".artifacts/qualification", pinned.matrix.matrixRevision, entry.tupleId, procedure)
      const runId = oneRun(procedureRoot, `${entry.tupleId}/${procedure}`)
      if (!fs.existsSync(`${path.join(procedureRoot, runId)}.collector-state/finalized.json`)) {
        finalizeQualificationRun(checkoutRoot, pinned, entry, scope, procedure, runtime)
      }
    }
  }
}

export function main() {
try {
  if (process.argv.length > 3 || (process.argv[2] !== undefined && process.argv[2] !== "--collect-missing")) {
    throw new Error("qualify:meet accepts only the fixed --collect-missing procedure flag")
  }
  const pinned = requireExternalReleaseBoundary(root)
  try {
    validateAllQualificationEvidence(root, pinned)
  } catch (initialError) {
    if (process.argv[2] !== "--collect-missing") throw initialError
    const electron = path.join(root, "node_modules/.bin/electron")
    if (!fs.existsSync(electron)) throw new Error("Packaged qualification launcher is unavailable")
    for (const entry of pinned.matrix.entries) {
      for (const [scope, procedure] of [["entire-display", "M01"], ["specific-window", "M02"]]) {
        const procedureRoot = path.join(root, ".artifacts/qualification", pinned.matrix.matrixRevision, entry.tupleId, procedure)
        if (fs.existsSync(procedureRoot) && fs.readdirSync(procedureRoot).length > 0) continue
        const launched = spawnSync(electron, [root, "--qualification-collect"], {
          cwd: root,
          stdio: "inherit",
          env: {
            PATH: process.env.PATH,
            HOME: process.env.HOME,
            INTERVIEWCOPILOT_QUALIFICATION_RC: pinned.expectedRcSha,
            INTERVIEWCOPILOT_QUALIFICATION_MATRIX: pinned.matrix.matrixRevision,
            INTERVIEWCOPILOT_QUALIFICATION_TUPLE: entry.tupleId,
            INTERVIEWCOPILOT_QUALIFICATION_SCOPE: scope,
            INTERVIEWCOPILOT_QUALIFICATION_ROOT: path.join(root, ".artifacts/qualification"),
            INTERVIEWCOPILOT_QUALIFICATION_MATRIX_JSON: JSON.stringify(pinned.matrix)
          }
        })
        if (launched.status !== 0) throw new Error(`Interactive ${entry.tupleId}/${scope} qualification failed with ${launched.status ?? launched.signal}`)
      }
    }
  }
  finalizeAwaitingRuns(root, pinned)
  const results = validateAllQualificationEvidence(root, pinned)
  assertPinnedCheckoutUnchanged(root, pinned)
  console.log(`passed=${results.length} failed=0 skipped=0 rc=${pinned.expectedRcSha}`)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
}
