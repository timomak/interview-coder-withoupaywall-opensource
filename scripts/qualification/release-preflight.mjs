import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { spawnSync } from "node:child_process"

export const MATRIX_PATH = "docs/qualification/macos-google-meet.json"

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
  const matrix = JSON.parse(matrixBytes.toString("utf8"))
  if (
    matrix?.schemaVersion !== 1 ||
    !Array.isArray(matrix.entries) ||
    matrix.entries.length === 0 ||
    !Array.isArray(matrix.trustRegistry) ||
    matrix.trustRegistry.length < 4
  ) throw new Error("Qualification matrix is missing or incomplete")
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
  return { ...pinned, statement }
}
