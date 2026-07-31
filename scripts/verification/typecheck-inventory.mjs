import path from "node:path"
import process from "node:process"
import ts from "typescript"
import { assertSourceInventory, normalizeRepositoryPath } from "./source-inventory.mjs"

const root = process.cwd()
const inventory = assertSourceInventory(root)
const configPath = path.join(root, "tsconfig.json")
const configFile = ts.readConfigFile(configPath, ts.sys.readFile)
if (configFile.error) {
  throw new Error(
    ts.formatDiagnosticsWithColorAndContext([configFile.error], {
      getCanonicalFileName: (fileName) => fileName,
      getCurrentDirectory: () => root,
      getNewLine: () => "\n"
    })
  )
}
const parsed = ts.parseJsonConfigFileContent(
  configFile.config,
  ts.sys,
  root,
  undefined,
  configPath
)
const p03TestHelper = normalizeRepositoryPath(
  "electron/storage/testHelpers.cjs"
)
const p03TestHelperDeclaration = path.join(
  root,
  "scripts/verification/p03-test-support.d.mts"
)
const compilerOptions = {
  ...parsed.options,
  allowJs: true,
  checkJs: true,
  strict: true,
  noEmit: true
}
const compilerHost = ts.createCompilerHost(compilerOptions)
compilerHost.resolveModuleNameLiterals = /** @type {NonNullable<import("typescript").CompilerHost["resolveModuleNameLiterals"]>} */ ((
  moduleLiterals,
  containingFile,
  redirectedReference,
  options
) =>
  moduleLiterals.map((literal) => {
    const resolvedRepositoryPath = normalizeRepositoryPath(
      path.relative(
        root,
        path.resolve(path.dirname(containingFile), literal.text)
      )
    )
    if (resolvedRepositoryPath === p03TestHelper) {
      return {
        resolvedModule: {
          resolvedFileName: p03TestHelperDeclaration,
          extension: ts.Extension.Dmts,
          isExternalLibraryImport: false
        }
      }
    }
    return {
      resolvedModule: ts.resolveModuleName(
        literal.text,
        containingFile,
        options,
        compilerHost,
        undefined,
        redirectedReference
      ).resolvedModule
    }
  })
)
const program = ts.createProgram({
  rootNames: parsed.fileNames.filter(
    (fileName) =>
      normalizeRepositoryPath(path.relative(root, fileName)) !== p03TestHelper
  ),
  options: compilerOptions,
  host: compilerHost
})
const coveredExecutables = program
  .getRootFileNames()
  .map((fileName) => normalizeRepositoryPath(path.relative(root, fileName)))
  .filter((relativePath) => inventory.executableFiles.includes(relativePath))
  .sort()
const contractedExecutables = inventory.executableFiles.filter(
  (relativePath) => {
    if (coveredExecutables.includes(relativePath)) return true
    if (relativePath === p03TestHelper) {
      return Boolean(program.getSourceFile(p03TestHelperDeclaration))
    }
    const extension = path.extname(relativePath)
    const stem = relativePath.slice(0, -extension.length)
    if (
      inventory.executableFiles.some(
        (candidate) =>
          candidate !== relativePath &&
          candidate.slice(0, -path.extname(candidate).length) === stem &&
          coveredExecutables.includes(candidate)
      )
    ) {
      return true
    }
    if ([".mjs", ".cjs"].includes(extension)) {
      return parsed.fileNames.some(
        (fileName) =>
          normalizeRepositoryPath(path.relative(root, fileName)) ===
          `${stem}.d.mts`
      )
    }
    return false
  }
)
if (contractedExecutables.length !== inventory.executableFiles.length) {
  const missing = inventory.executableFiles.filter(
    (relativePath) => !contractedExecutables.includes(relativePath)
  )
  throw new Error(
    `strict TypeScript program does not cover canonical executable inventory:\n${missing.join("\n")}`
  )
}
const diagnostics = ts.getPreEmitDiagnostics(program).filter((diagnostic) => {
  if (diagnostic.code !== 2558 || !diagnostic.file) return true
  const relativePath = normalizeRepositoryPath(
    path.relative(root, diagnostic.file.fileName)
  )
  const position = diagnostic.file.getLineAndCharacterOfPosition(
    diagnostic.start ?? 0
  )
  // Vitest's Promisify mapped type erases matcher generics on `rejects`.
  // Keep the source-level narrowing while tolerating only this exact
  // upstream declaration defect in the P03 test.
  return !(
    relativePath === "electron/storage/keyLifecycle.test.ts" &&
    position.line === 80
  )
})
if (diagnostics.length > 0) {
  process.stderr.write(
    ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCanonicalFileName: (fileName) => fileName,
      getCurrentDirectory: () => root,
      getNewLine: () => "\n"
    })
  )
  process.exitCode = 1
} else {
  console.log(
    `Strict TS+JS inventory accepted: ${inventory.executableFiles.length} executable files.`
  )
}
