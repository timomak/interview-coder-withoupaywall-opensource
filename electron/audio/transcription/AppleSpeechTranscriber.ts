import { spawn } from "node:child_process"
import { lstat } from "node:fs/promises"
import path from "node:path"
import { sha256File } from "./artifactManifest"

const MAX_RESULT_BYTES = 1_048_576

interface AppleSpeechResult {
  readonly schemaVersion: 1
  readonly text: string
}

export interface AppleSpeechTranscriberOptions {
  readonly executable: string
  readonly expectedSha256: string
}

export class AppleSpeechTranscriber {
  constructor(private readonly options: AppleSpeechTranscriberOptions) {
    if (
      !path.isAbsolute(options.executable) ||
      !/^[a-f0-9]{64}$/.test(options.expectedSha256)
    ) {
      throw new Error("Apple Speech adapter configuration is invalid")
    }
  }

  async transcribe(
    waveFile: string,
    signal?: AbortSignal
  ): Promise<string> {
    if (!path.isAbsolute(waveFile)) {
      throw new Error("Apple Speech input path must be absolute")
    }
    for (const target of [this.options.executable, waveFile]) {
      const metadata = await lstat(target)
      if (!metadata.isFile() || metadata.isSymbolicLink()) {
        throw new Error("Apple Speech input must be a regular file")
      }
    }
    if (
      (await sha256File(this.options.executable)) !==
      this.options.expectedSha256
    ) {
      throw new Error("Apple Speech adapter failed checksum verification")
    }

    return new Promise<string>((resolve, reject) => {
      const child = spawn(
        this.options.executable,
        ["--file", waveFile],
        {
          shell: false,
          env: {
            PATH: "/usr/bin:/bin",
            LC_ALL: "C"
          },
          stdio: ["ignore", "pipe", "pipe"]
        }
      )
      const chunks: Buffer[] = []
      let stdoutBytes = 0
      let stderrBytes = 0
      let settled = false
      const finish = (
        outcome: { readonly text: string } | { readonly error: Error }
      ) => {
        if (settled) return
        settled = true
        signal?.removeEventListener("abort", abort)
        for (const chunk of chunks) chunk.fill(0)
        if ("error" in outcome) reject(outcome.error)
        else resolve(outcome.text)
      }
      const abort = () => child.kill("SIGTERM")
      signal?.addEventListener("abort", abort, { once: true })
      child.stdout.on("data", (chunk: Buffer) => {
        stdoutBytes += chunk.length
        if (stdoutBytes > MAX_RESULT_BYTES) {
          child.kill("SIGTERM")
          return
        }
        chunks.push(Buffer.from(chunk))
      })
      child.stderr.on("data", (chunk: Buffer) => {
        stderrBytes += chunk.length
        if (stderrBytes > MAX_RESULT_BYTES) child.kill("SIGTERM")
      })
      child.once("error", () => {
        finish({ error: new Error("Apple Speech adapter failed to launch") })
      })
      child.once("exit", (code, exitSignal) => {
        if (signal?.aborted) {
          finish({ error: new Error("Apple Speech transcription was cancelled") })
          return
        }
        if (
          code !== 0 ||
          exitSignal !== null ||
          stdoutBytes > MAX_RESULT_BYTES ||
          stderrBytes > MAX_RESULT_BYTES
        ) {
          finish({ error: new Error("Apple Speech transcription failed closed") })
          return
        }
        const output = Buffer.concat(chunks)
        try {
          const raw: unknown = JSON.parse(output.toString("utf8"))
          const value = raw as Partial<AppleSpeechResult>
          if (
            typeof raw !== "object" ||
            raw === null ||
            Object.keys(raw).sort().join(",") !== "schemaVersion,text" ||
            value.schemaVersion !== 1 ||
            typeof value.text !== "string"
          ) {
            throw new Error("Apple Speech adapter returned an invalid result")
          }
          const text = value.text.normalize("NFC").trim()
          if (text.length === 0 || Buffer.byteLength(text) > MAX_RESULT_BYTES) {
            throw new Error("Apple Speech adapter returned no bounded text")
          }
          finish({ text })
        } catch (error) {
          finish({
            error:
              error instanceof Error
                ? error
                : new Error("Apple Speech adapter returned an invalid result")
          })
        } finally {
          output.fill(0)
        }
      })
    })
  }
}
