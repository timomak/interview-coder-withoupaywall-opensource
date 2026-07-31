import fs from "node:fs"
import path from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"
import { requireExternalReleaseBoundary } from "./release-preflight.mjs"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
try {
  const pinned = requireExternalReleaseBoundary(root)
  const artifactIndex = process.argv.indexOf("--artifacts")
  const artifactRoot = artifactIndex >= 0
    ? path.resolve(root, process.argv[artifactIndex + 1] ?? "")
    : path.join(root, ".artifacts/qualification")
  if (!fs.existsSync(artifactRoot)) {
    throw new Error(
      "Live Google Meet collection is required: use exact matrix machines, a second physical device, and an independent remote observer. No local preview can create a pass."
    )
  }
  const marker = path.join(artifactRoot, pinned.matrix.matrixRevision, "qualification-complete.json")
  if (!fs.existsSync(marker)) {
    throw new Error("Qualification evidence is incomplete; M01 and M02 must be collected and independently reviewed")
  }
  console.log(`Qualification evidence present for ${pinned.expectedRcSha}`)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
