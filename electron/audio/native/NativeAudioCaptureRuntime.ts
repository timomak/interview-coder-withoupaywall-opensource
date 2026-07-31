import { randomUUID } from "node:crypto"
import { open, readFile } from "node:fs/promises"
import path from "node:path"
import {
  defaultSpeaker,
  type AudioSource,
  type TranscriptSegmentV1
} from "../../../src/shared/audio"
import {
  AudioCaptureError,
  type AudioCaptureRuntime,
  type AudioCleanupReason
} from "../session/AudioSessionController"
import { EphemeralAudioStore } from "../temporary/EphemeralAudioStore"
import {
  NativeAudioHelper,
  type NativeAudioHelperOptions
} from "./NativeAudioHelper"
import type {
  AudioHelperEvent,
  AudioSource as NativeAudioSource
} from "./protocol"

const COMMAND_TIMEOUT_MS = 10_000
const FLOAT_BYTES = 4

interface SourceBuffer {
  id: string
  sampleRate: number
  channels: number
  startedAt: string
  path: "local" | "remote"
}

interface PendingCommand {
  readonly expected: "started" | "paused" | "stopped"
  readonly resolve: () => void
  readonly reject: (error: Error) => void
  readonly timeout: ReturnType<typeof setTimeout>
}

export interface AudioTranscriber {
  transcribe(waveFile: string, signal?: AbortSignal): Promise<string>
}

export interface NativeAudioProcess {
  startProcess(): void
  send(command: Parameters<NativeAudioHelper["send"]>[0]): void
  stopProcess(): void
}

export interface NativeAudioCaptureRuntimeOptions {
  readonly helperExecutable: string
  readonly temporaryRoot: string
  readonly localTranscriber: AudioTranscriber
  readonly remoteTranscriber?: AudioTranscriber
  readonly helperFactory?: (
    options: NativeAudioHelperOptions
  ) => NativeAudioProcess
  readonly now?: () => Date
}

export type TranscriptSink = (
  segment: TranscriptSegmentV1
) => Promise<void>

export type AudioStatusSink = (
  status: "speech-detected" | "transcribing" | "ready"
) => Promise<void>

export class NativeAudioCaptureRuntime implements AudioCaptureRuntime {
  private readonly store: EphemeralAudioStore
  private readonly helperFactory: NonNullable<
    NativeAudioCaptureRuntimeOptions["helperFactory"]
  >
  private readonly now: () => Date
  private helper?: NativeAudioProcess
  private initialized?: Promise<void>
  private transcriptSink?: TranscriptSink
  private statusSink?: AudioStatusSink
  private readonly buffers = new Map<AudioSource, SourceBuffer>()
  private readonly pending = new Map<AudioSource, PendingCommand>()
  private failed?: Error

  constructor(private readonly options: NativeAudioCaptureRuntimeOptions) {
    for (const target of [
      options.helperExecutable,
      options.temporaryRoot
    ]) {
      if (!path.isAbsolute(target)) {
        throw new Error("Native audio runtime paths must be absolute")
      }
    }
    this.store = new EphemeralAudioStore(options.temporaryRoot)
    this.helperFactory =
      options.helperFactory ??
      ((helperOptions) => new NativeAudioHelper(helperOptions))
    this.now = options.now ?? (() => new Date())
  }

  setTranscriptSink(sink: TranscriptSink): void {
    this.transcriptSink = sink
  }

  setStatusSink(sink: AudioStatusSink): void {
    this.statusSink = sink
  }

  async start(source: AudioSource, path: "local" | "remote"): Promise<void> {
    if (path === "remote" && !this.options.remoteTranscriber) {
      throw new AudioCaptureError(
        "Apple Speech is enabled but its reviewed native adapter is unavailable"
      )
    }
    await this.ensureInitialized()
    this.throwIfFailed()
    const helper = this.ensureHelper()
    await this.awaitCommand(source, "started", () => {
      helper.send({ type: "start", source })
    })
    const existing = this.buffers.get(source)
    if (!existing) {
      throw new AudioCaptureError(
        `Native audio helper did not publish the ${source} format`
      )
    }
    existing.path = path
  }

  async pause(source: AudioSource): Promise<void> {
    const helper = this.helper
    if (!helper) return
    await this.awaitCommand(source, "paused", () => {
      helper.send({ type: "pause", source })
    })
    await this.flush(source)
  }

  async stop(source: AudioSource): Promise<void> {
    const helper = this.helper
    if (!helper) return
    await this.awaitCommand(source, "stopped", () => {
      helper.send({ type: "stop", source })
    })
    await this.flush(source)
  }

