import { mkdtemp, readFile, readdir, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { describe, expect, it } from "vitest"
import type { NativeAudioHelperOptions } from "./NativeAudioHelper"
import {
  NativeAudioCaptureRuntime,
  type NativeAudioProcess
} from "./NativeAudioCaptureRuntime"

class FixtureAudioProcess implements NativeAudioProcess {
  readonly commands: Array<Parameters<NativeAudioProcess["send"]>[0]> = []

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

  stopProcess(): void {
    this.send({ type: "shutdown" })
  }

  async frame(source: "microphone" | "system"): Promise<void> {
    const samples = Buffer.alloc(16_000 * 4)
    samples.writeFloatLE(0.25, 0)
    await this.options.onFrame({
      source,
      sequence: 1n,
      timestampNanos: 1_000_000n,
      bytes: samples
    })
  }
}

async function withRuntime(
  run: (
    runtime: NativeAudioCaptureRuntime,
    process: () => FixtureAudioProcess | undefined,
    root: string,
    transcripts: string[]
  ) => Promise<void>
): Promise<void> {
  const root = await mkdtemp(path.join(os.tmpdir(), "ic-audio-runtime-"))
  let fixtureProcess: FixtureAudioProcess | undefined
  const transcripts: string[] = []
  const runtime = new NativeAudioCaptureRuntime({
    helperExecutable: "/tmp/interviewcopilot-fixture-audio-helper",
    temporaryRoot: root,
    helperFactory: (options) => {
      fixtureProcess = new FixtureAudioProcess(options)
      return fixtureProcess
    },
    localTranscriber: {
      async transcribe(waveFile) {
        const wave = await readFile(waveFile)
        expect(wave.subarray(0, 4).toString("ascii")).toBe("RIFF")
        expect(wave.subarray(8, 12).toString("ascii")).toBe("WAVE")
        return "How would you partition this queue?"
      }
    }
  })
  runtime.setTranscriptSink(async (segment) => {
    transcripts.push(segment.text)
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

      expect(transcripts).toEqual(["How would you partition this queue?"])
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
})
