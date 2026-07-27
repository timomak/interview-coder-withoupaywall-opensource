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
const LOGGER_NAMES = new Set(["console", "logger"])

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
  if (/^(?:electron-log|log4js|pino|winston)(?:$|\/)/i.test(name)) {
    return "logger"
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

function emptyValue() {
  return { tags: new Set(), properties: new Map(), member: null }
}

function taggedValue(...tags) {
  return { tags: new Set(tags), properties: new Map(), member: null }
}

function mergeValues(...values) {
  const merged = emptyValue()
  for (const value of values) {
    if (!value) continue
    for (const tag of value.tags) merged.tags.add(tag)
    for (const [name, property] of value.properties) {
      merged.properties.set(
        name,
        merged.properties.has(name)
          ? mergeValues(merged.properties.get(name), property)
          : property
      )
    }
  }
  return merged
}

function memberValue(base, member) {
  if (!member) return mergeValues(base)
  if (base.properties.has(member)) return base.properties.get(member)
  const value = mergeValues(base)
  value.member = member
  if (base.tags.has("electron") && member === "crashReporter") {
    value.tags.add("crash")
  }
  if (FINGERPRINT_NAMES.has(member)) value.tags.add("fingerprint")
  if (base.tags.has("process") && member === "env") {
    value.tags.add("environment")
  }
  return value
}

class Scope {
  constructor(parent = null) {
    this.parent = parent
    this.bindings = new Map()
  }

  declare(name, value = emptyValue()) {
    this.bindings.set(name, value)
  }

  has(name) {
    return this.bindings.has(name) || Boolean(this.parent?.has(name))
  }

  lookup(name) {
    if (this.bindings.has(name)) return this.bindings.get(name)
    return this.parent?.lookup(name) ?? null
  }

  assign(name, value) {
    if (this.bindings.has(name)) {
      this.bindings.set(name, value)
    } else if (this.parent?.has(name)) {
      this.parent.assign(name, value)
    } else {
      this.bindings.set(name, value)
    }
  }

  visible() {
    const values = this.parent?.visible() ?? new Map()
    for (const [name, value] of this.bindings) values.set(name, value)
    return values
  }
}

function declaredNames(name, names = []) {
  if (ts.isIdentifier(name)) {
    names.push(name.text)
  } else if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) {
    for (const element of name.elements) {
      if (ts.isBindingElement(element)) declaredNames(element.name, names)
    }
  }
  return names
}

function predeclare(statements, scope) {
  for (const statement of statements) {
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        for (const name of declaredNames(declaration.name)) scope.declare(name)
      }
    } else if (
      (ts.isFunctionDeclaration(statement) ||
        ts.isClassDeclaration(statement)) &&
      statement.name
    ) {
      scope.declare(statement.name.text)
    } else if (ts.isImportDeclaration(statement) && statement.importClause) {
      const clause = statement.importClause
      if (clause.name) scope.declare(clause.name.text)
      const bindings = clause.namedBindings
      if (bindings && ts.isNamespaceImport(bindings)) {
        scope.declare(bindings.name.text)
      } else if (bindings && ts.isNamedImports(bindings)) {
        for (const element of bindings.elements) scope.declare(element.name.text)
      }
    }
  }
}

function moduleValue(moduleName, member = null) {
  const classification = dependencyClassification(moduleName)
  const value = classification ? taggedValue(classification) : emptyValue()
  value.member = member
  if (classification === "electron" && member === "crashReporter") {
    value.tags.add("crash")
  }
  if (member && FINGERPRINT_NAMES.has(member)) value.tags.add("fingerprint")
  return value
}

