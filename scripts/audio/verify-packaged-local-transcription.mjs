import { spawn } from "node:child_process"
import crypto from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import process from "node:process"

const root = process.cwd()
if (process.platform !== "darwin") {
  throw new Error("Packaged local transcription qualification requires macOS")
}

const manifest = JSON.parse(
  await fs.readFile(
    path.join(root, "resources/audio/audio-artifacts-v1.json"),
    "utf8"
  )
)
const fixtures = JSON.parse(
  await fs.readFile(
    path.join(root, "tests/fixtures/audio/synthetic-fixtures-v1.json"),
    "utf8"
  )
)
const model = path.join(root, ".artifacts/audio/models/ggml-base.en.bin")

/** @param {string} file */
async function sha256(file) {
  const hash = crypto.createHash("sha256")
  const handle = await fs.open(file, "r")
  try {
    for await (const chunk of handle.createReadStream()) hash.update(chunk)
  } finally {
    await handle.close()
  }
  return hash.digest("hex")
}

const modelMetadata = await fs.lstat(model)
if (
  !modelMetadata.isFile() ||
  modelMetadata.isSymbolicLink() ||
  modelMetadata.size !== manifest.model.bytes ||
  (await sha256(model)) !== manifest.model.sha256
) {
  throw new Error("Packaged local transcription model is not pinned")
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
 * @param {"arm64" | "x64"} architecture
 * @param {{
 *   file: string,
 *   sha256: string,
 *   requiredNormalizedTokens: string[]
 * }} fixture
 */
async function transcribe(architecture, fixture) {
  const executable = path.join(
    root,
    `resources/audio/whisper/${architecture}/whisper-cli`
  )
  const expected = manifest.binaries[architecture]
  const waveFile = path.join(root, "tests/fixtures/audio", fixture.file)
  const executableMetadata = await fs.lstat(executable)
  if (
    expected?.qualification !== "qualified" ||
    typeof expected.sha256 !== "string" ||
    !executableMetadata.isFile() ||
    executableMetadata.isSymbolicLink() ||
    (await sha256(executable)) !== expected.sha256 ||
    (await sha256(waveFile)) !== fixture.sha256
  ) {
    throw new Error(`Packaged ${architecture} transcription input is not pinned`)
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
    const chunks = []
    let stdoutBytes = 0
    let stderrBytes = 0
    child.stdout.on("data", (chunk) => {
      stdoutBytes += chunk.length
      if (stdoutBytes > 1_048_576) child.kill("SIGTERM")
      else chunks.push(Buffer.from(chunk))
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
        reject(
          new Error(
            `Packaged ${architecture} local transcription failed offline`
          )
        )
        return
      }
      const combined = Buffer.concat(chunks)
      const text = combined.toString("utf8")
      combined.fill(0)
      for (const chunk of chunks) chunk.fill(0)
      resolve(text)
    })
  })
  const words = normalize(output).split(" ")
  for (const token of fixture.requiredNormalizedTokens) {
    if (!words.includes(normalize(token))) {
      throw new Error(
        `Packaged ${architecture} transcription omitted a fixture marker`
      )
    }
  }
}

/** @type {Array<"arm64" | "x64">} */
const architectures = process.arch === "arm64" ? ["arm64", "x64"] : ["x64"]
let passed = 0
for (const architecture of architectures) {
  for (const fixture of fixtures.fixtures) {
    await transcribe(architecture, fixture)
    passed += 1
  }
}

process.stdout.write(
  `AUDIO_ENGINE_COUNTS passed=${passed} failed=0 skipped=0 ` +
    `architectures=${architectures.join(",")}\n`
)
