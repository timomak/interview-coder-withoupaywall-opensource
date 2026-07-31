import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import { createHash } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import readline from "node:readline"
import { NativeAudioFrameDecoder, type NativeAudioFrame } from "./frameProtocol"
import {
  AUDIO_HELPER_PROTOCOL_VERSION,
  encodeAudioHelperCommand,
  parseAudioHelperEvent,
  type AudioHelperCommand,
  type AudioHelperEvent
} from "./protocol"

const SHUTDOWN_TIMEOUT_MS = 5_000

export type AudioHelperCommandInput = AudioHelperCommand extends infer Command
  ? Command extends AudioHelperCommand
    ? Omit<Command, "protocolVersion">
    : never
  : never

export interface NativeAudioHelperOptions {
  readonly executable: string
  readonly expectedSha256: string
  readonly onEvent: (event: AudioHelperEvent) => void
  readonly onFrame: (frame: NativeAudioFrame) => Promise<void> | void
  readonly onFailure: (message: string) => void
}

export class NativeAudioHelper {
  private child?: ChildProcessWithoutNullStreams
  private readonly decoder = new NativeAudioFrameDecoder()
  private frameTail: Promise<void> = Promise.resolve()
  private shutdownRequested = false
  private shutdownCompleted = false
  private failureReported = false
  private closePromise: Promise<void> = Promise.resolve()
  private resolveClose: (() => void) | undefined

  constructor(private readonly options: NativeAudioHelperOptions) {}

  startProcess(): void {
    if (this.child) throw new Error("Native audio helper is already running")
    if (!path.isAbsolute(this.options.executable)) {
      throw new Error("Native audio helper path must be absolute")
    }
    const metadata = fs.lstatSync(this.options.executable)
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
      throw new Error("Native audio helper must be a regular file")
    }
    if (
      !/^[a-f0-9]{64}$/.test(this.options.expectedSha256) ||
      createHash("sha256")
        .update(fs.readFileSync(this.options.executable))
        .digest("hex") !== this.options.expectedSha256
    ) {
      throw new Error("Native audio helper failed checksum verification")
    }
    const child = spawn(this.options.executable, [], {
      shell: false,
      stdio: ["pipe", "pipe", "pipe", "pipe"],
      env: {
        PATH: "/usr/bin:/bin",
        INTERVIEWCOPILOT_AUDIO_FRAME_FD: "3"
      }
    })
    this.child = child as ChildProcessWithoutNullStreams
    this.shutdownRequested = false
    this.shutdownCompleted = false
    this.failureReported = false
    this.frameTail = Promise.resolve()
    this.closePromise = new Promise<void>((resolve) => {
      this.resolveClose = resolve
    })
    const lines = readline.createInterface({ input: child.stdout })
    lines.on("line", (line) => {
      try {
        const event = parseAudioHelperEvent(line)
        if (event.type === "shutdown-complete") this.shutdownCompleted = true
        this.options.onEvent(event)
      } catch {
        this.failClosed("Native audio helper emitted an invalid event")
      }
    })
    const framePipe = child.stdio[3]
    if (!framePipe || typeof framePipe === "string" || !("on" in framePipe)) {
      this.failClosed("Native audio helper frame pipe is unavailable")
      return
    }
    framePipe.on("data", (chunk: Buffer) => {
      try {
        for (const frame of this.decoder.push(chunk)) {
          this.frameTail = this.frameTail.then(async () => {
            try {
              await this.options.onFrame(frame)
            } catch {
              this.failClosed("Native audio frame consumer failed")
            } finally {
              frame.bytes.fill(0)
            }
          })
        }
      } catch {
        this.failClosed("Native audio helper emitted an invalid frame")
      }
    })
    framePipe.on("error", () => {
      this.failClosed("Native audio helper frame pipe failed")
    })
    child.stdin.on("error", () => {
      this.failClosed("Native audio helper command pipe failed")
    })
    child.stdout.on("error", () => {
      this.failClosed("Native audio helper event pipe failed")
    })
    child.stderr.on("data", () => {
      // stderr can contain framework diagnostics. Never relay it because native
      // components may include device or audio-derived information.
    })
    child.stderr.on("error", () => {
      this.failClosed("Native audio helper diagnostic pipe failed")
    })
    child.once("error", () => {
      this.failClosed("Native audio helper failed to launch")
    })
    child.once("close", (code, signal) => {
      void this.frameTail.finally(() => {
        this.child = undefined
        this.decoder.clear()
        if (code !== 0 && signal === null) {
          this.reportFailure(`Native audio helper exited with code ${code}`)
        } else if (signal !== null) {
          this.reportFailure("Native audio helper terminated unexpectedly")
        } else if (!this.shutdownRequested || !this.shutdownCompleted) {
          this.reportFailure(
            "Native audio helper exited before shutdown completed"
          )
        }
        this.resolveClose?.()
        this.resolveClose = undefined
      })
    })
  }

  send(command: AudioHelperCommandInput): void {
    const child = this.child
    if (!child || child.stdin.destroyed || this.failureReported) {
      throw new Error("Native audio helper is unavailable")
    }
    child.stdin.write(
      encodeAudioHelperCommand({
        ...command,
        protocolVersion: AUDIO_HELPER_PROTOCOL_VERSION
      } as AudioHelperCommand)
    )
  }

  async stopProcess(): Promise<void> {
    const child = this.child
    if (!child) return
    this.shutdownRequested = true
    try {
      this.send({ type: "shutdown" })
    } finally {
      child.stdin.end()
    }
    let timeout: ReturnType<typeof setTimeout> | undefined
    await Promise.race([
      this.closePromise,
      new Promise<void>((resolve) => {
        timeout = setTimeout(() => {
          child.kill("SIGKILL")
          resolve()
        }, SHUTDOWN_TIMEOUT_MS)
      })
    ])
    if (timeout) clearTimeout(timeout)
    await this.closePromise
  }

  private failClosed(message: string): void {
    const child = this.child
    this.decoder.clear()
    child?.kill("SIGTERM")
    this.reportFailure(message)
  }

  private reportFailure(message: string): void {
    if (this.failureReported) return
    this.failureReported = true
    this.options.onFailure(message)
  }
}
