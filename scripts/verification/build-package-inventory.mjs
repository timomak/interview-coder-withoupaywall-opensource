import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import process from "node:process"
import { spawnSync } from "node:child_process"
import { inspectPackagedApplication } from "./package-inventory.mjs"

const root = process.cwd()
const outputDirectory = fs.mkdtempSync(
  path.join(os.tmpdir(), "interviewcopilot-package-")
)
const builder = path.join(
  root,
  "node_modules/electron-builder/out/cli/cli.js"
)
const result = spawnSync(
  process.execPath,
  [
    builder,
    "--dir",
    "--config.mac.identity=null",
    `--config.directories.output=${outputDirectory}`
  ],
  {
    cwd: root,
    encoding: "utf8",
    env: process.env
  }
)
process.stdout.write(result.stdout)
process.stderr.write(result.stderr)
if (result.status !== 0) process.exit(result.status ?? 1)

/** @type {string[]} */
const appPaths = []
/** @param {string} directory */
function findApps(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory() && entry.name === "InterviewCopilot.app") {
      appPaths.push(entryPath)
    } else if (entry.isDirectory()) {
      findApps(entryPath)
    }
  }
}
findApps(outputDirectory)
if (appPaths.length !== 1) {
  throw new Error(
    `fresh package build produced ${appPaths.length} InterviewCopilot apps`
  )
}
const inventory = inspectPackagedApplication(appPaths[0])
const evidenceDirectory =
  process.env.VERIFICATION_ARTIFACT_DIRECTORY ?? outputDirectory
const evidencePath = path.join(evidenceDirectory, "package-inventory.json")
fs.mkdirSync(evidenceDirectory, { recursive: true })
fs.writeFileSync(evidencePath, `${JSON.stringify(inventory, null, 2)}\n`, {
  flag: "wx"
})
if (inventory.errors.length > 0) {
  throw new Error(inventory.errors.join("\n"))
}
console.log(
  `Fresh package inventory accepted: ${inventory.asarEntries.length} asar entries, ` +
    `${inventory.bundleEntries.length} outer entries, asar sha256=${inventory.asarSha256}, ` +
    `inventory=${evidencePath}`
)
