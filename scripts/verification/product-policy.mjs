import fs from "node:fs"
import path from "node:path"
import process from "node:process"
import { fileURLToPath, pathToFileURL } from "node:url"

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url))
const REPOSITORY_ROOT = path.resolve(SCRIPT_DIRECTORY, "../..")
const SHIPPED_SOURCE_ROOTS = ["electron", "src", "renderer/src"]
const SOURCE_EXTENSION = /\.(?:[cm]?[jt]s|tsx?)$/
const BANNED_DEPENDENCY_PATTERNS = [
  /(?:^|[-/])analytics(?:$|[-/])/i,
  /amplitude/i,
  /bugsnag/i,
  /crashlytics/i,
  /datadog/i,
  /fingerprintjs/i,
  /mixpanel/i,
  /newrelic/i,
  /posthog/i,
  /segment(?:io)?/i,
  /sentry/i
]
const SOURCE_POLICIES = [
  {
    label: "analytics initialization",
    pattern:
      /\b(?:analytics|amplitude|mixpanel|posthog|segment)\s*\.\s*(?:init|initialize|load|track)\s*\(/i
  },
  {
    label: "device fingerprinting",
    pattern:
      /\b(?:FingerprintJS|machineIdSync|machineId|deviceFingerprint)\s*(?:\.|\()/i
  },
  {
    label: "automatic crash upload",
    pattern:
      /\b(?:Sentry\.init|Bugsnag\.start|crashReporter\.start)\s*\(|uploadToServer\s*:\s*true|submitURL\s*:/i
  },
  {
    label: "environment-secret logging",
    pattern:
      /\b(?:console|log)\s*\.\s*(?:debug|error|info|log|warn)\s*\([^)]*process\.env\b/i
  }
]

function walkSource(directory, files) {
  if (!fs.existsSync(directory)) return
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      walkSource(entryPath, files)
    } else if (entry.isFile() && SOURCE_EXTENSION.test(entry.name)) {
      files.push(entryPath)
    }
  }
}

export function validateIdentity(packageJson, visibleFiles) {
  const errors = []
  const expected = [
    ["package name", packageJson.name, "interview-copilot"],
    ["product name", packageJson.build?.productName, "InterviewCopilot"],
    ["application ID", packageJson.build?.appId, "com.interviewcopilot.desktop"],
    ["author", packageJson.author, "InterviewCopilot Contributors"],
    ["license", packageJson.license, "AGPL-3.0-or-later"]
  ]
  for (const [label, actual, required] of expected) {
    if (actual !== required) {
      errors.push(`${label} must be ${required}`)
    }
  }
  if (
    packageJson.build?.mac?.artifactName !==
    "InterviewCopilot-${arch}.${ext}"
  ) {
    errors.push("macOS artifact identity must be InterviewCopilot")
  }
  for (const [file, source] of Object.entries(visibleFiles)) {
    if (!source.includes("InterviewCopilot")) {
      errors.push(`visible identity missing from ${file}`)
    }
    if (source.includes("Interview Coder")) {
      errors.push(`legacy visible identity remains in ${file}`)
    }
  }
  return errors
}

export function scanDependencyNames(packageJson) {
  const dependencies = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
    ...packageJson.optionalDependencies
  }
  return Object.keys(dependencies)
    .filter((name) =>
      BANNED_DEPENDENCY_PATTERNS.some((pattern) => pattern.test(name))
    )
    .map((name) => `forbidden analytics/crash/fingerprint dependency: ${name}`)
}

export function scanSourceText(relativePath, source) {
  return SOURCE_POLICIES.filter(({ pattern }) => pattern.test(source)).map(
    ({ label }) => `${label} entry point: ${relativePath}`
  )
}

export function scanProductPolicy(root = REPOSITORY_ROOT) {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(root, "package.json"), "utf8")
  )
  const visiblePaths = [
    "index.html",
    "renderer/public/manifest.json",
    "src/components/UpdateNotification.tsx",
    "src/components/WelcomeScreen.tsx",
    "src/_pages/SubscribePage.tsx"
  ]
  const visibleFiles = Object.fromEntries(
    visiblePaths.map((file) => [
      file,
      fs.readFileSync(path.join(root, file), "utf8")
    ])
  )
  const errors = [
    ...validateIdentity(packageJson, visibleFiles),
    ...scanDependencyNames(packageJson)
  ]

  const sourceFiles = []
  for (const sourceRoot of SHIPPED_SOURCE_ROOTS) {
    walkSource(path.join(root, sourceRoot), sourceFiles)
  }
  for (const sourceFile of sourceFiles) {
    if (sourceFile.includes(`${path.sep}tests${path.sep}`)) continue
    errors.push(
      ...scanSourceText(
        path.relative(root, sourceFile).split(path.sep).join("/"),
        fs.readFileSync(sourceFile, "utf8")
      )
    )
  }

  const readme = fs.readFileSync(path.join(root, "README.md"), "utf8")
  if (!readme.includes("does not prove capture privacy")) {
    errors.push("README must state that unit protection does not prove capture privacy")
  }
  if (/\b(?:undetectable|99% invisibility)\b/i.test(readme)) {
    errors.push("README contains an unsupported capture-privacy claim")
  }
  return errors
}

function main() {
  const errors = scanProductPolicy()
  if (errors.length > 0) {
    throw new Error(errors.join("\n"))
  }
  console.log(
    "Product policy accepted: InterviewCopilot, AGPL-3.0-or-later, no analytics, fingerprinting, automatic crash upload, or environment-secret logging entry points."
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
