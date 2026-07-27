import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import process from "node:process"
import { spawnSync } from "node:child_process"
import { pathToFileURL } from "node:url"

export const EXECUTABLE_SOURCE_PATTERN =
  /\.(?:js|mjs|cjs|jsx|ts|mts|cts|tsx)$/i
export const TEST_FILE_PATTERN =
  /\.(?:test|spec)\.(?:js|mjs|cjs|jsx|ts|mts|cts|tsx)$/i
export const CANONICAL_EXECUTABLE_SOURCE_PATTERN =
  /\.(?:js|mjs|cjs|jsx|ts|mts|cts|tsx)$/
export const CANONICAL_TEST_FILE_PATTERN =
  /\.(?:test|spec)\.(?:js|mjs|cjs|jsx|ts|mts|cts|tsx)$/
const DECLARATION_FILE_PATTERN = /\.d\.(?:ts|mts|cts)$/i

export const GENERATED_OR_DEPENDENCY_DIRECTORIES = new Set([
  ".artifacts",
  ".git",
  "coverage",
  "dist",
  "dist-electron",
  "node_modules",
  "release"
])

export function normalizeRepositoryPath(filePath) {
  return filePath.split(path.sep).join("/").replace(/^\.\/+/, "")
}

function pathSegments(relativePath) {
  return normalizeRepositoryPath(relativePath).split("/")
}

function isExcluded(relativePath) {
  return pathSegments(relativePath).some((segment) =>
    GENERATED_OR_DEPENDENCY_DIRECTORIES.has(segment)
  )
}

function isHiddenCandidate(relativePath) {
  return pathSegments(relativePath)
    .slice(0, -1)
    .some((segment) => segment.startsWith("."))
}

function isExecutableCandidate(relativePath) {
  return (
    EXECUTABLE_SOURCE_PATTERN.test(path.basename(relativePath)) &&
    !DECLARATION_FILE_PATTERN.test(path.basename(relativePath))
  )
}

function isCanonicalExecutable(relativePath) {
  return (
    CANONICAL_EXECUTABLE_SOURCE_PATTERN.test(path.basename(relativePath)) &&
    !DECLARATION_FILE_PATTERN.test(path.basename(relativePath))
  )
}

function isCanonicalTest(relativePath) {
  return CANONICAL_TEST_FILE_PATTERN.test(path.basename(relativePath))
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex")
}

function parseTrackedFiles(root) {
  const result = spawnSync(
    "git",
    ["ls-files", "--stage", "-z"],
    { cwd: root, encoding: "buffer" }
  )
  if (result.status !== 0) {
    const message = result.stderr?.toString("utf8").trim()
    throw new Error(`canonical inventory requires a Git index${message ? `: ${message}` : ""}`)
  }

  const tracked = new Map()
  for (const record of result.stdout.toString("utf8").split("\0")) {
    if (!record) continue
    const separator = record.indexOf("\t")
    if (separator === -1) {
      throw new Error("invalid git ls-files --stage record")
    }
    const metadata = record.slice(0, separator).split(" ")
    const relativePath = normalizeRepositoryPath(record.slice(separator + 1))
    tracked.set(relativePath, { mode: metadata[0] })
  }
  return tracked
}

function walkFilesystem(directory, root, entries) {
  if (!fs.existsSync(directory)) return
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name)
    const relativePath = normalizeRepositoryPath(path.relative(root, absolutePath))
    if (isExcluded(relativePath)) continue

    const stats = fs.lstatSync(absolutePath)
    if (stats.isSymbolicLink()) {
      entries.set(relativePath, {
        kind: "symlink",
        target: fs.readlinkSync(absolutePath)
      })
    } else if (stats.isDirectory()) {
      entries.set(relativePath, { kind: "directory" })
      walkFilesystem(absolutePath, root, entries)
    } else if (stats.isFile()) {
      entries.set(relativePath, {
        kind: "file",
        sha256: sha256File(absolutePath)
      })
    } else {
      entries.set(relativePath, { kind: "other" })
    }
  }
}

export function createSourceInventory(root) {
  const repositoryRoot = path.resolve(root)
  const tracked = parseTrackedFiles(repositoryRoot)
  const filesystem = new Map()
  walkFilesystem(repositoryRoot, repositoryRoot, filesystem)

  const errors = []
  const executableFiles = []
  const testFiles = []
  const hashes = {}
  const observedCase = new Map()

  for (const relativePath of new Set([
    ...tracked.keys(),
    ...filesystem.keys()
  ])) {
    if (isExcluded(relativePath)) continue
    const caseKey = relativePath.toLocaleLowerCase("en-US")
    const prior = observedCase.get(caseKey)
    if (prior && prior !== relativePath) {
      errors.push(`case-colliding repository paths: ${prior} and ${relativePath}`)
    } else {
      observedCase.set(caseKey, relativePath)
    }
  }

  for (const [relativePath, record] of tracked) {
    if (isExcluded(relativePath)) continue
    const observed = filesystem.get(relativePath)
    const candidate = isExecutableCandidate(relativePath)

    if (record.mode === "120000") {
      errors.push(`tracked symlink is forbidden: ${relativePath}`)
      continue
    }
    if (candidate && (!observed || observed.kind !== "file")) {
      errors.push(`tracked executable is missing or non-regular: ${relativePath}`)
      continue
    }
    if (!candidate) continue
    if (!isCanonicalExecutable(relativePath) || !isCanonicalTest(relativePath) && TEST_FILE_PATTERN.test(path.basename(relativePath))) {
      errors.push(`noncanonical executable/test path casing: ${relativePath}`)
      continue
    }
    if (isHiddenCandidate(relativePath)) {
      errors.push(`executable/test path in dot-directory is forbidden: ${relativePath}`)
      continue
    }

    executableFiles.push(relativePath)
    hashes[relativePath] = observed.sha256
    if (isCanonicalTest(relativePath)) testFiles.push(relativePath)
  }

  for (const [relativePath, observed] of filesystem) {
    if (observed.kind === "symlink") {
      errors.push(`filesystem symlink is forbidden: ${relativePath}`)
      continue
    }
    if (observed.kind !== "file" || !isExecutableCandidate(relativePath)) {
      continue
    }
    if (!tracked.has(relativePath)) {
      errors.push(`untracked executable/test candidate: ${relativePath}`)
    }
  }

  return {
    schemaVersion: 2,
    root: repositoryRoot,
    executableFiles: executableFiles.sort(),
    testFiles: testFiles.sort(),
    hashes,
    errors: [...new Set(errors)].sort()
  }
}

export function assertSourceInventory(root) {
  const inventory = createSourceInventory(root)
  if (inventory.errors.length > 0) {
    throw new Error(inventory.errors.join("\n"))
  }
  return inventory
}

export function discoverRepositoryFiles(root, predicate) {
  return assertSourceInventory(root).executableFiles.filter((relativePath) =>
    predicate(path.basename(relativePath))
  )
}

export function discoverExecutableSourceFiles(root) {
  return assertSourceInventory(root).executableFiles
}

export function discoverTestFiles(root) {
  return assertSourceInventory(root).testFiles
}

export function isTestFile(relativePath) {
  return TEST_FILE_PATTERN.test(path.basename(relativePath))
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    const inventory = assertSourceInventory(process.cwd())
    console.log(
      `Canonical source inventory accepted: ${inventory.executableFiles.length} executable files, ${inventory.testFiles.length} test files.`
    )
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
