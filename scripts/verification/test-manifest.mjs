import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import process from "node:process"
import { fileURLToPath, pathToFileURL } from "node:url"

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url))
const REPOSITORY_ROOT = path.resolve(SCRIPT_DIRECTORY, "../..")
const TEST_ROOTS = ["electron", "renderer/src", "tests"]
const TEST_FILE_PATTERN = /\.(?:test|spec)\.(?:[cm]?[jt]s|[jt]sx)$/
const FROZEN_P01_TEST_COUNT = 9
const FROZEN_P01_TESTS_SHA256 =
  "47f2563aca9b473ae7de44533cb495b99de9f4e9e92d60d81e024a519deff4bb"
const FORBIDDEN_TEST_FORMS = [
  {
    label: "skip",
    pattern: /\b(?:describe|it|test)\s*\.\s*skip\b/
  },
  {
    label: "todo",
    pattern: /\b(?:describe|it|test)\s*\.\s*todo\b/
  },
  {
    label: "xit",
    pattern: /\bxit\s*\(/
  },
  {
    label: "xdescribe",
    pattern: /\bxdescribe\s*\(/
  }
]

function normalizePath(filePath) {
  return filePath.split(path.sep).join("/")
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex")
}

function walk(directory, root, files) {
  if (!fs.existsSync(directory)) return
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      walk(entryPath, root, files)
    } else if (entry.isFile() && TEST_FILE_PATTERN.test(entry.name)) {
      files.push(normalizePath(path.relative(root, entryPath)))
    }
  }
}

export function discoverTestFiles(root) {
  const files = []
  for (const testRoot of TEST_ROOTS) {
    walk(path.join(root, testRoot), root, files)
  }
  return files.sort()
}

export function validateTestManifest({ root, manifest, executions }) {
  const errors = []
  if (
    !manifest ||
    typeof manifest !== "object" ||
    Array.isArray(manifest) ||
    manifest.schemaVersion !== 1 ||
    !Array.isArray(manifest.tests)
  ) {
    return ["test manifest must be a schemaVersion 1 object with tests"]
  }
  if (path.resolve(root) === REPOSITORY_ROOT) {
    const frozenPrefix = manifest.tests.slice(0, FROZEN_P01_TEST_COUNT)
    const frozenHash = crypto
      .createHash("sha256")
      .update(JSON.stringify(frozenPrefix))
      .digest("hex")
    if (frozenHash !== FROZEN_P01_TESTS_SHA256) {
      errors.push("immutable P01 test-manifest prefix drift")
    }
  }

  const manifestKeys = new Set()
  const manifestFiles = new Set()
  for (const [index, entry] of manifest.tests.entries()) {
    if (
      !entry ||
      typeof entry.path !== "string" ||
      typeof entry.name !== "string" ||
      typeof entry.sha256 !== "string" ||
      !/^[a-f0-9]{64}$/.test(entry.sha256)
    ) {
      errors.push(`manifest test ${index + 1} is invalid`)
      continue
    }
    const key = `${normalizePath(entry.path)}\u0000${entry.name}`
    if (manifestKeys.has(key)) {
      errors.push(`duplicate manifest test: ${entry.path} — ${entry.name}`)
    }
    manifestKeys.add(key)
    manifestFiles.add(normalizePath(entry.path))

    const absolutePath = path.resolve(root, entry.path)
    if (
      !absolutePath.startsWith(`${path.resolve(root)}${path.sep}`) ||
      !fs.existsSync(absolutePath)
    ) {
      errors.push(`missing or renamed manifest file: ${entry.path}`)
      continue
    }
    if (sha256File(absolutePath) !== entry.sha256) {
      errors.push(`manifest hash drift: ${entry.path}`)
    }
    const source = fs.readFileSync(absolutePath, "utf8")
    for (const forbidden of FORBIDDEN_TEST_FORMS) {
      if (forbidden.pattern.test(source)) {
        errors.push(`forbidden ${forbidden.label} form: ${entry.path}`)
      }
    }
  }

  const discoveredFiles = new Set(discoverTestFiles(root))
  for (const file of discoveredFiles) {
    if (!manifestFiles.has(file)) {
      errors.push(`unmanifested test file: ${file}`)
    }
  }
  for (const file of manifestFiles) {
    if (!discoveredFiles.has(file)) {
      errors.push(`manifest file is not discoverable: ${file}`)
    }
  }

  const executedByKey = new Map()
  for (const execution of executions) {
    const tests = Array.isArray(execution?.tests) ? execution.tests : []
    const calculatedCounts = {
      passed: tests.filter((test) => test.state === "pass").length,
      failed: tests.filter((test) => test.state === "fail").length,
      skipped: tests.filter((test) => test.state === "skip").length
    }
    if (
      JSON.stringify(calculatedCounts) !== JSON.stringify(execution?.counts)
    ) {
      errors.push(
        `test count evidence mismatch: ${String(execution?.entryLabel)}`
      )
    }
    for (const test of tests) {
      const key = `${normalizePath(test.file)}\u0000${test.name}`
      const states = executedByKey.get(key) ?? []
      states.push(test.state)
      executedByKey.set(key, states)
    }
  }

  for (const entry of manifest.tests) {
    if (!entry || typeof entry.path !== "string" || typeof entry.name !== "string") {
      continue
    }
    const key = `${normalizePath(entry.path)}\u0000${entry.name}`
    const states = executedByKey.get(key) ?? []
    if (states.length === 0) {
      errors.push(`manifest test was not executed: ${entry.path} — ${entry.name}`)
    } else if (states.some((state) => state !== "pass")) {
      errors.push(`manifest test did not pass every execution: ${entry.path} — ${entry.name}`)
    }
  }
  for (const key of executedByKey.keys()) {
    if (!manifestKeys.has(key)) {
      const [file, name] = key.split("\u0000")
      errors.push(`executed unmanifested test: ${file} — ${name}`)
    }
  }
  return errors
}

function readExecutions(resultsDirectory) {
  if (!resultsDirectory || !fs.existsSync(resultsDirectory)) {
    throw new Error("VERIFICATION_TEST_RESULTS_DIR is missing")
  }
  return fs
    .readdirSync(resultsDirectory)
    .filter((file) => file.endsWith(".json"))
    .sort()
    .map((file) =>
      JSON.parse(fs.readFileSync(path.join(resultsDirectory, file), "utf8"))
    )
}

function main() {
  const manifest = JSON.parse(
    fs.readFileSync(
      path.join(SCRIPT_DIRECTORY, "test-manifest.json"),
      "utf8"
    )
  )
  const executions = readExecutions(
    process.env.VERIFICATION_TEST_RESULTS_DIR
  )
  const errors = validateTestManifest({
    root: REPOSITORY_ROOT,
    manifest,
    executions
  })
  if (errors.length > 0) {
    throw new Error(errors.join("\n"))
  }
  console.log(
    `Test manifest accepted: ${manifest.tests.length} named tests, all executed and passed.`
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
