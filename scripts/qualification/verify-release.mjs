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
try {
  if (process.argv.length !== 2) throw new Error("verify:release accepts no artifact or identity overrides")
  const pinned = requireExternalReleaseBoundary(root)
  const packageVerification = spawnSync(process.execPath, [path.join(root, "scripts/qualification/verify-mac-package.mjs")], {
    cwd: root,
    stdio: "inherit",
    env: { PATH: process.env.PATH, HOME: process.env.HOME }
  })
  if (packageVerification.status !== 0) throw new Error("Independent package verification did not pass in this release run")
  const results = validateAllQualificationEvidence(root, pinned)
  const protocol = require(path.join(root, "dist-electron/qualification/protocol.js"))
  const packageInspection = require(path.join(root, "dist-electron/qualification/packageInspection.js"))
  const statementPackages = Object.fromEntries(pinned.statementPayload.packages.map(/** @param {Record<string, unknown>} item */ (item) => {
    const architecture = String(item.architecture)
    return [architecture, {
      bytes: fs.readFileSync(pinned.packagePaths[architecture]),
      signingTeamId: item.signingTeamId,
      signingCertificateSha256: item.signingCertificateSha256,
      notarizationTicketId: item.notarizationTicketId
    }]
  }))
  /** @type {Array<Record<string, unknown>>} */
  const inspections = packageInspection.validatePackageInspection(
    fs.readFileSync(path.join(path.dirname(pinned.statement), "package-inspection.json")),
    { rcSha: pinned.expectedRcSha, releaseStatement: fs.readFileSync(pinned.statement), packages: statementPackages }
  )
  const statementSha256 = protocol.sha256(fs.readFileSync(pinned.statement))
  const receiptRoot = path.join("/Users/Shared/InterviewCopilot/qualification-receipts", pinned.expectedRcSha)
  fs.mkdirSync(receiptRoot, { recursive: true, mode: 0o755 })
  for (const entry of pinned.matrix.entries) {
    const inspected = inspections.find((candidate) => candidate.architecture === entry.architecture)
    const scoped = results.filter((result) => result.tupleId === entry.tupleId)
    protocol.requireClosedObject(inspected, ["architecture", "appAsarSha256", "packageSha256", "releaseStatementSha256", "signingTeamId", "signingCertificateSha256", "notarizationTicketId"], "package inspection entry")
    const statementPackage = pinned.statementPayload.packages.find(/** @param {Record<string, unknown>} candidate */ (candidate) => candidate.architecture === entry.architecture)
    if (
      !inspected || !statementPackage || scoped.length !== 2 ||
      inspected.packageSha256 !== pinned.packageSha256[entry.architecture] ||
      inspected.releaseStatementSha256 !== statementSha256 ||
      inspected.signingTeamId !== statementPackage.signingTeamId ||
      inspected.signingCertificateSha256 !== statementPackage.signingCertificateSha256 ||
      inspected.notarizationTicketId !== statementPackage.notarizationTicketId
    ) throw new Error(`Release receipt inputs are incomplete for ${entry.tupleId}`)
    const record = {
      schemaVersion: 1,
      kind: "capture-verification",
      tuple: {
        appSemver: pinned.statementPayload.appSemver,
        appCommitSha: pinned.expectedRcSha,
        appBundleSha256: inspected.appAsarSha256,
        macOSProductVersion: entry.macOSProductVersion,
        macOSBuildVersion: entry.macOSBuildVersion,
        architecture: entry.architecture,
        chromeVersion: entry.chromeVersion,
        meetBuildId: entry.meetBuildId,
        display: entry.display
      },
      scopes: ["entire-display", "specific-window"].map((scope) => {
        const accepted = scoped.find((result) => result.scope === scope)
        if (!accepted) throw new Error(`Missing ${entry.tupleId}/${scope} result`)
        return {
          scope,
          procedureId: scope === "entire-display" ? "P12-M01" : "P12-M02",
          result: "pass",
          evidenceManifestSha256: accepted.evidenceManifestSha256,
          bundleManifestSha256: accepted.bundleManifestSha256
        }
      }),
      qualifiedAt: scoped.map((result) => result.reviewedAt).sort().at(-1)
    }
    const bytes = Buffer.from(protocol.canonicalJson(record))
    const target = path.join(receiptRoot, `capture-verification-${entry.tupleId}.json`)
    if (fs.existsSync(target)) {
      if (!fs.readFileSync(target).equals(bytes)) throw new Error(`Existing receipt disagrees for ${entry.tupleId}`)
    } else fs.writeFileSync(target, bytes, { flag: "wx", mode: 0o444 })
  }
  assertPinnedCheckoutUnchanged(root, pinned)
  for (const result of results) console.log(`${result.tupleId}/${result.scope}: pass`)
  console.log(`passed=${results.length} failed=0 skipped=0 rc=${pinned.expectedRcSha}`)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
