import fs from "node:fs"
import path from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"
import { requireExternalReleaseBoundary } from "./release-preflight.mjs"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
try {
  const pinned = requireExternalReleaseBoundary(root)
  const completion = path.join(
    root,
    ".artifacts/qualification",
    pinned.matrix.matrixRevision,
    "qualification-complete.json"
  )
  if (!fs.existsSync(completion)) {
    throw new Error("Release remains Not verified until every tuple/scope and detached review is complete")
  }
  console.log(`Release evidence complete for ${pinned.expectedRcSha}`)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
