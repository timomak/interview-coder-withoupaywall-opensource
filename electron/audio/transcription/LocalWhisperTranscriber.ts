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
const TRANSCRIPTION_TIMEOUT_MS = 120_000
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
    this.throwIfCancelled(signal)
    const architecture =
      this.options.architecture ??
      (process.arch === "arm64" ? "arm64" : process.arch === "x64" ? "x64" : undefined)
    if (!architecture) throw new Error("Local transcription architecture is unsupported")
    const manifest = await loadAudioArtifactManifest(this.options.manifest)
    this.throwIfCancelled(signal)
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
      this.throwIfCancelled(signal)
      if (!metadata.isFile() || metadata.isSymbolicLink()) {
        throw new Error("Local transcription input must be a regular file")
      }
    }
    if ((await sha256File(this.options.executable)) !== binary.sha256) {
      throw new Error("Local transcription binary failed checksum verification")
    }
    this.throwIfCancelled(signal)
    await verifyPinnedArtifact(this.options.model, manifest.model)
    this.throwIfCancelled(signal)

    const sandboxExecutable =
      this.options.sandboxExecutable ?? "/usr/bin/sandbox-exec"
    const sandboxMetadata = await lstat(sandboxExecutable)
    this.throwIfCancelled(signal)
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
    this.throwIfCancelled(signal)
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
      let settled = false
      let timedOut = false
      const finish = (
        outcome: { readonly text: string } | { readonly error: Error }
      ) => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        signal?.removeEventListener("abort", abort)
        for (const chunk of output) chunk.fill(0)
        if ("error" in outcome) reject(outcome.error)
        else resolve(outcome.text)
      }
      const abort = () => child.kill("SIGTERM")
      signal?.addEventListener("abort", abort, { once: true })
      if (signal?.aborted) abort()
      const timeout = setTimeout(() => {
        timedOut = true
        child.kill("SIGKILL")
      }, TRANSCRIPTION_TIMEOUT_MS)
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
      child.once("error", () => {
        finish({ error: new Error("Local transcription failed to launch") })
      })
      child.once("close", (code, exitSignal) => {
        if (signal?.aborted) {
          finish({ error: new Error("Local transcription was cancelled") })
          return
        }
        if (timedOut) {
          finish({ error: new Error("Local transcription timed out") })
          return
        }
        if (
          code !== 0 ||
          exitSignal !== null ||
          outputBytes > MAX_TRANSCRIPT_BYTES ||
          stderrBytes > MAX_TRANSCRIPT_BYTES
        ) {
          finish({ error: new Error("Local transcription failed closed") })
          return
        }
        const combined = Buffer.concat(output)
        const transcript = combined.toString("utf8").trim()
        combined.fill(0)
        if (transcript.length === 0) {
          finish({
            error: new Error("Local transcription returned no finalized text")
          })
          return
        }
        finish({ text: transcript })
      })
    })
  }

  private throwIfCancelled(signal?: AbortSignal): void {
    if (signal?.aborted) {
      throw new Error("Local transcription was cancelled")
    }
  }
}
