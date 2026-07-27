import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import process from "node:process"
import { listPackage } from "@electron/asar"
import { fileURLToPath, pathToFileURL } from "node:url"

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url))
const REPOSITORY_ROOT = path.resolve(SCRIPT_DIRECTORY, "../..")
const ALLOWED_ASAR_ROOTS = new Set([
  "dist",
  "dist-electron",
  "node_modules",
  "package.json"
])
const FORBIDDEN_PROJECT_ROOTS = new Set([
  ".artifacts",
  "electron",
  "renderer",
  "scripts",
  "src",
  "tests"
])
const RAW_SOURCE_PATTERN = /\.(?:jsx|ts|mts|cts|tsx)$/
const TEST_SOURCE_PATTERN =
  /\.(?:test|spec)\.(?:js|mjs|cjs|jsx|ts|mts|cts|tsx)$/

function normalizeAsarPath(filePath) {
  return filePath.replaceAll("\\", "/").replace(/^\/+/, "")
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex")
}

function walkFiles(directory, root, files) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      walkFiles(entryPath, root, files)
    } else if (entry.isFile() || entry.isSymbolicLink()) {
      files.push(path.relative(root, entryPath).split(path.sep).join("/"))
    }
  }
}

function findApplicationBundles(directory, applications = []) {
  if (!fs.existsSync(directory)) return applications
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name)
    if (!entry.isDirectory()) continue
    if (entry.name === "InterviewCopilot.app") {
      applications.push(entryPath)
    } else {
      findApplicationBundles(entryPath, applications)
    }
  }
  return applications
}

export function validatePackagedInventory({ asarEntries, bundleFiles }) {
  const errors = []
  const normalizedEntries = asarEntries.map(normalizeAsarPath)
  for (const entry of normalizedEntries) {
    const [root] = entry.split("/")
    if (!ALLOWED_ASAR_ROOTS.has(root)) {
      errors.push(`unexpected packaged application path: ${entry}`)
    }
    if (FORBIDDEN_PROJECT_ROOTS.has(root)) {
      errors.push(`project source root leaked into app.asar: ${entry}`)
    }
    if (root !== "node_modules" && TEST_SOURCE_PATTERN.test(entry)) {
      errors.push(`test/spec source leaked into app.asar: ${entry}`)
    }
    if (root !== "node_modules" && RAW_SOURCE_PATTERN.test(entry)) {
      errors.push(`raw runtime source leaked into app.asar: ${entry}`)
    }
    if (root !== "node_modules" && entry.endsWith(".map")) {
      errors.push(`source map leaked into app.asar: ${entry}`)
    }
    if (entry.includes("scripts/verification/")) {
      errors.push(`verification source leaked into app.asar: ${entry}`)
    }
  }

  if (!normalizedEntries.includes("dist-electron/main.js")) {
    errors.push("compiled Electron main entry is missing from app.asar")
  }
  if (!normalizedEntries.includes("dist/index.html")) {
    errors.push("compiled renderer entry is missing from app.asar")
  }

  for (const relativePath of bundleFiles) {
    const normalized = relativePath.replaceAll("\\", "/")
    if (normalized.startsWith("Contents/Resources/scripts/verification/")) {
      errors.push(`non-runtime resource leaked into application bundle: ${normalized}`)
    }
    if (
      normalized.startsWith("Contents/Resources/app.asar.unpacked/") &&
      (TEST_SOURCE_PATTERN.test(normalized) ||
        RAW_SOURCE_PATTERN.test(normalized) ||
        normalized.endsWith(".map"))
    ) {
      errors.push(`raw source leaked outside app.asar: ${normalized}`)
    }
  }
  return [...new Set(errors)]
}

function parseArguments(argv) {
  if (argv.length === 0) return {}
  if (argv.length === 2 && argv[0] === "--app" && argv[1]) {
    return { app: path.resolve(argv[1]) }
  }
  throw new Error("usage: package-inventory.mjs [--app <InterviewCopilot.app>]")
}

export function inspectPackagedApplication(appPath) {
  const asarPath = path.join(appPath, "Contents/Resources/app.asar")
  if (!fs.existsSync(asarPath)) {
    throw new Error(`packaged app.asar is missing: ${asarPath}`)
  }
  const asarEntries = listPackage(asarPath).map(normalizeAsarPath).sort()
  const bundleFiles = []
  walkFiles(appPath, appPath, bundleFiles)
  bundleFiles.sort()
  const errors = validatePackagedInventory({ asarEntries, bundleFiles })
  return {
    schemaVersion: 1,
    appPath,
    asarPath,
    asarSha256: sha256File(asarPath),
    asarEntries,
    bundleFiles,
    errors
  }
}

function main() {
  const options = parseArguments(process.argv.slice(2))
  const appPath =
    options.app ??
    findApplicationBundles(path.join(REPOSITORY_ROOT, "release")).sort().at(-1)
  if (!appPath) {
    throw new Error("InterviewCopilot.app was not produced by electron-builder")
  }
  const inventory = inspectPackagedApplication(appPath)
  const outputPath = process.env.VERIFICATION_TEST_RESULTS_DIR
    ? path.join(
        path.dirname(process.env.VERIFICATION_TEST_RESULTS_DIR),
        "package-inventory.json"
      )
    : path.join(REPOSITORY_ROOT, "release/package-inventory.json")
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.writeFileSync(outputPath, `${JSON.stringify(inventory, null, 2)}\n`)
  if (inventory.errors.length > 0) {
    throw new Error(inventory.errors.join("\n"))
  }
  console.log(
    `Packaged inventory accepted: ${inventory.asarEntries.length} asar entries, ` +
      `${inventory.bundleFiles.length} bundle files, asar sha256=${inventory.asarSha256}, ` +
      `inventory=${path.relative(REPOSITORY_ROOT, outputPath)}`
  )
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    main()
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
