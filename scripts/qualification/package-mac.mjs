import path from "node:path"
import process from "node:process"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { assertPinnedCheckoutUnchanged, pinCleanDetachedCheckout } from "./release-preflight.mjs"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
try {
  if (process.platform !== "darwin") throw new Error("Release packaging requires Darwin")
  const pinned = pinCleanDetachedCheckout(root)
  const builder = path.join(root, "node_modules/.bin/electron-builder")
  const result = spawnSync(builder, [
    "build", "--mac",
    `--config.extraMetadata.releaseCommitSha=${pinned.expectedRcSha}`
  ], { cwd: root, stdio: "inherit", env: { PATH: process.env.PATH, HOME: process.env.HOME } })
  if (result.status !== 0) throw new Error(`macOS package producer failed with ${result.status ?? result.signal}`)
  assertPinnedCheckoutUnchanged(root, pinned)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