function scriptKind(relativePath) {
  if (/\.jsx$/i.test(relativePath)) return ts.ScriptKind.JSX
  if (/\.js$|\.mjs$|\.cjs$/i.test(relativePath)) return ts.ScriptKind.JS
  if (/\.tsx$/i.test(relativePath)) return ts.ScriptKind.TSX
  return ts.ScriptKind.TS
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
    scriptKind(relativePath)
  )
  const errors = new Set()
  if (sourceFile.parseDiagnostics?.length > 0) {
    errors.add(`unparseable shipped source: ${relativePath}`)
  }

  function add(label) {
    errors.add(`${label} entry point: ${relativePath}`)
  }

  function globalValue(name, scope) {
    const binding = scope.lookup(name)
    if (binding) return binding
    if (scope.has(name)) return emptyValue()
    if (name === "process") return taggedValue("process")
    if (LOGGER_NAMES.has(name)) return taggedValue("logger")
    if (ANALYTICS_NAMES.has(name)) return taggedValue("analytics")
    if (FINGERPRINT_NAMES.has(name)) return taggedValue("fingerprint")
    if (CRASH_NAMES.has(name)) return taggedValue("crash")
    return emptyValue()
  }

  function bindPattern(name, value, scope) {
    if (ts.isIdentifier(name)) {
      scope.assign(name.text, value)
      return
    }
    if (ts.isObjectBindingPattern(name)) {
      for (const element of name.elements) {
        const member =
          (element.propertyName && stringLiteralValue(element.propertyName)) ??
          (element.propertyName && ts.isIdentifier(element.propertyName)
            ? element.propertyName.text
            : ts.isIdentifier(element.name)
              ? element.name.text
              : null)
        bindPattern(element.name, memberValue(value, member), scope)
      }
      return
    }
    if (ts.isArrayBindingPattern(name)) {
      name.elements.forEach((element, index) => {
        if (ts.isBindingElement(element)) {
          bindPattern(element.name, memberValue(value, String(index)), scope)
        }
      })
    }
  }

  function assignExpressionPattern(node, value, scope) {
    if (ts.isIdentifier(node)) {
      scope.assign(node.text, value)
      return
    }
    if (ts.isObjectLiteralExpression(node)) {
      for (const property of node.properties) {
        if (ts.isShorthandPropertyAssignment(property)) {
          scope.assign(
            property.name.text,
            memberValue(value, property.name.text)
          )
        } else if (ts.isPropertyAssignment(property)) {
          const member =
            stringLiteralValue(property.name) ??
            (ts.isIdentifier(property.name) ? property.name.text : null)
          assignExpressionPattern(
            property.initializer,
            memberValue(value, member),
            scope
          )
        }
      }
      return
    }
    if (ts.isArrayLiteralExpression(node)) {
      node.elements.forEach((element, index) => {
        assignExpressionPattern(element, memberValue(value, String(index)), scope)
      })
    }
  }

  function analyzeFunction(node, parentScope) {
    const functionScope = new Scope(parentScope)
    for (const parameter of node.parameters) {
      for (const name of declaredNames(parameter.name)) {
        functionScope.declare(name)
      }
    }
    if (node.body && ts.isBlock(node.body)) {
      analyzeStatements(node.body.statements, functionScope)
    } else if (node.body) {
      evaluate(node.body, functionScope)
    }
  }

  function analyzeCall(target, argumentsList, scope) {
    let callable = target
    if (
      ["call", "apply", "bind"].includes(callable.member) &&
      callable.target
    ) {
      callable = callable.target
    }
    const argumentValues = argumentsList.map((argument) =>
      evaluate(argument, scope)
    )
    if (
      callable.tags.has("analytics") &&
      (!callable.member || ANALYTICS_METHODS.has(callable.member))
    ) {
      add("analytics initialization")
    }
    if (
      callable.tags.has("fingerprint") &&
      (!callable.member ||
        FINGERPRINT_NAMES.has(callable.member) ||
        ["get", "load"].includes(callable.member))
    ) {
      add("device fingerprinting")
    }
    if (
      callable.tags.has("crash") &&
      (!callable.member || CRASH_METHODS.has(callable.member))
    ) {
      add("automatic crash upload")
    }
    if (
      callable.tags.has("logger") &&
      callable.member &&
      LOG_METHODS.has(callable.member) &&
      argumentValues.some((value) => value.tags.has("environment"))
    ) {
      add("environment-secret logging")
    }
    return mergeValues(callable)
  }

  function evaluate(node, scope) {
    if (!node) return emptyValue()
    if (
      ts.isParenthesizedExpression(node) ||
      ts.isAsExpression(node) ||
      ts.isTypeAssertionExpression(node) ||
      ts.isNonNullExpression(node) ||
      ts.isAwaitExpression(node) ||
      ts.isSatisfiesExpression(node)
    ) {
      return evaluate(node.expression, scope)
    }
    if (ts.isIdentifier(node)) return globalValue(node.text, scope)
    if (ts.isStringLiteralLike(node) || ts.isNumericLiteral(node)) {
      return emptyValue()
    }
    if (
      ts.isArrowFunction(node) ||
      ts.isFunctionExpression(node) ||
      ts.isMethodDeclaration(node)
    ) {
      analyzeFunction(node, scope)
      return emptyValue()
    }
    if (
      ts.isPropertyAccessExpression(node) ||
      ts.isElementAccessExpression(node)
    ) {
      const base = evaluate(node.expression, scope)
      const member = propertyName(node)
      const value = memberValue(base, member)
      value.target = base
      return value
    }
    if (ts.isObjectLiteralExpression(node)) {
      const value = emptyValue()
      for (const property of node.properties) {
        if (ts.isSpreadAssignment(property)) {
          const spread = evaluate(property.expression, scope)
          const merged = mergeValues(value, spread)
          value.tags = merged.tags
          for (const [name, member] of spread.properties) {
            value.properties.set(name, member)
          }
        } else if (ts.isPropertyAssignment(property)) {
          const name =
            stringLiteralValue(property.name) ??
            (ts.isIdentifier(property.name) ? property.name.text : null)
          const propertyValue = evaluate(property.initializer, scope)
          for (const tag of propertyValue.tags) value.tags.add(tag)
          if (name) value.properties.set(name, propertyValue)
          if (
            (name === "uploadToServer" &&
              property.initializer.kind === ts.SyntaxKind.TrueKeyword) ||
            name === "submitURL"
          ) {
            add("automatic crash upload")
          }
        } else if (
          ts.isMethodDeclaration(property) ||
          ts.isGetAccessorDeclaration(property) ||
          ts.isSetAccessorDeclaration(property)
        ) {
          analyzeFunction(property, scope)
        } else if (ts.isShorthandPropertyAssignment(property)) {
          const propertyValue = globalValue(property.name.text, scope)
          for (const tag of propertyValue.tags) value.tags.add(tag)
          value.properties.set(property.name.text, propertyValue)
        }
      }
      return value
    }
    if (ts.isArrayLiteralExpression(node)) {
      const value = mergeValues(...node.elements.map((element) => evaluate(element, scope)))
      node.elements.forEach((element, index) => {
        value.properties.set(String(index), evaluate(element, scope))
      })
      return value
    }
    if (ts.isTemplateExpression(node)) {
      return mergeValues(
        ...node.templateSpans.map((span) => evaluate(span.expression, scope))
      )
    }
    if (ts.isConditionalExpression(node)) {
      evaluate(node.condition, scope)
      return mergeValues(
        evaluate(node.whenTrue, scope),
        evaluate(node.whenFalse, scope)
      )
    }
    if (ts.isBinaryExpression(node)) {
      if (
        node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
        node.operatorToken.kind <= ts.SyntaxKind.LastAssignment
      ) {
        const value = evaluate(node.right, scope)
        assignExpressionPattern(node.left, value, scope)
        return value
      }
      return mergeValues(
        evaluate(node.left, scope),
        evaluate(node.right, scope)
      )
    }
    if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
      const imported = dynamicImportedModule(node)
      const required =
        requiredModule(node) && !scope.has("require")
          ? requiredModule(node)
          : null
      const moduleName = imported ?? required
      if (moduleName) {
        if (
          BANNED_DEPENDENCY_PATTERNS.some((pattern) =>
            pattern.test(moduleName)
          )
        ) {
          add("forbidden analytics/crash/fingerprint import")
        }
        return moduleValue(moduleName)
      }
      const target = evaluate(node.expression, scope)
      const result = analyzeCall(target, [...(node.arguments ?? [])], scope)
      return target.member === "bind" && target.target
        ? target.target
        : result
    }
    if (ts.isVariableDeclaration(node)) {
      const value = evaluate(node.initializer, scope)
      bindPattern(node.name, value, scope)
      return value
    }
    if (ts.isExpressionStatement(node)) return evaluate(node.expression, scope)
    if (ts.isReturnStatement(node) || ts.isThrowStatement(node)) {
      return evaluate(node.expression, scope)
    }
    if (ts.isSpreadElement(node) || ts.isSpreadAssignment(node)) {
      return evaluate(node.expression, scope)
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
      return evaluate(node.initializer, scope)
    }
    const values = []
    ts.forEachChild(node, (child) => values.push(evaluate(child, scope)))
    return mergeValues(...values)
  }

  function analyzeStatement(statement, scope) {
    if (ts.isImportDeclaration(statement)) {
      const moduleName = stringLiteralValue(statement.moduleSpecifier)
      const clause = statement.importClause
      const typeOnly = Boolean(clause?.isTypeOnly)
      if (
        moduleName &&
        !typeOnly &&
        BANNED_DEPENDENCY_PATTERNS.some((pattern) => pattern.test(moduleName))
      ) {
        add("forbidden analytics/crash/fingerprint import")
      }
      if (!moduleName || !clause) return
      if (clause.name) {
        scope.assign(
          clause.name.text,
          typeOnly ? emptyValue() : moduleValue(moduleName)
        )
      }
      const bindings = clause.namedBindings
      if (bindings && ts.isNamespaceImport(bindings)) {
        scope.assign(
          bindings.name.text,
          typeOnly ? emptyValue() : moduleValue(moduleName)
        )
      } else if (bindings && ts.isNamedImports(bindings)) {
        for (const element of bindings.elements) {
          const elementTypeOnly = typeOnly || element.isTypeOnly
          const member = element.propertyName?.text ?? element.name.text
          scope.assign(
            element.name.text,
            elementTypeOnly
              ? emptyValue()
              : moduleValue(moduleName, member)
          )
        }
      }
      return
    }
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        evaluate(declaration, scope)
      }
      return
    }
    if (ts.isFunctionDeclaration(statement)) {
      analyzeFunction(statement, scope)
      return
    }
    if (ts.isClassDeclaration(statement)) {
      for (const member of statement.members) {
        if (
          ts.isMethodDeclaration(member) ||
          ts.isGetAccessorDeclaration(member) ||
          ts.isSetAccessorDeclaration(member)
        ) {
          analyzeFunction(member, scope)
        } else if (ts.isPropertyDeclaration(member)) {
          evaluate(member.initializer, scope)
        }
      }
      return
    }
    if (ts.isBlock(statement)) {
      analyzeStatements(statement.statements, new Scope(scope))
      return
    }
    if (ts.isIfStatement(statement)) {
      evaluate(statement.expression, scope)
      const before = scope.visible()
      analyzeStatement(statement.thenStatement, new Scope(scope))
      const afterThen = scope.visible()
      for (const [name, value] of before) scope.assign(name, value)
      if (statement.elseStatement) {
        analyzeStatement(statement.elseStatement, new Scope(scope))
      }
      const afterElse = statement.elseStatement ? scope.visible() : before
      for (const name of new Set([
        ...before.keys(),
        ...afterThen.keys(),
        ...afterElse.keys()
      ])) {
        scope.assign(
          name,
          mergeValues(
            afterThen.get(name) ?? before.get(name),
            afterElse.get(name) ?? before.get(name)
          )
        )
      }
      return
    }
    if (
      ts.isForStatement(statement) ||
      ts.isForInStatement(statement) ||
      ts.isForOfStatement(statement) ||
      ts.isWhileStatement(statement) ||
      ts.isDoStatement(statement)
    ) {
      evaluate(statement, new Scope(scope))
      return
    }
    if (ts.isTryStatement(statement)) {
      analyzeStatement(statement.tryBlock, new Scope(scope))
      if (statement.catchClause) {
        const catchScope = new Scope(scope)
        if (statement.catchClause.variableDeclaration) {
          for (const name of declaredNames(
            statement.catchClause.variableDeclaration.name
          )) {
            catchScope.declare(name)
          }
        }
        analyzeStatement(statement.catchClause.block, catchScope)
      }
      if (statement.finallyBlock) {
        analyzeStatement(statement.finallyBlock, new Scope(scope))
      }
      return
    }
    evaluate(statement, scope)
  }

  function analyzeStatements(statements, scope) {
    predeclare(statements, scope)
    for (const statement of statements) analyzeStatement(statement, scope)
  }

  analyzeStatements(sourceFile.statements, new Scope())
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
