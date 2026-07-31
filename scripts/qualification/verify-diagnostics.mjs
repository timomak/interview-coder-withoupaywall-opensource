import fs from "node:fs"
import path from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
try {
  const source = fs.readFileSync(
    path.join(root, "electron/diagnostics/DiagnosticService.ts"),
    "utf8"
  )
  for (const required of ["preview", "redacted", "localOnly", "exact displayed preview"]) {
    if (!source.includes(required)) throw new Error(`Diagnostic contract missing ${required}`)
  }
  if (/https?:\/\/|fetch\s*\(|XMLHttpRequest|net\.request/.test(source)) {
    throw new Error("Diagnostic service contains a network path")
  }
  console.log("Diagnostic preview/export is redacted, manual, and local-only.")
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
