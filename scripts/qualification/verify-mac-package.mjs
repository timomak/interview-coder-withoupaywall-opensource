import fs from "node:fs"
import crypto from "node:crypto"
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

/** @param {string} output @param {Buffer} leafCertificate */
export function deriveCodesignIdentity(output, leafCertificate) {
  const team = output.match(/(?:^|\n)TeamIdentifier=([A-Z0-9]{10})(?:\n|$)/)?.[1]
  if (!team || leafCertificate.length === 0) {
    throw new Error("Signed app identity could not be independently derived")
  }
  return {
    signingTeamId: team,
    signingCertificateSha256: crypto.createHash("sha256").update(leafCertificate).digest("hex")
  }
}

/** @param {string} output @param {(target: string) => Buffer} [readTicket] */
export function deriveNotarizationTicketIdentity(output, readTicket = (target) => fs.readFileSync(target)) {
  const ticketUrl = output.match(/Downloaded ticket has been stored at (file:\/\/[^\r\n]+\.ticket)\.(?:\r?\n|$)/)?.[1]
  if (!ticketUrl) throw new Error("Stapled notarization ticket could not be independently located")
  const ticket = readTicket(fileURLToPath(ticketUrl))
  if (ticket.length === 0) throw new Error("Stapled notarization ticket is empty")
  return crypto.createHash("sha256").update(ticket).digest("hex")
}

/** @param {string} appPath */
function inspectCodesignIdentity(appPath) {
  const certificateRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ic-codesign-cert-"))
  try {
    const displayed = run("/usr/bin/codesign", ["--display", "--verbose=4", appPath])
    const extracted = spawnSync("/usr/bin/codesign", ["--display", "--extract-certificates", appPath], {
      cwd: certificateRoot,
      encoding: "utf8"
    })
    if (extracted.status !== 0) {
      throw new Error(`codesign certificate extraction failed: ${(extracted.stderr || extracted.stdout).trim()}`)
    }
    const leafPath = path.join(certificateRoot, "codesign0")
    if (!fs.existsSync(leafPath)) throw new Error("Leaf signing certificate was not extracted")
    return deriveCodesignIdentity(displayed, fs.readFileSync(leafPath))
  } finally {
    fs.rmSync(certificateRoot, { recursive: true, force: true })
  }
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

export function main() {
try {
  if (process.argv.length !== 2) throw new Error("verify:mac-package accepts no path or identity overrides")
  if (process.platform !== "darwin") throw new Error("macOS package verification requires Darwin")
  const pinned = requireExternalReleaseBoundary(root)
  const runtimePath = path.join(root, "dist-electron/qualification/packagePolicy.js")
  if (!fs.existsSync(runtimePath)) throw new Error("Authoritative package policy runtime is absent")
  const policy = require(runtimePath)
  const protocol = require(path.join(root, "dist-electron/qualification/protocol.js"))
  /** @type {Array<{architecture: string; appAsarSha256: string; packageSha256: string; releaseStatementSha256: string; signingTeamId: unknown; signingCertificateSha256: unknown; notarizationTicketId: unknown}>} */
  const inspections = []
  for (const architecture of ["arm64", "x64"]) {
    const dmg = pinned.packagePaths[architecture]
    const notarizationTicketId = deriveNotarizationTicketIdentity(
      run("/usr/bin/xcrun", ["stapler", "validate", "-v", dmg])
    )
    const mount = fs.mkdtempSync(path.join(os.tmpdir(), `ic-${architecture}-`))
    try {
      run("/usr/bin/hdiutil", ["attach", "-nobrowse", "-readonly", "-mountpoint", mount, dmg])
      const apps = fs.readdirSync(mount).filter((name) => name.endsWith(".app"))
      if (apps.length !== 1) throw new Error(`${architecture} DMG must contain exactly one app`)
      const appPath = path.join(mount, apps[0])
      run("/usr/bin/codesign", ["--verify", "--deep", "--strict", "--verbose=4", appPath])
      run("/usr/sbin/spctl", ["--assess", "--type", "execute", "--verbose=4", appPath])
      const signedIdentity = inspectCodesignIdentity(appPath)
      const nested = signedNested(path.join(appPath, "Contents"))
        .filter((candidate) => candidate !== path.join(appPath, "Contents/MacOS/InterviewCopilot"))
        .map((candidate) => entitlements(candidate, policy.parseBooleanEntitlements))
      policy.verifyMacPackagePolicy(root, {
        parent: entitlements(appPath, policy.parseBooleanEntitlements),
        nested
      })
      const metadata = JSON.parse(asar.extractFile(path.join(appPath, "Contents/Resources/app.asar"), "package.json").toString("utf8"))
      if (metadata.releaseCommitSha !== pinned.expectedRcSha) throw new Error("Packaged commit identity is not the pinned RC")
      const statementPackage = pinned.statementPayload.packages.find(/** @param {Record<string, unknown>} candidate */ (candidate) => candidate.architecture === architecture)
      if (!statementPackage) throw new Error(`Detached statement package is absent for ${architecture}`)
      if (
        statementPackage.signingTeamId !== signedIdentity.signingTeamId ||
        statementPackage.signingCertificateSha256 !== signedIdentity.signingCertificateSha256 ||
        statementPackage.notarizationTicketId !== notarizationTicketId
      ) throw new Error(`Detached statement identity disagrees with the signed ${architecture} artifact`)
      inspections.push({
        architecture,
        appAsarSha256: protocol.sha256(fs.readFileSync(path.join(appPath, "Contents/Resources/app.asar"))),
        packageSha256: protocol.sha256(fs.readFileSync(dmg)),
        releaseStatementSha256: protocol.sha256(fs.readFileSync(pinned.statement)),
        signingTeamId: signedIdentity.signingTeamId,
        signingCertificateSha256: signedIdentity.signingCertificateSha256,
        notarizationTicketId
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
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
}
