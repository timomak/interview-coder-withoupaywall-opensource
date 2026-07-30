import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import process from "node:process"
import { fileURLToPath, pathToFileURL } from "node:url"
import {
  createSourceInventory,
  normalizeRepositoryPath
} from "./source-inventory.mjs"

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url))
const REPOSITORY_ROOT = path.resolve(SCRIPT_DIRECTORY, "../..")
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

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex")
}

export function validateTestManifest({ root, manifest, executions }) {
  const errors = []
  const inventory = createSourceInventory(root)
  errors.push(...inventory.errors)
  if (
    !manifest ||
    typeof manifest !== "object" ||
    Array.isArray(manifest) ||
    manifest.schemaVersion !== 1 ||
    !Array.isArray(manifest.tests)
  ) {
    return ["test manifest must be a schemaVersion 1 object with tests"]
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
    const key = `${normalizeRepositoryPath(entry.path)}\u0000${entry.name}`
    if (manifestKeys.has(key)) {
      errors.push(`duplicate manifest test: ${entry.path} — ${entry.name}`)
    }
    manifestKeys.add(key)
    manifestFiles.add(normalizeRepositoryPath(entry.path))

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

  const discoveredFiles = new Set(inventory.testFiles)
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
  const executedFiles = new Set()
  for (const execution of executions) {
    const tests = Array.isArray(execution?.tests) ? execution.tests : []
    const includeFiles = Array.isArray(execution?.includeFiles)
      ? execution.includeFiles.map(normalizeRepositoryPath).sort()
      : null
    if (
      !includeFiles ||
      JSON.stringify(includeFiles) !== JSON.stringify(inventory.testFiles)
    ) {
      errors.push(
        `Vitest include set mismatch: ${String(execution?.entryLabel)}`
      )
    }
    const calculatedCounts = {
      passed: tests.filter((test) => test.state === "pass").length,
      failed: tests.filter((test) => test.state === "fail").length,
      skipped: tests.filter((test) => test.state === "skip").length
    }
    const observedCounts = execution?.counts
    if (
      !observedCounts ||
      typeof observedCounts !== "object" ||
      Array.isArray(observedCounts) ||
      JSON.stringify(Object.keys(observedCounts).sort()) !==
        JSON.stringify(["failed", "passed", "skipped"]) ||
      observedCounts.passed !== calculatedCounts.passed ||
      observedCounts.failed !== calculatedCounts.failed ||
      observedCounts.skipped !== calculatedCounts.skipped
    ) {
      errors.push(
        `test count evidence mismatch: ${String(execution?.entryLabel)}`
      )
    }
    for (const test of tests) {
      executedFiles.add(normalizeRepositoryPath(test.file))
      const key = `${normalizeRepositoryPath(test.file)}\u0000${test.name}`
      const states = executedByKey.get(key) ?? []
      states.push(test.state)
      executedByKey.set(key, states)
    }
  }

  for (const entry of manifest.tests) {
    if (!entry || typeof entry.path !== "string" || typeof entry.name !== "string") {
      continue
    }
    const key = `${normalizeRepositoryPath(entry.path)}\u0000${entry.name}`
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
  if (
    JSON.stringify([...executedFiles].sort()) !==
    JSON.stringify(inventory.testFiles)
  ) {
    errors.push("executed test-file union does not equal canonical inventory")
  }
  const unitExecution = executions.find(
    (execution) => execution?.entryLabel === "unit"
  )
  if (path.resolve(root) === REPOSITORY_ROOT || unitExecution) {
    const unitFiles = [
      ...new Set(
        (unitExecution?.tests ?? []).map((test) =>
          normalizeRepositoryPath(test.file)
        )
      )
    ].sort()
    if (JSON.stringify(unitFiles) !== JSON.stringify(inventory.testFiles)) {
      errors.push("unit execution file set does not equal canonical inventory")
    }
  }
  return errors
}

function readExecutions(ledgerPath) {
  if (!ledgerPath || !fs.existsSync(ledgerPath)) {
    throw new Error("VERIFICATION_VALIDATED_TEST_RESULTS_PATH is missing")
  }
  const ledger = JSON.parse(fs.readFileSync(ledgerPath, "utf8"))
  if (ledger?.schemaVersion !== 1 || !Array.isArray(ledger.executions)) {
    throw new Error("validated test-results ledger is invalid")
  }
  return ledger.executions
}

function main() {
  const manifest = JSON.parse(
    fs.readFileSync(
      path.join(SCRIPT_DIRECTORY, "test-manifest.json"),
      "utf8"
    )
  )
  const executions = readExecutions(
    process.env.VERIFICATION_VALIDATED_TEST_RESULTS_PATH
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
