import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import process from "node:process"
import { createRequire } from "node:module"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import {
  assertPinnedCheckoutUnchanged,
  pinCleanDetachedCheckout,
  releaseStatementPath,
  requireExternalReleaseBoundary
} from "./release-preflight.mjs"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const require = createRequire(import.meta.url)

/** @param {string} directory */
function syncDirectory(directory) {
  const fd = fs.openSync(directory, fs.constants.O_RDONLY)
  try { fs.fsyncSync(fd) } finally { fs.closeSync(fd) }
}

/** @param {string} source @param {string} target */
function copyExclusive(source, target) {
  const sourceStat = fs.lstatSync(source)
  if (!sourceStat.isFile() || sourceStat.isSymbolicLink() || sourceStat.nlink !== 1) throw new Error(`Unsafe package output: ${source}`)
  fs.copyFileSync(source, target, fs.constants.COPYFILE_EXCL)
  fs.chmodSync(target, 0o444)
  const fd = fs.openSync(target, fs.constants.O_RDONLY)
  try { fs.fsyncSync(fd) } finally { fs.closeSync(fd) }
}

try {
  if (process.argv.length !== 2) throw new Error("package:mac accepts no artifact or identity overrides")
  if (process.platform !== "darwin") throw new Error("Release packaging requires Darwin")
  const pinned = pinCleanDetachedCheckout(root)
  const statement = releaseStatementPath(root, pinned.expectedRcSha)
  const boundary = path.dirname(statement)
  const sealed = path.join(boundary, "sealed-package-set")
  const incoming = path.join(boundary, "incoming-release-statement.json")
  if (fs.existsSync(statement)) {
    requireExternalReleaseBoundary(root)
    assertPinnedCheckoutUnchanged(root, pinned)
    console.log(`Release package set and detached statement already sealed for ${pinned.expectedRcSha}`)
    process.exit(0)
  }
  if (fs.existsSync(sealed)) {
    if (!fs.existsSync(incoming)) {
      throw new Error(`Sealed package set awaits an independently signed statement at ${incoming}`)
    }
    fs.renameSync(incoming, statement)
    try {
      requireExternalReleaseBoundary(root)
    } catch (error) {
      fs.renameSync(statement, incoming)
      throw error
    }
    fs.chmodSync(statement, 0o444)
    syncDirectory(boundary)
    assertPinnedCheckoutUnchanged(root, pinned)
    console.log(`Detached statement admitted for sealed package set ${pinned.expectedRcSha}`)
    process.exit(0)
  }

  const builder = path.join(root, "node_modules/.bin/electron-builder")
  const built = spawnSync(builder, [
    "build", "--mac",
    `--config.extraMetadata.releaseCommitSha=${pinned.expectedRcSha}`
  ], { cwd: root, stdio: "inherit", env: { PATH: process.env.PATH, HOME: process.env.HOME } })
  if (built.status !== 0) throw new Error(`macOS package producer failed with ${built.status ?? built.signal}`)

  const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"))
  fs.mkdirSync(boundary, { recursive: true, mode: 0o755 })
  const stage = path.join(boundary, `.sealed-package-set-${process.pid}-${crypto.randomBytes(8).toString("hex")}`)
  fs.mkdirSync(stage, { mode: 0o700 })
  const packages = []
  try {
    for (const architecture of ["arm64", "x64"]) {
      const name = `InterviewCopilot-${packageJson.version}-${architecture}.dmg`
      const source = path.join(root, "release", name)
      const directory = path.join(stage, architecture)
      fs.mkdirSync(directory, { mode: 0o500 })
      fs.chmodSync(directory, 0o700)
      const target = path.join(directory, name)
      copyExclusive(source, target)
      packages.push({ architecture, path: `${architecture}/${name}`, bytes: String(fs.statSync(target).size), packageSha256: crypto.createHash("sha256").update(fs.readFileSync(target)).digest("hex") })
      fs.chmodSync(directory, 0o500)
    }
    syncDirectory(stage)
    fs.renameSync(stage, sealed)
    syncDirectory(boundary)
  } catch (error) {
    fs.rmSync(stage, { recursive: true, force: true })
    throw error
  }
  const protocol = require(path.join(root, "dist-electron/qualification/protocol.js"))
  const request = Buffer.from(protocol.canonicalJson({
    schemaVersion: 1,
    kind: "qualification-release-statement-request",
    expectedRcSha: pinned.expectedRcSha,
    matrixPath: "docs/qualification/macos-google-meet.json",
    matrixBlobSha256: pinned.matrixBlobSha256,
    matrixRevision: pinned.matrix.matrixRevision,
    appSemver: packageJson.version,
    packages,
    state: "awaiting-independent-signing-and-notarization-evidence"
  }))
  const requestPath = path.join(boundary, "release-statement-request.json")
  fs.writeFileSync(requestPath, request, { flag: "wx", mode: 0o444 })
  syncDirectory(boundary)
  assertPinnedCheckoutUnchanged(root, pinned)
  throw new Error(`Packages sealed. External signing evidence and detached statement are now required at ${incoming}`)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
