import { spawn } from "node:child_process"
import crypto from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import process from "node:process"

const [artifactRoot, manifestPath, fixtureManifestPath] = process.argv.slice(2)
if (
  !artifactRoot ||
  !manifestPath ||
  !fixtureManifestPath ||
  ![artifactRoot, manifestPath, fixtureManifestPath].every(path.isAbsolute)
) {
  throw new Error(
    "usage: verify-local-transcription <absolute-artifact-root> <absolute-artifact-manifest> <absolute-fixture-manifest>"
  )
}

const artifactManifest = JSON.parse(await fs.readFile(manifestPath, "utf8"))
const fixtureManifest = JSON.parse(await fs.readFile(fixtureManifestPath, "utf8"))
const architecture = process.arch
if (architecture !== "arm64" && architecture !== "x64") {
  throw new Error("unsupported local-transcription architecture")
}
const executable = path.join(
  artifactRoot,
  architecture === "arm64" ? "build/bin/whisper-cli" : "build-x64/bin/whisper-cli"
)
const model = path.join(artifactRoot, "ggml-base.en.bin")
const expectedBinary = artifactManifest.binaries[architecture]
if (
  expectedBinary?.qualification !== "qualified" ||
  !/^[a-f0-9]{64}$/.test(expectedBinary.sha256)
) {
  throw new Error("architecture binary is not checksum-qualified")
}

/** @param {string} file */
async function sha256(file) {
  return crypto
    .createHash("sha256")
    .update(await fs.readFile(file))
    .digest("hex")
}

if ((await sha256(executable)) !== expectedBinary.sha256) {
  throw new Error("whisper.cpp binary checksum mismatch")
}
const modelMetadata = await fs.stat(model)
if (
  modelMetadata.size !== artifactManifest.model.bytes ||
  (await sha256(model)) !== artifactManifest.model.sha256
) {
  throw new Error("whisper.cpp model checksum mismatch")
}

/** @param {string} value */
function normalize(value) {
  return value
    .toLocaleLowerCase("en-US")
    .replace(/\bnine\b/g, "9")
    .replace(/\bseven\b/g, "7")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

/**
 * @param {{
 *   file: string,
 *   sha256: string,
 *   requiredNormalizedTokens: string[]
 * }} fixture
 */
async function transcribe(fixture) {
  const waveFile = path.join(artifactRoot, fixture.file)
  if ((await sha256(waveFile)) !== fixture.sha256) {
    throw new Error("synthetic fixture checksum mismatch")
  }
  const output = await new Promise((resolve, reject) => {
    const child = spawn(
      "/usr/bin/sandbox-exec",
      [
        "-p",
        "(version 1) (allow default) (deny network*)",
        executable,
        "--model",
        model,
        "--file",
        waveFile,
        "--language",
        "en",
        "--no-timestamps"
      ],
      {
        shell: false,
        env: { PATH: "/usr/bin:/bin", LC_ALL: "C" },
        stdio: ["ignore", "pipe", "pipe"]
      }
    )
    /** @type {Buffer[]} */
    const stdout = []
    let stdoutBytes = 0
    let stderrBytes = 0
    child.stdout.on("data", (chunk) => {
      stdoutBytes += chunk.length
      if (stdoutBytes > 1_048_576) child.kill("SIGTERM")
      else stdout.push(Buffer.from(chunk))
    })
    child.stderr.on("data", (chunk) => {
      stderrBytes += chunk.length
      if (stderrBytes > 1_048_576) child.kill("SIGTERM")
    })
    child.once("error", reject)
    child.once("exit", (code, signal) => {
      if (
        code !== 0 ||
        signal !== null ||
        stdoutBytes > 1_048_576 ||
        stderrBytes > 1_048_576
      ) {
        reject(new Error("offline local transcription failed closed"))
        return
      }
      const combined = Buffer.concat(stdout)
      const text = combined.toString("utf8")
      combined.fill(0)
      for (const chunk of stdout) chunk.fill(0)
      resolve(text)
    })
  })
  const normalized = normalize(output)
  for (const token of fixture.requiredNormalizedTokens) {
    if (!normalized.split(" ").includes(normalize(token))) {
      throw new Error("offline local transcription omitted a required marker")
    }
  }
}

let passed = 0
for (const fixture of fixtureManifest.fixtures) {
  await transcribe(fixture)
  passed += 1
}
process.stdout.write(
  `AUDIO_NATIVE_COUNTS passed=${passed} failed=0 skipped=0 architecture=${architecture}\n`
)
