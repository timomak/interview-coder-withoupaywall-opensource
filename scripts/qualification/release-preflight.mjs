import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { createRequire } from "node:module"

export const MATRIX_PATH = "docs/qualification/macos-google-meet.json"
const require = createRequire(import.meta.url)

/** @param {string} root */
function qualificationRuntime(root) {
  const protocolPath = path.join(root, "dist-electron/qualification/protocol.js")
  const statementPath = path.join(root, "dist-electron/qualification/releaseStatement.js")
  if (!fs.existsSync(protocolPath) || !fs.existsSync(statementPath)) {
    throw new Error("Authoritative qualification runtime is absent; run npm run build:runtime first")
  }
  return {
    protocol: require(protocolPath),
    releaseStatement: require(statementPath)
  }
}

/** @param {string} cwd @param {string[]} args */
function git(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" })
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed`)
  return result.stdout.trim()
}

/** @param {string} cwd @param {string[]} args */
function gitBytes(cwd, args) {
  const result = spawnSync("git", args, { cwd })
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed`)
  return result.stdout
}

/** @param {string} root */
export function pinCleanDetachedCheckout(root) {
  const symbolic = spawnSync("git", ["symbolic-ref", "-q", "HEAD"], {
    cwd: root,
    encoding: "utf8"
  })
  if (symbolic.status === 0) throw new Error("Release verification requires detached HEAD")
  const status = git(root, ["status", "--porcelain", "--untracked-files=all"])
  if (status) throw new Error("Release verification requires a clean checkout")
  const expectedRcSha = git(root, ["rev-parse", "HEAD"])
  if (!/^[0-9a-f]{40}$/.test(expectedRcSha)) throw new Error("Pinned RC SHA is invalid")
  const matrixBytes = gitBytes(root, ["show", `${expectedRcSha}:${MATRIX_PATH}`])
  const worktreeBytes = fs.readFileSync(path.join(root, MATRIX_PATH))
  if (!matrixBytes.equals(worktreeBytes)) throw new Error("Committed and worktree matrix bytes disagree")
  const runtime = qualificationRuntime(root)
  const matrix = runtime.protocol.validateMatrix(runtime.protocol.parseCanonicalJson(matrixBytes))
  return {
    expectedRcSha,
    matrix,
    matrixBlobSha256: crypto.createHash("sha256").update(matrixBytes).digest("hex")
  }
}

/** @param {string} root @param {string} expectedRcSha */
export function releaseStatementPath(root, expectedRcSha) {
  void root
  return path.join(
    "/Users/Shared/InterviewCopilot/qualification-release-statements",
    expectedRcSha,
    "release-statement.json"
  )
}

/** @param {string} root */
export function requireExternalReleaseBoundary(root) {
  const pinned = pinCleanDetachedCheckout(root)
  const statement = releaseStatementPath(root, pinned.expectedRcSha)
  if (!fs.existsSync(statement)) {
    throw new Error(
      `Missing detached release statement at ${statement}; Developer ID signing and notarization must complete first.`
    )
  }
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"))
  /** @type {Array<Record<string, unknown>>} */
  const matrixEntries = pinned.matrix.entries
  const architectures = [...new Set(matrixEntries.map((entry) => String(entry.architecture)))].sort()
  if (JSON.stringify(architectures) !== JSON.stringify(["arm64", "x64"])) {
    throw new Error("Release matrix must contain exact arm64 and x64 architectures")
  }
  const sealedRoot = path.join(path.dirname(statement), "sealed-package-set")
  const packagePaths = Object.fromEntries(architectures.map((architecture) => [
    architecture,
    path.join(sealedRoot, architecture, `InterviewCopilot-${packageJson.version}-${architecture}.dmg`)
  ]))
  const packageSha256 = Object.fromEntries(Object.entries(packagePaths).map(([architecture, candidate]) => {
    if (!fs.existsSync(candidate)) throw new Error(`Missing sealed ${architecture} DMG`)
    return [architecture, crypto.createHash("sha256").update(fs.readFileSync(candidate)).digest("hex")]
  }))
  const runtime = qualificationRuntime(root)
  const statementPayload = runtime.releaseStatement.validateReleaseStatement(
    fs.readFileSync(statement),
    pinned.matrix,
    {
      expectedRcSha: pinned.expectedRcSha,
      matrixBlobSha256: pinned.matrixBlobSha256,
      matrixRevision: pinned.matrix.matrixRevision,
      appSemver: packageJson.version,
      architectures,
      packageSha256
    }
  )
  return { ...pinned, statement, statementPayload, packagePaths, packageSha256 }
}

/** @param {string} root @param {any} pinned */
export function assertPinnedCheckoutUnchanged(root, pinned) {
  if (git(root, ["rev-parse", "HEAD"]) !== pinned.expectedRcSha) {
    throw new Error("Release checkout changed during verification")
  }
  if (git(root, ["status", "--porcelain", "--untracked-files=all"])) {
    throw new Error("Release checkout became dirty during verification")
  }
  const bytes = gitBytes(root, ["show", `${pinned.expectedRcSha}:${MATRIX_PATH}`])
  const digest = crypto.createHash("sha256").update(bytes).digest("hex")
  if (digest !== pinned.matrixBlobSha256) throw new Error("Pinned matrix changed during verification")
}
