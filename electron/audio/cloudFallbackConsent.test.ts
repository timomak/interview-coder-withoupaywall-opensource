import { mkdtemp, readdir, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { expect, it } from "vitest"
import { MemoryRecordRepository } from "../orchestrator/testSupport"
import type { NativeAudioHelperOptions } from "./native/NativeAudioHelper"
import {
  NativeAudioCaptureRuntime,
  type NativeAudioProcess
} from "./native/NativeAudioCaptureRuntime"
import {
  AudioPreferencesRepository,
  type M07AudioPreferencesRecord
} from "./session/AudioPreferencesRepository"

it("requires explicit Apple transcription consent", async () => {
  const repository = new AudioPreferencesRepository(
    new MemoryRecordRepository<M07AudioPreferencesRecord>()
  )

  expect(await repository.load()).toMatchObject({
    appleSpeechEnabled: false,
    sourceDefaults: { microphone: false, system: false }
  })

  expect(
    await repository.save({
      schemaVersion: 1,
      appleSpeechEnabled: true,
      sourceDefaults: { microphone: false, system: false },
      transcriptRetention: true
    })
  ).toMatchObject({
    appleSpeechEnabled: true,
    sourceDefaults: { microphone: false, system: false }
  })
})

it("runs the reviewed Apple Speech path only after remote selection", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ic-apple-consent-"))
  let helperOptions: NativeAudioHelperOptions | undefined
  let localCalls = 0
  let remoteCalls = 0
  class FixtureProcess implements NativeAudioProcess {
    startProcess(): void {}

    send(command: Parameters<NativeAudioProcess["send"]>[0]): void {
      if (command.type === "start") {
        helperOptions?.onEvent({
          protocolVersion: 1,
          type: "started",
          source: command.source,
          sampleRate: 16_000,
          channels: 1,
          sampleFormat: "f32le"
        })
      } else if (command.type === "pause") {
        helperOptions?.onEvent({
          protocolVersion: 1,
          type: "paused",
          source: command.source
        })
      }
    }

    async stopProcess(): Promise<void> {}
  }
  const runtime = new NativeAudioCaptureRuntime({
    helperExecutable: "/tmp/reviewed-audio-helper",
    helperExpectedSha256:
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    temporaryRoot: root,
    helperFactory: (options) => {
      helperOptions = options
      return new FixtureProcess()
    },
    localTranscriber: {
      async transcribe() {
        localCalls += 1
        return "local"
      }
    },
    remoteTranscriber: {
      async transcribe() {
        remoteCalls += 1
        return "How would you partition this queue?"
      }
    }
  })
  const observed: string[] = []
  runtime.setTranscriptSink(async (segment) => {
    if (segment.state === "final") observed.push(segment.text)
  })

  try {
    expect(remoteCalls).toBe(0)
    await runtime.start("system", "remote")
    await helperOptions?.onFrame({
      source: "system",
      sequence: 1n,
      timestampNanos: 1_000_000_000n,
      bytes: Buffer.alloc(16_000 * 4)
    })
    await runtime.pause("system")

    expect({ localCalls, remoteCalls, observed }).toEqual({
      localCalls: 0,
      remoteCalls: 1,
      observed: ["How would you partition this queue?"]
    })
    expect(await readdir(root)).toEqual([])
  } finally {
    await runtime.cleanup("shutdown")
    await rm(root, { recursive: true, force: true })
  }
})
