import fs from "node:fs"
import path from "node:path"
import process from "node:process"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { assertPinnedCheckoutUnchanged, requireExternalReleaseBoundary } from "./release-preflight.mjs"
import { validateAllQualificationEvidence } from "./validate-evidence.mjs"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
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
            INTERVIEWCOPILOT_QUALIFICATION_ROOT: path.join(root, ".artifacts/qualification")
          }
        })
        if (launched.status !== 0) throw new Error(`Interactive ${entry.tupleId}/${scope} qualification failed with ${launched.status ?? launched.signal}`)
      }
    }
  }
  const results = validateAllQualificationEvidence(root, pinned)
  assertPinnedCheckoutUnchanged(root, pinned)
  console.log(`passed=${results.length} failed=0 skipped=0 rc=${pinned.expectedRcSha}`)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
