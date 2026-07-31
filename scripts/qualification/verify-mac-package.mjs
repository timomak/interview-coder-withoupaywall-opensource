import fs from "node:fs"
import path from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"
import { requireExternalReleaseBoundary } from "./release-preflight.mjs"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")

try {
  if (process.platform !== "darwin") throw new Error("macOS package verification requires Darwin")
  const pinned = requireExternalReleaseBoundary(root)
  const sealed = path.join(path.dirname(pinned.statement), "sealed-package-set")
  for (const architecture of ["arm64", "x64"]) {
    const candidate = path.join(
      sealed,
      architecture,
      `InterviewCopilot-${JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version}-${architecture}.dmg`
    )
    if (!fs.existsSync(candidate)) throw new Error(`Missing sealed ${architecture} DMG`)
  }
  console.log(`macOS package boundary present for ${pinned.expectedRcSha}`)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
