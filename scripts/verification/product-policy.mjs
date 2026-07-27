import fs from "node:fs"
import path from "node:path"
import process from "node:process"
import ts from "typescript"
import { fileURLToPath, pathToFileURL } from "node:url"
import {
  discoverExecutableSourceFiles,
  isTestFile
} from "./source-inventory.mjs"

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url))
const REPOSITORY_ROOT = path.resolve(SCRIPT_DIRECTORY, "../..")
const SHIPPED_SOURCE_PREFIXES = ["electron/", "renderer/src/", "src/"]
const BANNED_DEPENDENCY_PATTERNS = [
  /(?:^|[-/])analytics(?:$|[-/])/i,
  /amplitude/i,
  /bugsnag/i,
  /crashlytics/i,
  /datadog/i,
  /fingerprintjs/i,
  /machine[-_]?id/i,
  /mixpanel/i,
  /newrelic/i,
  /plausible/i,
  /posthog/i,
  /rollbar/i,
  /segment(?:io)?/i,
  /sentry/i
]
const ANALYTICS_NAMES = new Set([
  "analytics",
  "amplitude",
  "mixpanel",
  "plausible",
  "posthog",
  "segment"
])
const ANALYTICS_METHODS = new Set([
  "capture",
  "event",
  "identify",
  "init",
  "initialize",
  "load",
  "page",
  "track"
])
const FINGERPRINT_NAMES = new Set([
  "deviceFingerprint",
  "FingerprintJS",
  "machineId",
  "machineIdSync"
])
const CRASH_NAMES = new Set([
  "Bugsnag",
  "crashReporter",
  "Rollbar",
  "Sentry"
])
const CRASH_METHODS = new Set(["init", "initialize", "start"])
const LOG_METHODS = new Set(["debug", "error", "info", "log", "warn"])

function dependencyClassification(name) {
  if (/fingerprint|machine[-_]?id/i.test(name)) return "fingerprint"
  if (/bugsnag|crashlytics|rollbar|sentry/i.test(name)) return "crash"
  if (
    /analytics|amplitude|datadog|mixpanel|newrelic|plausible|posthog|segment/i.test(
      name
    )
  ) {
    return "analytics"
  }
  if (name === "electron") return "electron"
  return null
}

function stringLiteralValue(node) {
  return ts.isStringLiteralLike(node) ? node.text : null
}

function propertyName(node) {
  if (ts.isPropertyAccessExpression(node)) return node.name.text
  if (ts.isElementAccessExpression(node) && node.argumentExpression) {
    return stringLiteralValue(node.argumentExpression)
  }
  return null
}

function requiredModule(node) {
  if (
    !ts.isCallExpression(node) ||
    node.arguments.length !== 1 ||
    !ts.isIdentifier(node.expression) ||
    node.expression.text !== "require"
  ) {
    return null
  }
  return stringLiteralValue(node.arguments[0])
}

function dynamicImportedModule(node) {
  if (
    !ts.isCallExpression(node) ||
    node.arguments.length !== 1 ||
    node.expression.kind !== ts.SyntaxKind.ImportKeyword
  ) {
    return null
  }
  return stringLiteralValue(node.arguments[0])
}

function isProcessEnvironment(node) {
  return (
    (ts.isPropertyAccessExpression(node) ||
      ts.isElementAccessExpression(node)) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === "process" &&
    propertyName(node) === "env"
  )
}

