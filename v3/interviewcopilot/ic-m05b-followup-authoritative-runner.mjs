import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"

const BASE_RUNNER = path.join(
  path.dirname(new URL(import.meta.url).pathname),
  "ic-m05b-authoritative-runner.mjs"
)
const EXPECTED_BASE_SHA256 =
  "4cb85351b25324fc7b6ada5a0c21f033b277ff619d1cb0ad029410618592a64b"
const PRIOR_CANDIDATE = "6d72db12de8ebda93e5b193e57144e7cf3ab22c6"
const FOLLOWUP_CANDIDATE = "8aa2e988fdee442c144a7dae31fb2bb6b1748c23"
const PRIOR_ATTEMPT = "IC-M05B-AUTH-02"
const FOLLOWUP_ATTEMPT = "IC-M05B-FOLLOWUP-AUTH-01"

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex")
}

function replaceExactlyOnce(source, from, to) {
  const first = source.indexOf(from)
  if (first < 0 || source.indexOf(from, first + from.length) >= 0) {
    throw new Error(`expected one exact runner binding for ${from}`)
  }
  return source.slice(0, first) + to + source.slice(first + from.length)
}

const baseBytes = fs.readFileSync(BASE_RUNNER)
if (sha256(baseBytes) !== EXPECTED_BASE_SHA256) {
  throw new Error("authoritative base runner hash mismatch")
}

let source = baseBytes.toString("utf8")
source = replaceExactlyOnce(source, PRIOR_CANDIDATE, FOLLOWUP_CANDIDATE)
source = replaceExactlyOnce(source, PRIOR_ATTEMPT, FOLLOWUP_ATTEMPT)
const transformedSha256 = sha256(source)
process.stdout.write(
  `FOLLOWUP_RUNNER_BINDING ${JSON.stringify({
    baseRunnerSha256: EXPECTED_BASE_SHA256,
    candidate: FOLLOWUP_CANDIDATE,
    attempt: FOLLOWUP_ATTEMPT,
    transformedSha256
  })}\n`
)

await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`)
