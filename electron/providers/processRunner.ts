import { access } from "node:fs/promises"
import { constants } from "node:fs"
import path from "node:path"
import {
  ChildProcessWithoutNullStreams,
  SpawnOptionsWithoutStdio,
  spawn
} from "node:child_process"
import { scrubProviderEnvironment } from "./environment"
import { sanitizeProviderText } from "./sanitize"

export type ProviderProcessFailure =
  | "cancelled"
  | "output-limit"
  | "process-failed"
  | "timeout"

export interface ProcessResult {
  stdoutLines: readonly string[]
  stderr: string
  exitCode: number | null
  signal: NodeJS.Signals | null
  failure?: ProviderProcessFailure
}

export type SpawnProviderChild = (
  executable: string,
  args: readonly string[],
  options: SpawnOptionsWithoutStdio
) => ChildProcessWithoutNullStreams

export interface ProcessRequest {
  executable: string
  args: readonly string[]
  stdinLines?: readonly string[]
  environment?: NodeJS.ProcessEnv
  timeoutMs: number
  terminateGraceMs: number
  maximumOutputBytes: number
  maximumLineBytes: number
  signal?: AbortSignal
  sensitiveValues?: readonly string[]
  closeStdin?: boolean
  onStdoutLine?: (
    line: string,
    input: {
      writeLine(line: string): void
      end(): void
    }
  ) => void | Promise<void>
}

export class SafeProcessRunner {
  constructor(private readonly spawnChild: SpawnProviderChild = spawn) {}

  async run(request: ProcessRequest): Promise<ProcessResult> {
    if (!path.isAbsolute(request.executable)) {
      throw new Error("Provider executable must be an absolute path")
    }
    await access(request.executable, constants.X_OK)

    return new Promise<ProcessResult>((resolve, reject) => {
      let stdoutBuffer = ""
      let stderr = ""
      const stdoutLines: string[] = []
      let outputBytes = 0
      let failure: ProviderProcessFailure | undefined
      let settled = false
      let forceTimer: NodeJS.Timeout | undefined
      let lineHandling = Promise.resolve()
      let lineHandlingError: unknown

      const child = this.spawnChild(request.executable, request.args, {
        shell: false,
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
        env: scrubProviderEnvironment(request.environment ?? process.env)
      })

      const terminate = (reason: ProviderProcessFailure) => {
        if (failure !== undefined) return
        failure = reason
        if (child.exitCode !== null || child.signalCode !== null) return
        child.kill("SIGTERM")
        forceTimer = setTimeout(() => {
          if (child.exitCode === null && child.signalCode === null) {
            child.kill("SIGKILL")
          }
        }, request.terminateGraceMs)
      }

      const consume = (chunk: Buffer, stream: "stdout" | "stderr") => {
        outputBytes += chunk.byteLength
        if (outputBytes > request.maximumOutputBytes) {
          terminate("output-limit")
          return
        }
        const text = chunk.toString("utf8")
        if (stream === "stderr") {
          stderr += text
          return
        }
        stdoutBuffer += text
        if (Buffer.byteLength(stdoutBuffer) > request.maximumLineBytes) {
          terminate("output-limit")
          return
        }
        const lines = stdoutBuffer.split(/\r?\n/)
        stdoutBuffer = lines.pop() ?? ""
        for (const line of lines.filter((candidate) => candidate.length > 0)) {
          stdoutLines.push(line)
          if (request.onStdoutLine) {
            lineHandling = lineHandling
              .then(() =>
                request.onStdoutLine?.(line, {
                  writeLine(value: string) {
                    if (!child.stdin.destroyed) child.stdin.write(`${value}\n`)
                  },
                  end() {
                    if (!child.stdin.destroyed) child.stdin.end()
                  }
                })
              )
              .catch((error: unknown) => {
                lineHandlingError = error
                terminate("process-failed")
              })
          }
        }
      }

      child.stdout.on("data", (chunk: Buffer) => consume(chunk, "stdout"))
      child.stderr.on("data", (chunk: Buffer) => consume(chunk, "stderr"))
      child.once("error", (error) => {
        if (!settled) {
          settled = true
          clearTimeout(timeout)
          if (forceTimer) clearTimeout(forceTimer)
          reject(error)
        }
      })
      child.once("close", async (exitCode, signal) => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        if (forceTimer) clearTimeout(forceTimer)
        request.signal?.removeEventListener("abort", onAbort)
        if (stdoutBuffer.length > 0) {
          stdoutLines.push(stdoutBuffer)
          if (request.onStdoutLine) {
            lineHandling = lineHandling.then(() =>
              request.onStdoutLine?.(stdoutBuffer, {
                writeLine() {
                  throw new Error("Provider stdin is already closed")
                },
                end() {}
              })
            )
          }
        }
        await lineHandling
        if (lineHandlingError) {
          reject(lineHandlingError)
          return
        }
        if (failure === undefined && exitCode !== 0) failure = "process-failed"
        resolve({
          stdoutLines,
          stderr: sanitizeProviderText(stderr, request.sensitiveValues),
          exitCode,
          signal,
          failure
        })
      })

      const timeout = setTimeout(() => terminate("timeout"), request.timeoutMs)
      const onAbort = () => terminate("cancelled")
      request.signal?.addEventListener("abort", onAbort, { once: true })
      if (request.signal?.aborted) onAbort()

      for (const line of request.stdinLines ?? []) child.stdin.write(`${line}\n`)
      if (request.closeStdin !== false) child.stdin.end()
    })
  }
}
