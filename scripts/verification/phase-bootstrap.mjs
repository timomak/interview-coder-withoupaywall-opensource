import process from "node:process"
import { pathToFileURL } from "node:url"
import {
  acceptControllerBootstrap,
  canonicalJson
} from "./phase-reporter.mjs"

const MAX_RECORD_BYTES = 16_384

export async function readControllerBootstrap(input = process.stdin) {
  let bytes = ""
  for await (const chunk of input) {
    bytes += chunk.toString("utf8")
    if (Buffer.byteLength(bytes) > MAX_RECORD_BYTES) {
      throw new Error("controller bootstrap record is oversized")
    }
  }
  const lines = bytes.trimEnd().split("\n")
  if (bytes.trim() === "" || lines.length !== 1) {
    throw new Error("controller bootstrap must be exactly one record")
  }
  return JSON.parse(lines[0])
}

export async function main() {
  if (
    process.env.INTERVIEWCOPILOT_CONTROLLER_BOOTSTRAP !== "1" ||
    process.argv.length !== 2
  ) {
    throw new Error(
      "phase bootstrap is a controller-only preflight, not an acceptance entrypoint"
    )
  }
  const request = await readControllerBootstrap()
  const response = acceptControllerBootstrap(request)
  process.stdout.write(`${canonicalJson(response)}\n`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
