import crypto from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import process from "node:process"

const root = process.cwd()
const manifestPath = path.join(
  root,
  "resources",
  "audio",
  "audio-artifacts-v1.json"
)
const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"))
const model = manifest.model
if (
  model?.name !== "ggml-base.en.bin" ||
  !Number.isSafeInteger(model.bytes) ||
  model.bytes <= 0 ||
  typeof model.sha256 !== "string" ||
  !/^[a-f0-9]{64}$/.test(model.sha256) ||
  typeof model.url !== "string"
) {
  throw new Error("Pinned audio model manifest is invalid")
}
const modelUrl = new URL(model.url)
if (
  modelUrl.protocol !== "https:" ||
  modelUrl.hostname !== "huggingface.co" ||
  !modelUrl.pathname.startsWith("/ggerganov/whisper.cpp/resolve/")
) {
  throw new Error("Pinned audio model URL is outside the approved origin")
}

const modelsRoot = path.join(root, ".artifacts", "audio", "models")
const target = path.join(modelsRoot, model.name)
await fs.mkdir(modelsRoot, { recursive: true, mode: 0o700 })
await fs.chmod(modelsRoot, 0o700)

/** @param {string} file */
async function sha256(file) {
  const handle = await fs.open(file, "r")
  const hash = crypto.createHash("sha256")
  let bytes = 0
  try {
    for await (const chunk of handle.createReadStream()) {
      bytes += chunk.length
      hash.update(chunk)
    }
  } finally {
    await handle.close()
  }
  return { bytes, sha256: hash.digest("hex") }
}

/** @param {string} file */
async function accepted(file) {
  try {
    const observed = await sha256(file)
    return observed.bytes === model.bytes && observed.sha256 === model.sha256
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return false
    }
    throw error
  }
}

if (!(await accepted(target))) {
  const temporary = `${target}.partial-${process.pid}-${crypto.randomUUID()}`
  const response = await fetch(modelUrl, {
    redirect: "follow",
    signal: AbortSignal.timeout(120_000)
  })
  if (!response.ok || !response.body) {
    throw new Error(`Pinned audio model download failed (${response.status})`)
  }
  const handle = await fs.open(temporary, "wx", 0o600)
  const reader = response.body.getReader()
  let bytes = 0
  const hash = crypto.createHash("sha256")
  try {
    while (true) {
      const { done, value: chunk } = await reader.read()
      if (done) break
      bytes += chunk.length
      if (bytes > model.bytes) {
        throw new Error("Pinned audio model exceeded its declared size")
      }
      hash.update(chunk)
      await handle.write(chunk)
    }
    await handle.sync()
    await handle.chmod(0o600)
  } catch (error) {
    await handle.close().catch(() => undefined)
    await fs.rm(temporary, { force: true })
    throw error
  }
  await handle.close()
  if (bytes !== model.bytes || hash.digest("hex") !== model.sha256) {
    await fs.rm(temporary, { force: true })
    throw new Error("Pinned audio model failed size/checksum verification")
  }
  await fs.rename(temporary, target)
}

await fs.chmod(target, 0o600)
process.stdout.write(
  `Packaged audio model accepted: bytes=${model.bytes} sha256=${model.sha256}\n`
)
