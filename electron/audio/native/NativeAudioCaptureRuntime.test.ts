import { mkdtemp, readFile, readdir, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { describe, expect, it } from "vitest"
import type { NativeAudioHelperOptions } from "./NativeAudioHelper"
import {
  NativeAudioCaptureRuntime,
  type AudioTranscriber,
  type NativeAudioProcess
} from "./NativeAudioCaptureRuntime"
import type { TranscriptSegmentV1 } from "../../../src/shared/audio"

class FixtureAudioProcess implements NativeAudioProcess {
  readonly commands: Array<Parameters<NativeAudioProcess["send"]>[0]> = []
  private readonly sequences = new Map<"microphone" | "system", bigint>()
  private readonly timestamps = new Map<"microphone" | "system", bigint>()

  constructor(private readonly options: NativeAudioHelperOptions) {}

  startProcess(): void {
    this.options.onEvent({ protocolVersion: 1, type: "ready" })
  }

  send(command: Parameters<NativeAudioProcess["send"]>[0]): void {
    this.commands.push(command)
    if (command.type === "start") {
      this.options.onEvent({
        protocolVersion: 1,
        type: "started",
        source: command.source,
        sampleRate: 16_000,
        channels: 1,
        sampleFormat: "f32le"
      })
    } else if (command.type === "pause" || command.type === "stop") {
      this.options.onEvent({
        protocolVersion: 1,
        type: command.type === "pause" ? "paused" : "stopped",
        source: command.source
      })
    } else {
      this.options.onEvent({
        protocolVersion: 1,
        type: "shutdown-complete"
      })
    }
  }

  async stopProcess(): Promise<void> {
    this.send({ type: "shutdown" })
  }

  async frame(
    source: "microphone" | "system",
    seconds = 1
  ): Promise<void> {
    const samples = Buffer.alloc(16_000 * 4 * seconds)
    samples.writeFloatLE(0.25, 0)
    const sequence = (this.sequences.get(source) ?? 0n) + 1n
    const timestampNanos =
      (this.timestamps.get(source) ?? 0n) +
      BigInt(seconds) * 1_000_000_000n
    this.sequences.set(source, sequence)
    this.timestamps.set(source, timestampNanos)
    await this.options.onFrame({
      source,
      sequence,
      timestampNanos,
      bytes: samples
    })
  }

  fail(message = "fixture helper crashed"): void {
    this.options.onFailure(message)
  }
}

async function withRuntime(
  run: (
    runtime: NativeAudioCaptureRuntime,
    process: () => FixtureAudioProcess | undefined,
    root: string,
    transcripts: TranscriptSegmentV1[]
  ) => Promise<void>,
  options: {
    readonly segmentDurationMs?: number
    readonly localTranscriber?: AudioTranscriber
  } = {}
): Promise<void> {
  const root = await mkdtemp(path.join(os.tmpdir(), "ic-audio-runtime-"))
  let fixtureProcess: FixtureAudioProcess | undefined
  const transcripts: TranscriptSegmentV1[] = []
  const runtime = new NativeAudioCaptureRuntime({
    helperExecutable: "/tmp/interviewcopilot-fixture-audio-helper",
    helperExpectedSha256:
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    temporaryRoot: root,
    helperFactory: (options) => {
      fixtureProcess = new FixtureAudioProcess(options)
      return fixtureProcess
    },
    segmentDurationMs: options.segmentDurationMs,
    localTranscriber: options.localTranscriber ?? {
      async transcribe(waveFile) {
        const wave = await readFile(waveFile)
        expect(wave.subarray(0, 4).toString("ascii")).toBe("RIFF")
        expect(wave.subarray(8, 12).toString("ascii")).toBe("WAVE")
        return "How would you partition this queue?"
      }
    }
  })
  runtime.setTranscriptSink(async (segment) => {
    transcripts.push(segment)
  })
  try {
    await run(runtime, () => fixtureProcess, root, transcripts)
  } finally {
    await runtime.cleanup("shutdown")
    await rm(root, { recursive: true, force: true })
  }
}

describe("native audio capture runtime", () => {
  it("never creates the helper or opens capture before explicit activation", async () => {
    await withRuntime(async (runtime, fixtureProcess) => {
      expect(fixtureProcess()).toBeUndefined()
      await runtime.cleanup("startup")
      expect(fixtureProcess()).toBeUndefined()
    })
  })

  it("preserves source provenance and removes raw bytes after finalization", async () => {
    await withRuntime(async (runtime, fixtureProcess, root, transcripts) => {
      await runtime.start("system", "local")
      await fixtureProcess()?.frame("system")
      await runtime.pause("system")

      expect(transcripts.map(({ state, revision, text }) => ({
        state,
        revision,
        text
      }))).toEqual([
        {
          state: "partial",
          revision: 1,
          text: "How would you partition this queue?"
        },
        {
          state: "final",
          revision: 2,
          text: "How would you partition this queue?"
        }
      ])
      expect(transcripts[0]?.startedAt).toBe(transcripts[1]?.startedAt)
      expect(transcripts[1]?.finalizedAt).toBeDefined()
      expect(fixtureProcess()?.commands).toEqual([
        { type: "start", source: "system" },
        { type: "pause", source: "system" }
      ])
      expect(await readdir(root)).toEqual([])
    })
  })

  it("fails closed before capture when Remote lacks the Apple adapter", async () => {
    await withRuntime(async (runtime, fixtureProcess) => {
      await expect(runtime.start("microphone", "remote")).rejects.toThrow(
        "Apple Speech"
      )
      expect(fixtureProcess()).toBeUndefined()
    })
  })

  it("rolls bounded segments while capture remains active", async () => {
    await withRuntime(
      async (runtime, fixtureProcess, root, transcripts) => {
        const elapsed: number[] = []
        runtime.setElapsedSink(async (_source, elapsedMs) => {
          elapsed.push(elapsedMs)
        })
        await runtime.start("microphone", "local")
        await fixtureProcess()?.frame("microphone")
        await fixtureProcess()?.frame("microphone")
        await runtime.pause("microphone")

        expect(transcripts.map((segment) => segment.state)).toEqual([
          "partial",
          "final",
          "partial",
          "final"
        ])
        expect(transcripts.every((segment) => segment.source === "microphone"))
          .toBe(true)
        expect(elapsed).toEqual([1_000, 2_000])
        expect(Date.parse(transcripts[2]!.startedAt)).toBeGreaterThan(
          Date.parse(transcripts[0]!.startedAt)
        )
        expect(await readdir(root)).toEqual([])
      },
      { segmentDurationMs: 1_000 }
    )
  })

  it("aborts and reaps in-flight transcription during cleanup", async () => {
    let transcriptionStarted: (() => void) | undefined
    const started = new Promise<void>((resolve) => {
      transcriptionStarted = resolve
    })
    await withRuntime(
      async (runtime, fixtureProcess, root) => {
        await runtime.start("system", "local")
        await fixtureProcess()?.frame("system")
        const pause = runtime.pause("system")
        const pauseResult = expect(pause).rejects.toThrow("cancelled")
        await started
        await runtime.cleanup("reset")
        await pauseResult
        expect(await readdir(root)).toEqual([])
      },
      {
        localTranscriber: {
          transcribe(_waveFile, signal) {
            transcriptionStarted?.()
            return new Promise<string>((_resolve, reject) => {
              signal?.addEventListener(
                "abort",
                () => reject(new Error("Local transcription was cancelled")),
                { once: true }
              )
            })
          }
        }
      }
    )
  })

  it("reports a live helper failure and removes the active buffer", async () => {
    await withRuntime(async (runtime, fixtureProcess, root) => {
      const failures: string[] = []
      let observeFailure: (() => void) | undefined
      const failureObserved = new Promise<void>((resolve) => {
        observeFailure = resolve
      })
      runtime.setFailureSink(async (source, error) => {
        failures.push(`${source}:${error.message}`)
        observeFailure?.()
      })
      await runtime.start("system", "local")
      await fixtureProcess()?.frame("system")
      fixtureProcess()?.fail()
      await failureObserved

      expect(failures).toEqual(["system:fixture helper crashed"])
      expect(await readdir(root)).toEqual([])
    })
  })
})