function collectBindings(sourceFile) {
  const bindings = new Map()

  function bindName(name, value) {
    if (ts.isIdentifier(name)) {
      bindings.set(name.text, { base: value })
      return
    }
    if (ts.isObjectBindingPattern(name)) {
      for (const element of name.elements) {
        if (!ts.isIdentifier(element.name)) continue
        bindings.set(element.name.text, {
          base: value,
          property:
            (element.propertyName && stringLiteralValue(element.propertyName)) ||
            (element.propertyName && ts.isIdentifier(element.propertyName)
              ? element.propertyName.text
              : element.name.text)
        })
      }
    }
  }

  function visit(node) {
    if (ts.isImportDeclaration(node)) {
      const moduleName = stringLiteralValue(node.moduleSpecifier)
      if (moduleName && node.importClause) {
        if (node.importClause.name) {
          bindings.set(node.importClause.name.text, { moduleName })
        }
        const namedBindings = node.importClause.namedBindings
        if (namedBindings && ts.isNamespaceImport(namedBindings)) {
          bindings.set(namedBindings.name.text, { moduleName })
        } else if (namedBindings && ts.isNamedImports(namedBindings)) {
          for (const element of namedBindings.elements) {
            bindings.set(element.name.text, {
              moduleName,
              property: element.propertyName?.text ?? element.name.text
            })
          }
        }
      }
    } else if (ts.isVariableDeclaration(node) && node.initializer) {
      bindName(node.name, node.initializer)
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return bindings
}

function classifyExpression(node, bindings, seen = new Set()) {
  if (!node) return null
  if (isProcessEnvironment(node)) return "environment"

  if (ts.isIdentifier(node)) {
    if (ANALYTICS_NAMES.has(node.text)) return "analytics"
    if (FINGERPRINT_NAMES.has(node.text)) return "fingerprint"
    if (CRASH_NAMES.has(node.text)) return "crash"
    if (seen.has(node.text)) return null
    const binding = bindings.get(node.text)
    if (!binding) return null
    seen.add(node.text)
    if (binding.moduleName) {
      const moduleClass = dependencyClassification(binding.moduleName)
      if (moduleClass === "electron" && binding.property === "crashReporter") {
        return "crash"
      }
      if (
        binding.property &&
        FINGERPRINT_NAMES.has(binding.property)
      ) {
        return "fingerprint"
      }
      return moduleClass
    }
    const baseClass = classifyExpression(binding.base, bindings, seen)
    if (binding.property === "crashReporter" && baseClass === "electron") {
      return "crash"
    }
    if (binding.property && FINGERPRINT_NAMES.has(binding.property)) {
      return "fingerprint"
    }
    return baseClass
  }

  const moduleName = requiredModule(node) ?? dynamicImportedModule(node)
  if (moduleName) return dependencyClassification(moduleName)

  if (
    ts.isPropertyAccessExpression(node) ||
    ts.isElementAccessExpression(node)
  ) {
    const baseClass = classifyExpression(node.expression, bindings, seen)
    const member = propertyName(node)
    if (baseClass === "electron" && member === "crashReporter") return "crash"
    if (member && FINGERPRINT_NAMES.has(member)) return "fingerprint"
    if (baseClass === "environment") return "environment"
    return baseClass
  }

  if (ts.isCallExpression(node)) {
    return classifyExpression(node.expression, bindings, seen)
  }
  return null
}

function containsEnvironmentValue(node, bindings) {
  if (classifyExpression(node, bindings) === "environment") return true
  let found = false
  ts.forEachChild(node, (child) => {
    if (!found && containsEnvironmentValue(child, bindings)) found = true
  })
  return found
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
    if (actual !== required) errors.push(`${label} must be ${required}`)
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
  const sourceFile = ts.createSourceFile(
    relativePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    relativePath.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  )
  const errors = new Set()
  if (sourceFile.parseDiagnostics?.length > 0) {
    errors.add(`unparseable shipped source: ${relativePath}`)
  }
  const bindings = collectBindings(sourceFile)

  function add(label) {
    errors.add(`${label} entry point: ${relativePath}`)
  }

  function visit(node) {
    if (ts.isImportDeclaration(node)) {
      const moduleName = stringLiteralValue(node.moduleSpecifier)
      if (
        moduleName &&
        BANNED_DEPENDENCY_PATTERNS.some((pattern) => pattern.test(moduleName))
      ) {
        add("forbidden analytics/crash/fingerprint import")
      }
    }

    const moduleName = requiredModule(node) ?? dynamicImportedModule(node)
    if (
      moduleName &&
      BANNED_DEPENDENCY_PATTERNS.some((pattern) => pattern.test(moduleName))
    ) {
      add("forbidden analytics/crash/fingerprint import")
    }

    if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
      const callable = node.expression
      const classification = classifyExpression(callable, bindings)
      const member =
        ts.isPropertyAccessExpression(callable) ||
        ts.isElementAccessExpression(callable)
          ? propertyName(callable)
          : null

      if (
        classification === "analytics" &&
        (!member || ANALYTICS_METHODS.has(member))
      ) {
        add("analytics initialization")
      }
      if (
        classification === "fingerprint" &&
        (!member ||
          FINGERPRINT_NAMES.has(member) ||
          ["get", "load"].includes(member))
      ) {
        add("device fingerprinting")
      }
      if (
        classification === "crash" &&
        (!member || CRASH_METHODS.has(member))
      ) {
        add("automatic crash upload")
      }

      if (
        ts.isCallExpression(node) &&
        member &&
        LOG_METHODS.has(member) &&
        node.arguments.some((argument) =>
          containsEnvironmentValue(argument, bindings)
        )
      ) {
        add("environment-secret logging")
      }
    }

    if (ts.isPropertyAssignment(node)) {
      const name =
        stringLiteralValue(node.name) ??
        (ts.isIdentifier(node.name) ? node.name.text : null)
      if (
        (name === "uploadToServer" && node.initializer.kind === ts.SyntaxKind.TrueKeyword) ||
        name === "submitURL"
      ) {
        add("automatic crash upload")
      }
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return [...errors]
}

export function isShippedSource(relativePath) {
  return (
    SHIPPED_SOURCE_PREFIXES.some((prefix) =>
      relativePath.startsWith(prefix)
    ) && !isTestFile(relativePath)
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

  for (const relativePath of discoverExecutableSourceFiles(root).filter(
    isShippedSource
  )) {
    errors.push(
      ...scanSourceText(
        relativePath,
        fs.readFileSync(path.join(root, relativePath), "utf8")
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
  if (errors.length > 0) throw new Error(errors.join("\n"))
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
