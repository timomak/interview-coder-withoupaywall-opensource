import path from "node:path"
import process from "node:process"
import { runEntries } from "./phase-reporter.mjs"

function artifactsArgument(argv) {
  const index = argv.indexOf("--artifacts")
  if (index === -1) {
    return ".artifacts/verification/P01-injected-failure"
  }
  if (!argv[index + 1]) {
    throw new Error("--artifacts requires a path")
  }
  return argv[index + 1]
}

const entries = [
  {
    label: "p01",
    argv: [
      process.execPath,
      "-e",
      "console.log('VERIFICATION_COUNTS {\"passed\":1,\"failed\":0,\"skipped\":0}'); process.exit(7)"
    ],
    classification: "test",
    expectedExit: 0,
    minimumPassed: 1
  },
  {
    label: "build",
    argv: [
      process.execPath,
      "-e",
      "console.log('injected-failure proof continued after the failed child')"
    ],
    classification: "command",
    expectedExit: 0
  }
]

try {
  const result = await runEntries({
    planId: "P01-injected-failure-proof",
    entries,
    artifactsDirectory: artifactsArgument(process.argv.slice(2))
  })
  console.log(
    `INJECTED_FAILURE aggregate_raw_exit=${result.report.aggregateExit} json=${path.relative(
      process.cwd(),
      result.jsonPath
    )} text=${path.relative(process.cwd(), result.textPath)}`
  )
  process.exitCode = result.report.aggregateExit
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
