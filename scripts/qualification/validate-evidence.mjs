import fs from "node:fs"
import path from "node:path"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const FILES = [
  "collection.json", "derived/control-coverage.json", "derived/frame-analysis.ndjson",
  "raw/local-control-events.ndjson", "raw/local-marker-events.ndjson", "raw/local-preflight.json",
  "raw/remote-observer-events.ndjson", "raw/remote-observer.mov", "validation/report.json",
  "evidence-manifest.json", "attestations/local-operator.json", "attestations/remote-observer.json",
  "bundle-metadata.json", "bundle-manifest.json"
]

/** @param {string} directory @param {string} label */
function oneDirectory(directory, label) {
  if (!fs.existsSync(directory)) throw new Error(`Missing ${label}: ${directory}`)
  const names = fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink() && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(entry.name))
    .map((entry) => entry.name)
  if (names.length !== 1) throw new Error(`${label} must contain exactly one immutable run`)
  return names[0]
}

/** @param {string} root @param {any} pinned */
export function validateAllQualificationEvidence(root, pinned) {
  const runtimePath = path.join(root, "dist-electron/qualification/artifactValidator.js")
  if (!fs.existsSync(runtimePath)) throw new Error("Authoritative artifact validator runtime is absent")
  const { validateQualificationBundle } = require(runtimePath)
  const results = []
  for (const entry of pinned.matrix.entries) {
    /** @type {Array<Record<string, unknown>>} */
    const releasePackages = pinned.statementPayload.packages
    const releasePackage = releasePackages.find((candidate) => candidate.architecture === entry.architecture)
    if (!releasePackage) throw new Error(`Statement lacks package for ${entry.architecture}`)
    for (const [scope, procedure] of [["entire-display", "M01"], ["specific-window", "M02"]]) {
      const procedureRoot = path.join(root, ".artifacts/qualification", pinned.matrix.matrixRevision, entry.tupleId, procedure)
      const runId = oneDirectory(procedureRoot, `${entry.tupleId}/${procedure}`)
      const runRoot = path.join(procedureRoot, runId)
      const files = new Map()
      for (const relative of FILES) {
        const candidate = path.join(runRoot, relative)
        const stat = fs.lstatSync(candidate)
        if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) {
          throw new Error(`Qualification member is not one exclusive regular file: ${relative}`)
        }
        files.set(relative, fs.readFileSync(candidate))
      }
      const optional = path.join(runRoot, "bundle-manifest.sig")
      if (fs.existsSync(optional)) {
        const stat = fs.lstatSync(optional)
        if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw new Error("Bundle signature path is unsafe")
        files.set("bundle-manifest.sig", fs.readFileSync(optional))
      }
      const reviewPath = path.join(
        root, ".artifacts/qualification-reviews", pinned.matrix.matrixRevision,
        entry.tupleId, procedure, runId, "independent-review.json"
      )
      const reviewStat = fs.lstatSync(reviewPath)
      if (!reviewStat.isFile() || reviewStat.isSymbolicLink() || reviewStat.nlink !== 1) throw new Error("Independent review path is unsafe")
      const result = validateQualificationBundle(
        files,
        fs.readFileSync(reviewPath),
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
      results.push({ tupleId: entry.tupleId, scope, runId, ...result })
    }
  }
  return results
}
