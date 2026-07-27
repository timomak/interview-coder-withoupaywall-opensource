import fs from "node:fs"
import path from "node:path"

export const EXECUTABLE_SOURCE_PATTERN =
  /\.(?:js|mjs|cjs|jsx|ts|mts|cts|tsx)$/
export const TEST_FILE_PATTERN =
  /\.(?:test|spec)\.(?:js|mjs|cjs|jsx|ts|mts|cts|tsx)$/

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
  return filePath.split(path.sep).join("/")
}

function walkRepository(directory, root, predicate, files) {
  if (!fs.existsSync(directory)) return
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (
      entry.isDirectory() &&
      GENERATED_OR_DEPENDENCY_DIRECTORIES.has(entry.name)
    ) {
      continue
    }

    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      walkRepository(entryPath, root, predicate, files)
    } else if (entry.isFile() && predicate(entry.name)) {
      files.push(normalizeRepositoryPath(path.relative(root, entryPath)))
    }
  }
}

export function discoverRepositoryFiles(root, predicate) {
  const files = []
  walkRepository(root, root, predicate, files)
  return files.sort()
}

export function discoverExecutableSourceFiles(root) {
  return discoverRepositoryFiles(root, (name) =>
    EXECUTABLE_SOURCE_PATTERN.test(name)
  )
}

export function discoverTestFiles(root) {
  return discoverRepositoryFiles(root, (name) => TEST_FILE_PATTERN.test(name))
}

export function isTestFile(relativePath) {
  return TEST_FILE_PATTERN.test(path.basename(relativePath))
}
