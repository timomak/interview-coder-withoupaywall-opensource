import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import process from "node:process"
import { createRequire } from "node:module"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { assertPinnedCheckoutUnchanged, requireExternalReleaseBoundary } from "./release-preflight.mjs"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const require = createRequire(import.meta.url)
const asar = require("@electron/asar")

/** @param {string} command @param {string[]} args */
function run(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" })
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed: ${(result.stderr || result.stdout).trim()}`)
  return `${result.stdout}${result.stderr}`
}

/** @param {string} target @param {(value: string) => Record<string, boolean>} parse */
function entitlements(target, parse) {
  const output = run("/usr/bin/codesign", ["--display", "--entitlements", ":-", target])
  const start = output.indexOf("<?xml")
  if (start < 0) throw new Error(`Signed entitlements are absent: ${target}`)
  return parse(output.slice(start))
}

/** @param {string} rootPath */
function signedNested(rootPath) {
  /** @type {string[]} */
  const results = []
  /** @param {string} directory */
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const candidate = path.join(directory, entry.name)
      if (entry.isSymbolicLink()) continue
      if (entry.isDirectory()) visit(candidate)
      else if (entry.isFile()) {
        const probe = spawnSync("/usr/bin/codesign", ["--display", candidate], { encoding: "utf8" })
        if (probe.status === 0) results.push(candidate)
      }
    }
  }
  visit(rootPath)
  return results
}

try {
  if (process.argv.length !== 2) throw new Error("verify:mac-package accepts no path or identity overrides")
  if (process.platform !== "darwin") throw new Error("macOS package verification requires Darwin")
  const pinned = requireExternalReleaseBoundary(root)
  const runtimePath = path.join(root, "dist-electron/qualification/packagePolicy.js")
  if (!fs.existsSync(runtimePath)) throw new Error("Authoritative package policy runtime is absent")
  const policy = require(runtimePath)
  const protocol = require(path.join(root, "dist-electron/qualification/protocol.js"))
  /** @type {Array<{architecture: string; appAsarSha256: string}>} */
  const inspections = []
  for (const architecture of ["arm64", "x64"]) {
    const dmg = pinned.packagePaths[architecture]
    run("/usr/bin/xcrun", ["stapler", "validate", dmg])
    const mount = fs.mkdtempSync(path.join(os.tmpdir(), `ic-${architecture}-`))
    try {
      run("/usr/bin/hdiutil", ["attach", "-nobrowse", "-readonly", "-mountpoint", mount, dmg])
      const apps = fs.readdirSync(mount).filter((name) => name.endsWith(".app"))
      if (apps.length !== 1) throw new Error(`${architecture} DMG must contain exactly one app`)
      const appPath = path.join(mount, apps[0])
      run("/usr/bin/codesign", ["--verify", "--deep", "--strict", "--verbose=4", appPath])
      run("/usr/sbin/spctl", ["--assess", "--type", "execute", "--verbose=4", appPath])
      const nested = signedNested(path.join(appPath, "Contents"))
        .filter((candidate) => candidate !== path.join(appPath, "Contents/MacOS/InterviewCopilot"))
        .map((candidate) => entitlements(candidate, policy.parseBooleanEntitlements))
      policy.verifyMacPackagePolicy(root, {
        parent: entitlements(appPath, policy.parseBooleanEntitlements),
        nested
      })
      const metadata = JSON.parse(asar.extractFile(path.join(appPath, "Contents/Resources/app.asar"), "package.json").toString("utf8"))
      if (metadata.releaseCommitSha !== pinned.expectedRcSha) throw new Error("Packaged commit identity is not the pinned RC")
      inspections.push({
        architecture,
        appAsarSha256: protocol.sha256(fs.readFileSync(path.join(appPath, "Contents/Resources/app.asar")))
      })
    } finally {
      spawnSync("/usr/bin/hdiutil", ["detach", mount, "-force"], { encoding: "utf8" })
      fs.rmSync(mount, { recursive: true, force: true })
    }
  }
  const inspectionBytes = Buffer.from(protocol.canonicalJson({
    schemaVersion: 1,
    kind: "qualification-package-inspection",
    rcSha: pinned.expectedRcSha,
    inspections
  }))
  const inspectionPath = path.join(path.dirname(pinned.statement), "package-inspection.json")
  if (fs.existsSync(inspectionPath)) {
    if (!fs.readFileSync(inspectionPath).equals(inspectionBytes)) throw new Error("Existing package inspection receipt disagrees")
  } else {
    fs.writeFileSync(inspectionPath, inspectionBytes, { flag: "wx", mode: 0o444 })
  }
  assertPinnedCheckoutUnchanged(root, pinned)
  console.log(`macOS package verification passed for ${pinned.expectedRcSha}`)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
