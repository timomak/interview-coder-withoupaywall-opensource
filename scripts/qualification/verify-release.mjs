import fs from "node:fs"
import path from "node:path"
import process from "node:process"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"
import { assertPinnedCheckoutUnchanged, requireExternalReleaseBoundary } from "./release-preflight.mjs"
import { validateAllQualificationEvidence } from "./validate-evidence.mjs"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const require = createRequire(import.meta.url)
try {
  if (process.argv.length !== 2) throw new Error("verify:release accepts no artifact or identity overrides")
  const pinned = requireExternalReleaseBoundary(root)
  const results = validateAllQualificationEvidence(root, pinned)
  const protocol = require(path.join(root, "dist-electron/qualification/protocol.js"))
  const inspection = protocol.parseCanonicalJson(
    fs.readFileSync(path.join(path.dirname(pinned.statement), "package-inspection.json"))
  )
  protocol.requireClosedObject(inspection, ["schemaVersion", "kind", "rcSha", "inspections"], "package inspection")
  if (inspection.schemaVersion !== 1 || inspection.kind !== "qualification-package-inspection" || inspection.rcSha !== pinned.expectedRcSha || !Array.isArray(inspection.inspections)) {
    throw new Error("Package inspection receipt is invalid")
  }
  /** @type {Array<Record<string, any>>} */
  const inspections = inspection.inspections
  const receiptRoot = path.join("/Users/Shared/InterviewCopilot/qualification-receipts", pinned.expectedRcSha)
  fs.mkdirSync(receiptRoot, { recursive: true, mode: 0o755 })
  for (const entry of pinned.matrix.entries) {
    const inspected = inspections.find((candidate) => candidate.architecture === entry.architecture)
    const scoped = results.filter((result) => result.tupleId === entry.tupleId)
    if (!inspected || scoped.length !== 2) throw new Error(`Release receipt inputs are incomplete for ${entry.tupleId}`)
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
