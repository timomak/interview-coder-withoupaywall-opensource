import { createHash } from "node:crypto"
import { createReadStream } from "node:fs"
import { lstat, readFile } from "node:fs/promises"
import path from "node:path"

export type MacArchitecture = "arm64" | "x64"

export interface AudioArtifactManifest {
  readonly schemaVersion: 1
  readonly engine: {
    readonly name: "whisper.cpp"
    readonly tag: string
    readonly commit: string
    readonly sourceArchive: {
      readonly url: string
      readonly bytes: number
      readonly sha256: string
    }
    readonly license: {
      readonly id: "MIT"
      readonly file: string
      readonly sha256: string
    }
  }
  readonly model: {
    readonly name: "ggml-base.en.bin"
    readonly repositoryRevision: string
    readonly url: string
    readonly bytes: number
    readonly sha256: string
    readonly license: {
      readonly id: "MIT"
      readonly file: string
      readonly sha256: string
    }
  }
  readonly binaries: Readonly<
    Record<
      MacArchitecture,
      {
        readonly sha256: string | null
        readonly qualification: "pending-integration-build" | "qualified"
      }
    >
  >
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value)
}

export async function loadAudioArtifactManifest(
  manifestPath: string
): Promise<AudioArtifactManifest> {
  const value: unknown = JSON.parse(await readFile(manifestPath, "utf8"))
  if (typeof value !== "object" || value === null) {
    throw new Error("Audio artifact manifest is malformed")
  }
  const candidate = value as AudioArtifactManifest
  if (
    candidate.schemaVersion !== 1 ||
    candidate.engine?.name !== "whisper.cpp" ||
    !/^[a-f0-9]{40}$/.test(candidate.engine.commit) ||
    !isSha256(candidate.engine.sourceArchive?.sha256) ||
    candidate.engine.sourceArchive.bytes <= 0 ||
    candidate.engine.license?.id !== "MIT" ||
    candidate.engine.license.file !== "LICENSE-whisper.cpp.txt" ||
    !isSha256(candidate.engine.license.sha256) ||
    candidate.model?.name !== "ggml-base.en.bin" ||
    !/^[a-f0-9]{40}$/.test(candidate.model.repositoryRevision) ||
    !isSha256(candidate.model.sha256) ||
    candidate.model.bytes <= 0 ||
    candidate.model.license?.id !== "MIT" ||
    candidate.model.license.file !== "LICENSE-OpenAI-Whisper.txt" ||
    !isSha256(candidate.model.license.sha256) ||
    !candidate.binaries?.arm64 ||
    !candidate.binaries?.x64
  ) {
    throw new Error("Audio artifact manifest is malformed")
  }
  for (const architecture of ["arm64", "x64"] as const) {
    const artifact = candidate.binaries[architecture]
    if (
      (artifact.sha256 !== null && !isSha256(artifact.sha256)) ||
      (artifact.qualification !== "pending-integration-build" &&
        artifact.qualification !== "qualified") ||
      (artifact.qualification === "qualified" && artifact.sha256 === null)
    ) {
      throw new Error("Audio binary manifest is malformed")
    }
  }
  await verifyLicense(manifestPath, candidate.engine.license)
  await verifyLicense(manifestPath, candidate.model.license)
  return candidate
}

async function verifyLicense(
  manifestPath: string,
  license: { readonly file: string; readonly sha256: string }
): Promise<void> {
  const file = path.join(path.dirname(manifestPath), license.file)
  const metadata = await lstat(file)
  if (
    !metadata.isFile() ||
    metadata.isSymbolicLink() ||
    (await sha256File(file)) !== license.sha256
  ) {
    throw new Error("Audio artifact license failed checksum verification")
  }
}

export async function sha256File(file: string): Promise<string> {
  const hash = createHash("sha256")
  await new Promise<void>((resolve, reject) => {
    const input = createReadStream(file)
    input.on("data", (chunk) => hash.update(chunk))
    input.once("error", reject)
    input.once("end", resolve)
  })
  return hash.digest("hex")
}

export async function verifyPinnedArtifact(
  file: string,
  expected: { readonly bytes: number; readonly sha256: string }
): Promise<void> {
  const metadata = await lstat(file)
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error("Pinned audio artifact must be a regular file")
  }
  if (
    metadata.size !== expected.bytes ||
    (await sha256File(file)) !== expected.sha256
  ) {
    throw new Error("Pinned audio artifact failed checksum verification")
  }
}
