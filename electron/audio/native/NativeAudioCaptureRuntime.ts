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
import type { NativeAudioFrame } from "./frameProtocol"

const COMMAND_TIMEOUT_MS = 10_000
const FLOAT_BYTES = 4
const DEFAULT_SEGMENT_DURATION_MS = 5_000

interface SourceBuffer {
  id: string
  sampleRate: number
  channels: number
  startedAt: string
  path: "local" | "remote"
  bytes: number
  firstTimestampNanos?: bigint
  lastTimestampNanos?: bigint
  lastSequence?: bigint
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
  stopProcess(): Promise<void>
}

export interface NativeAudioCaptureRuntimeOptions {
  readonly helperExecutable: string
  readonly helperExpectedSha256: string
  readonly temporaryRoot: string
  readonly localTranscriber: AudioTranscriber
  readonly remoteTranscriber?: AudioTranscriber
  readonly helperFactory?: (
    options: NativeAudioHelperOptions
  ) => NativeAudioProcess
  readonly now?: () => Date
  readonly segmentDurationMs?: number
}

export type TranscriptSink = (
  segment: TranscriptSegmentV1
) => Promise<void>

export type AudioStatusSink = (
  status: "speech-detected" | "transcribing" | "ready"
) => Promise<void>

export type AudioFailureSink = (
  source: AudioSource,
  error: AudioCaptureError
) => Promise<void>

