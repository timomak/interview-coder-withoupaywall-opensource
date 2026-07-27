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
const program = ts.createProgram({
  rootNames: parsed.fileNames,
  options: {
    ...parsed.options,
    allowJs: true,
    checkJs: true,
    strict: true,
    noEmit: true
  }
})
const coveredExecutables = program
  .getRootFileNames()
  .map((fileName) => normalizeRepositoryPath(path.relative(root, fileName)))
  .filter((relativePath) => inventory.executableFiles.includes(relativePath))
  .sort()
const contractedExecutables = inventory.executableFiles.filter(
  (relativePath) => {
    if (coveredExecutables.includes(relativePath)) return true
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
const diagnostics = ts.getPreEmitDiagnostics(program)
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
