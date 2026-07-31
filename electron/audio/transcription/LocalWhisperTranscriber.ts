import { spawn } from "node:child_process"
import { lstat } from "node:fs/promises"
import path from "node:path"
import {
  loadAudioArtifactManifest,
  sha256File,
  verifyPinnedArtifact,
  type MacArchitecture
} from "./artifactManifest"

const MAX_TRANSCRIPT_BYTES = 1_048_576
const NETWORK_DENIAL_PROFILE = "(version 1) (allow default) (deny network*)"

export interface LocalWhisperOptions {
  readonly executable: string
  readonly model: string
  readonly manifest: string
  readonly sandboxExecutable?: string
  readonly architecture?: MacArchitecture
}

export class LocalWhisperTranscriber {
  constructor(private readonly options: LocalWhisperOptions) {}

  async transcribe(
    waveFile: string,
    signal?: AbortSignal
  ): Promise<string> {
    const architecture =
      this.options.architecture ??
      (process.arch === "arm64" ? "arm64" : process.arch === "x64" ? "x64" : undefined)
    if (!architecture) throw new Error("Local transcription architecture is unsupported")
    const manifest = await loadAudioArtifactManifest(this.options.manifest)
    const binary = manifest.binaries[architecture]
    if (binary.qualification !== "qualified" || binary.sha256 === null) {
      throw new Error(`Local transcription binary is not qualified for ${architecture}`)
    }
    for (const target of [
      this.options.executable,
      this.options.model,
      waveFile
    ]) {
      if (!path.isAbsolute(target)) {
        throw new Error("Local transcription paths must be absolute")
      }
      const metadata = await lstat(target)
      if (!metadata.isFile() || metadata.isSymbolicLink()) {
        throw new Error("Local transcription input must be a regular file")
      }
    }
    if ((await sha256File(this.options.executable)) !== binary.sha256) {
      throw new Error("Local transcription binary failed checksum verification")
    }
    await verifyPinnedArtifact(this.options.model, manifest.model)

    const sandboxExecutable =
      this.options.sandboxExecutable ?? "/usr/bin/sandbox-exec"
    const sandboxMetadata = await lstat(sandboxExecutable)
    if (!sandboxMetadata.isFile() || sandboxMetadata.isSymbolicLink()) {
      throw new Error("Local transcription network sandbox is unavailable")
    }
    const args = [
      "-p",
      NETWORK_DENIAL_PROFILE,
      this.options.executable,
      "--model",
      this.options.model,
      "--file",
      waveFile,
      "--language",
      "en",
      "--no-timestamps"
    ]
    return new Promise<string>((resolve, reject) => {
      const child = spawn(sandboxExecutable, args, {
        shell: false,
        env: {
          PATH: "/usr/bin:/bin",
          LC_ALL: "C"
        },
        stdio: ["ignore", "pipe", "pipe"]
      })
      const output: Buffer[] = []
      let outputBytes = 0
      let stderrBytes = 0
      const abort = () => child.kill("SIGTERM")
      signal?.addEventListener("abort", abort, { once: true })
      child.stdout.on("data", (chunk: Buffer) => {
        outputBytes += chunk.length
        if (outputBytes > MAX_TRANSCRIPT_BYTES) {
          child.kill("SIGTERM")
          return
        }
        output.push(Buffer.from(chunk))
      })
      child.stderr.on("data", (chunk: Buffer) => {
        stderrBytes += chunk.length
        if (stderrBytes > MAX_TRANSCRIPT_BYTES) child.kill("SIGTERM")
      })
      child.once("error", reject)
      child.once("exit", (code, exitSignal) => {
        signal?.removeEventListener("abort", abort)
        if (signal?.aborted) {
          reject(new Error("Local transcription was cancelled"))
          return
        }
        if (
          code !== 0 ||
          exitSignal !== null ||
          outputBytes > MAX_TRANSCRIPT_BYTES ||
          stderrBytes > MAX_TRANSCRIPT_BYTES
        ) {
          for (const chunk of output) chunk.fill(0)
          reject(new Error("Local transcription failed closed"))
          return
        }
        const combined = Buffer.concat(output)
        const transcript = combined.toString("utf8").trim()
        combined.fill(0)
        for (const chunk of output) chunk.fill(0)
        if (transcript.length === 0) {
          reject(new Error("Local transcription returned no finalized text"))
          return
        }
        resolve(transcript)
      })
    })
  }
}