export type AudioElapsedSink = (
  source: AudioSource,
  elapsedMs: number
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
  private failureSink?: AudioFailureSink
  private elapsedSink?: AudioElapsedSink
  private readonly buffers = new Map<AudioSource, SourceBuffer>()
  private readonly pending = new Map<AudioSource, PendingCommand>()
  private readonly transcriptionTails = new Map<AudioSource, Promise<void>>()
  private readonly transcriptionControllers = new Set<AbortController>()
  private readonly segmentDurationMs: number
  private generation = 0
  private failed?: AudioCaptureError

  constructor(private readonly options: NativeAudioCaptureRuntimeOptions) {
    for (const target of [
      options.helperExecutable,
      options.temporaryRoot
    ]) {
      if (!path.isAbsolute(target)) {
        throw new Error("Native audio runtime paths must be absolute")
      }
    }
    if (!/^[a-f0-9]{64}$/.test(options.helperExpectedSha256)) {
      throw new Error("Native audio helper checksum is invalid")
    }
    this.store = new EphemeralAudioStore(options.temporaryRoot)
    this.helperFactory =
      options.helperFactory ??
      ((helperOptions) => new NativeAudioHelper(helperOptions))
    this.now = options.now ?? (() => new Date())
    this.segmentDurationMs =
      options.segmentDurationMs ?? DEFAULT_SEGMENT_DURATION_MS
    if (
      !Number.isSafeInteger(this.segmentDurationMs) ||
      this.segmentDurationMs < 1_000 ||
      this.segmentDurationMs > 30_000
    ) {
      throw new Error("Audio segment duration is invalid")
    }
  }

  setTranscriptSink(sink: TranscriptSink): void {
    this.transcriptSink = sink
  }

  setStatusSink(sink: AudioStatusSink): void {
    this.statusSink = sink
  }

  setFailureSink(sink: AudioFailureSink): void {
    this.failureSink = sink
  }

  setElapsedSink(sink: AudioElapsedSink): void {
    this.elapsedSink = sink
  }

  async start(source: AudioSource, path: "local" | "remote"): Promise<void> {
    if (path === "remote" && !this.options.remoteTranscriber) {
      throw new AudioCaptureError(
        "Apple Speech is enabled but its reviewed native adapter is unavailable"
      )
    }
    await this.ensureInitialized()
    if (this.failed && !this.helper) {
      await this.store.cleanupAll()
      this.failed = undefined
    }
    this.throwIfFailed()
    const helper = this.ensureHelper()
    const prior = this.buffers.get(source)
    if (prior) await this.discard(source)
    const buffer = await this.createBuffer(source, path, this.now().toISOString())
    try {
      await this.awaitCommand(source, "started", () => {
        helper.send({ type: "start", source })
      })
      if (buffer.sampleRate === 0 || buffer.channels === 0) {
        throw new AudioCaptureError(
          `Native audio helper did not publish the ${source} format`
        )
      }
    } catch (error) {
      if (this.buffers.get(source) === buffer) await this.discard(source)
      throw error
    }
  }

  async pause(source: AudioSource): Promise<void> {
    const helper = this.helper
    if (!helper) return
    await this.awaitCommand(source, "paused", () => {
      helper.send({ type: "pause", source })
    })
    await this.flush(source, true)
  }

  async stop(source: AudioSource): Promise<void> {
    const helper = this.helper
    if (!helper) return
    await this.awaitCommand(source, "stopped", () => {
      helper.send({ type: "stop", source })
    })
    await this.flush(source, true)
  }

  async cleanup(reason: AudioCleanupReason): Promise<void> {
    void reason
    this.generation += 1
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout)
      pending.reject(new Error("Audio command was cancelled by cleanup"))
    }
    this.pending.clear()
    for (const controller of this.transcriptionControllers) controller.abort()
    const helper = this.helper
    this.helper = undefined
    if (helper) await helper.stopProcess().catch(() => undefined)
    for (const source of [...this.buffers.keys()]) {
      await this.discard(source)
    }
    await Promise.allSettled([...this.transcriptionTails.values()])
    this.transcriptionTails.clear()
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
      expectedSha256: this.options.helperExpectedSha256,
      onEvent: (event) => {
        void this.onEvent(event).catch((error) => {
          this.onFailure(
            error instanceof Error ? error.message : "Audio event failed"
          )
        })
      },
      onFrame: (frame) => this.onFrame(frame),
      onFailure: (message) => this.onFailure(message)
    })
    helper.startProcess()
    this.helper = helper
    return helper
  }

  private async onEvent(event: AudioHelperEvent): Promise<void> {
    if (event.type === "started") {
      const current = this.buffers.get(event.source)
      if (!current) {
        throw new AudioCaptureError(
          `Native audio helper started ${event.source} without an armed buffer`
        )
      }
      current.sampleRate = event.sampleRate
      current.channels = event.channels
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
      await this.failSource(event.source, error)
    }
  }

  private async onFrame(frame: NativeAudioFrame): Promise<void> {
    const source: NativeAudioSource = frame.source
    const bytes = frame.bytes
    const buffer = this.buffers.get(source)
    if (!buffer || buffer.sampleRate === 0 || buffer.channels === 0) {
      bytes.fill(0)
      throw new Error("Audio frame arrived before a started event")
    }
    if (
      (buffer.lastSequence !== undefined &&
        frame.sequence !== buffer.lastSequence + 1n) ||
      (buffer.lastTimestampNanos !== undefined &&
        frame.timestampNanos <= buffer.lastTimestampNanos)
    ) {
      bytes.fill(0)
      throw new Error("Audio frame sequence or timestamp is invalid")
    }
    buffer.firstTimestampNanos ??= frame.timestampNanos
    buffer.lastTimestampNanos = frame.timestampNanos
    buffer.lastSequence = frame.sequence
    const bytesLength = bytes.length
    await this.statusSink?.("speech-detected")
    await this.store.append(buffer.id, bytes)
    buffer.bytes += bytesLength
    const elapsedMs = Number(
      (frame.timestampNanos - buffer.firstTimestampNanos) / 1_000_000n
    )
    await this.elapsedSink?.(source, elapsedMs)
    const segmentBytes =
      buffer.sampleRate *
      buffer.channels *
      FLOAT_BYTES *
      (this.segmentDurationMs / 1_000)
    if (buffer.bytes >= segmentBytes) {
      const startedAt = this.timestampIso(buffer, frame.timestampNanos)
      const replacement = await this.createBuffer(
        source,
        buffer.path,
        startedAt
      )
      replacement.sampleRate = buffer.sampleRate
      replacement.channels = buffer.channels
      this.buffers.set(source, replacement)
      void this.enqueueTranscription(source, buffer, true).catch((error) => {
        void this.failSource(
          source,
          error instanceof AudioCaptureError
            ? error
            : new AudioCaptureError(
                error instanceof Error
                  ? error.message
                  : "Audio transcription failed"
              )
        )
      })
    }
  }

  private async flush(
    source: AudioSource,
    emitPartial: boolean
  ): Promise<void> {
    const buffer = this.buffers.get(source)
    if (!buffer) return
    this.buffers.delete(source)
    await this.enqueueTranscription(source, buffer, emitPartial)
  }

  private enqueueTranscription(
    source: AudioSource,
    buffer: SourceBuffer,
    emitPartial: boolean
  ): Promise<void> {
    const generation = this.generation
    const prior =
      this.transcriptionTails.get(source) ?? Promise.resolve()
    const current = prior
      .catch(() => undefined)
      .then(async () => {
        if (generation !== this.generation) {
          await this.store.remove(buffer.id)
          return
        }
        await this.transcribeBuffer(source, buffer, emitPartial, generation)
      })
    this.transcriptionTails.set(source, current)
    const clear = () => {
      if (this.transcriptionTails.get(source) === current) {
        this.transcriptionTails.delete(source)
      }
    }
    void current.then(clear, clear)
    return current
  }

  private async transcribeBuffer(
    source: AudioSource,
    buffer: SourceBuffer,
    emitPartial: boolean,
    generation: number
  ): Promise<void> {
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
      const controller = new AbortController()
      this.transcriptionControllers.add(controller)
      let text: string
      try {
        text = await transcriber.transcribe(
          descriptor.path,
          controller.signal
        )
      } finally {
        this.transcriptionControllers.delete(controller)
      }
      if (generation !== this.generation) return
      const segmentId = randomUUID()
      const finalizedAt =
        buffer.lastTimestampNanos === undefined
          ? this.now().toISOString()
          : this.timestampIso(buffer, buffer.lastTimestampNanos)
      const base = {
        schemaVersion: 1,
        id: segmentId,
        source,
        text,
        startedAt: buffer.startedAt,
        speaker: defaultSpeaker(source)
      } as const
      if (emitPartial) {
        await this.transcriptSink?.({
          ...base,
          state: "partial",
          revision: 1
        })
      }
      await this.transcriptSink?.({
        ...base,
        state: "final",
        finalizedAt,
        revision: emitPartial ? 2 : 1
      })
      await this.statusSink?.("ready")
    } finally {
      await this.store.remove(buffer.id)
    }
  }

  private async createBuffer(
    source: AudioSource,
    selectedPath: "local" | "remote",
    startedAt: string
  ): Promise<SourceBuffer> {
    const buffer: SourceBuffer = {
      id: await this.store.create(source),
      sampleRate: 0,
      channels: 0,
      startedAt,
      path: selectedPath,
      bytes: 0
    }
    this.buffers.set(source, buffer)
    return buffer
  }

  private timestampIso(buffer: SourceBuffer, timestampNanos: bigint): string {
    const first = buffer.firstTimestampNanos
    if (first === undefined || timestampNanos < first) return buffer.startedAt
    const offsetMs = Number((timestampNanos - first) / 1_000_000n)
    const startedMs = Date.parse(buffer.startedAt)
    return new Date(startedMs + offsetMs).toISOString()
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
    const helper = this.helper
    this.helper = undefined
    if (helper) void helper.stopProcess().catch(() => undefined)
    for (const source of [...this.buffers.keys()]) {
      void this.failSource(source, this.failed)
    }
  }

  private async failSource(
    source: AudioSource,
    error: AudioCaptureError
  ): Promise<void> {
    await this.discard(source)
    await this.failureSink?.(source, error)
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