  async cleanup(reason: AudioCleanupReason): Promise<void> {
    void reason
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout)
      pending.reject(new Error("Audio command was cancelled by cleanup"))
    }
    this.pending.clear()
    for (const source of [...this.buffers.keys()]) {
      await this.discard(source)
    }
    this.helper?.stopProcess()
    this.helper = undefined
    await this.ensureInitialized()
    await this.store.cleanupAll()
    this.failed = undefined
  }

  private async ensureInitialized(): Promise<void> {
    this.initialized ??= this.store.initialize()
    await this.initialized
  }

  private ensureHelper(): NativeAudioProcess {
    if (this.helper) return this.helper
    const helper = this.helperFactory({
      executable: this.options.helperExecutable,
      onEvent: (event) => {
        void this.onEvent(event).catch((error) => {
          this.onFailure(
            error instanceof Error ? error.message : "Audio event failed"
          )
        })
      },
      onFrame: (frame) => this.onFrame(frame.source, frame.bytes),
      onFailure: (message) => this.onFailure(message)
    })
    helper.startProcess()
    this.helper = helper
    return helper
  }

  private async onEvent(event: AudioHelperEvent): Promise<void> {
    if (event.type === "started") {
      const current = this.buffers.get(event.source)
      if (current) await this.store.remove(current.id)
      this.buffers.set(event.source, {
        id: await this.store.create(event.source),
        sampleRate: event.sampleRate,
        channels: event.channels,
        startedAt: this.now().toISOString(),
        path: "local"
      })
      this.settle(event.source, "started")
      return
    }
    if (event.type === "paused" || event.type === "stopped") {
      this.settle(event.source, event.type)
      return
    }
    if (event.type === "permission-denied" || event.type === "error") {
      const error = new AudioCaptureError(
        `${event.source} capture failed (${event.code})`,
        event.type === "permission-denied" ? "denied" : "unknown"
      )
      this.reject(event.source, error)
    }
  }

  private async onFrame(
    source: NativeAudioSource,
    bytes: Buffer
  ): Promise<void> {
    const buffer = this.buffers.get(source)
    if (!buffer) {
      bytes.fill(0)
      throw new Error("Audio frame arrived before a started event")
    }
    await this.statusSink?.("speech-detected")
    await this.store.append(buffer.id, bytes)
  }

  private async flush(source: AudioSource): Promise<void> {
    const buffer = this.buffers.get(source)
    if (!buffer) return
    this.buffers.delete(source)
    let descriptor:
      | Awaited<ReturnType<EphemeralAudioStore["finalize"]>>
      | undefined
    try {
      descriptor = await this.store.finalize(buffer.id)
      if (descriptor.bytes === 0) {
        await this.store.remove(buffer.id)
        return
      }
      const raw = await readFile(descriptor.path)
      const wave = encodeFloatWave(raw, buffer.sampleRate, buffer.channels)
      raw.fill(0)
      const handle = await open(descriptor.path, "w", 0o600)
      try {
        await handle.writeFile(wave)
        await handle.sync()
        await handle.chmod(0o600)
      } finally {
        wave.fill(0)
        await handle.close()
      }
      await this.statusSink?.("transcribing")
      const transcriber =
        buffer.path === "remote"
          ? this.options.remoteTranscriber
          : this.options.localTranscriber
      if (!transcriber) {
        throw new Error("Selected transcription adapter is unavailable")
      }
      const text = await transcriber.transcribe(descriptor.path)
      const finalizedAt = this.now().toISOString()
      await this.transcriptSink?.({
        schemaVersion: 1,
        id: randomUUID(),
        source,
        state: "final",
        text,
        startedAt: buffer.startedAt,
        finalizedAt,
        revision: 1,
        speaker: defaultSpeaker(source)
      })
      await this.statusSink?.("ready")
    } finally {
      await this.store.remove(buffer.id)
    }
  }

  private async discard(source: AudioSource): Promise<void> {
    const buffer = this.buffers.get(source)
    if (!buffer) return
    this.buffers.delete(source)
    await this.store.remove(buffer.id)
  }

  private awaitCommand(
    source: AudioSource,
    expected: PendingCommand["expected"],
    send: () => void
  ): Promise<void> {
    if (this.pending.has(source)) {
      return Promise.reject(
        new Error(`${source} already has an audio command in flight`)
      )
    }
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(source)
        reject(new AudioCaptureError(`${source} audio command timed out`))
      }, COMMAND_TIMEOUT_MS)
      this.pending.set(source, { expected, resolve, reject, timeout })
      try {
        send()
      } catch (error) {
        clearTimeout(timeout)
        this.pending.delete(source)
        reject(
          error instanceof Error ? error : new Error("Audio command failed")
        )
      }
    })
  }

  private settle(
    source: AudioSource,
    observed: PendingCommand["expected"]
  ): void {
    const pending = this.pending.get(source)
    if (!pending) return
    if (pending.expected !== observed) {
      this.reject(
        source,
        new AudioCaptureError(
          `${source} audio helper returned ${observed} while awaiting ${pending.expected}`
        )
      )
      return
    }
    clearTimeout(pending.timeout)
    this.pending.delete(source)
    pending.resolve()
  }

  private reject(source: AudioSource, error: Error): void {
    const pending = this.pending.get(source)
    if (!pending) return
    clearTimeout(pending.timeout)
    this.pending.delete(source)
    pending.reject(error)
  }

  private onFailure(message: string): void {
    this.failed = new AudioCaptureError(message)
    for (const source of [...this.pending.keys()]) {
      this.reject(source, this.failed)
    }
  }

  private throwIfFailed(): void {
    if (this.failed) throw this.failed
  }
}

export function encodeFloatWave(
  samples: Buffer,
  sampleRate: number,
  channels: number
): Buffer {
  if (
    samples.length === 0 ||
    samples.length % (FLOAT_BYTES * channels) !== 0 ||
    !Number.isSafeInteger(sampleRate) ||
    sampleRate < 8_000 ||
    sampleRate > 192_000 ||
    !Number.isSafeInteger(channels) ||
    channels < 1 ||
    channels > 8
  ) {
    throw new Error("PCM input cannot be represented as a bounded WAV file")
  }
  const header = Buffer.alloc(44)
  header.write("RIFF", 0, "ascii")
  header.writeUInt32LE(36 + samples.length, 4)
  header.write("WAVE", 8, "ascii")
  header.write("fmt ", 12, "ascii")
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(3, 20)
  header.writeUInt16LE(channels, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(sampleRate * channels * FLOAT_BYTES, 28)
  header.writeUInt16LE(channels * FLOAT_BYTES, 32)
  header.writeUInt16LE(32, 34)
  header.write("data", 36, "ascii")
  header.writeUInt32LE(samples.length, 40)
  return Buffer.concat([header, samples])
}
