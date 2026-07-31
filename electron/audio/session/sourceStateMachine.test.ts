import { describe, expect, it } from "vitest"
import {
  createTestOrchestrator,
  MemoryRecordRepository,
  TEST_SNAPSHOT
} from "../../orchestrator/testSupport"
import {
  AudioCaptureError,
  AudioSessionController,
  type AudioCaptureRuntime,
  type AudioCleanupReason
} from "./AudioSessionController"
import {
  AudioPreferencesRepository,
  type M07AudioPreferencesRecord
} from "./AudioPreferencesRepository"
import {
  defaultSpeaker,
  type AudioSource
} from "../../../src/shared/audio"

class FakeAudioRuntime implements AudioCaptureRuntime {
  readonly starts: AudioSource[] = []
  readonly pauses: AudioSource[] = []
  readonly stops: AudioSource[] = []
  readonly cleanups: AudioCleanupReason[] = []
  denied = new Set<AudioSource>()

  async start(source: AudioSource): Promise<void> {
    this.starts.push(source)
    if (this.denied.delete(source)) {
      throw new AudioCaptureError(`${source} permission denied`, "denied")
    }
  }

  async pause(source: AudioSource): Promise<void> {
    this.pauses.push(source)
  }

  async stop(source: AudioSource): Promise<void> {
    this.stops.push(source)
  }

  async cleanup(reason: AudioCleanupReason): Promise<void> {
    this.cleanups.push(reason)
  }
}

function fixture() {
  const interview = createTestOrchestrator()
  const preferences = new AudioPreferencesRepository(
    new MemoryRecordRepository<M07AudioPreferencesRecord>()
  )
  const runtime = new FakeAudioRuntime()
  const controller = new AudioSessionController(
    interview.orchestrator,
    preferences,
    runtime
  )
  return { ...interview, controller, runtime }
}

describe("audio session source state machine", () => {
  it("controls two sources deterministically without cross-source failure", async () => {
    const { orchestrator, controller, runtime } = fixture()
    await orchestrator.start(TEST_SNAPSHOT)
    runtime.denied.add("system")

    const first = await controller.command({ type: "master-toggle" })
    expect(first.ok).toBe(false)
    expect(first.state.sources.microphone.phase).toBe("listening")
    expect(first.state.sources.system).toMatchObject({
      phase: "error",
      permission: "denied",
      explicitRetryRequired: true
    })

    const noImplicitRetry = await controller.command({
      type: "source-toggle",
      source: "system"
    })
    expect(noImplicitRetry.ok).toBe(false)
    expect(runtime.starts.filter((source) => source === "system")).toHaveLength(
      1
    )

    const retried = await controller.command({
      type: "source-retry",
      source: "system"
    })
    expect(retried.ok).toBe(true)
    expect(retried.state.sources.system.phase).toBe("listening")

    const paused = await controller.command({ type: "master-toggle" })
    expect(paused.ok).toBe(true)
    expect(paused.state.sources.microphone.phase).toBe("paused")
    expect(paused.state.sources.system.phase).toBe("paused")
    expect(runtime.pauses).toEqual(["microphone", "system"])
  })

  it("cleans runtime and archives every source off on Reset", async () => {
    const { orchestrator, controller, runtime } = fixture()
    await orchestrator.start(TEST_SNAPSHOT)
    expect((await controller.command({ type: "master-toggle" })).ok).toBe(true)

    const result = await controller.reset(() =>
      orchestrator.command({ type: "reset" })
    )
    expect(result.ok).toBe(true)
    expect(runtime.cleanups).toEqual(["reset"])
    expect(result.state.lifecycle).toBe("idle")
    if (result.state.lifecycle !== "idle") {
      throw new Error("Reset did not return the interview to Idle")
    }
    expect(result.state.lastArchive?.session.audio.sources).toMatchObject({
      microphone: { phase: "off", intent: "off" },
      system: { phase: "off", intent: "off" }
    })
  })

  it("coordinates startup cleanup and persists crash recovery capture-off", async () => {
    const { orchestrator, controller, runtime, records } = fixture()
    await controller.cleanupStartup()
    await orchestrator.start(TEST_SNAPSHOT)
    expect((await controller.command({ type: "master-toggle" })).ok).toBe(true)
    expect(controller.current().sources.microphone.phase).toBe("listening")

    const persisted = records.values.get("active-interview-session")
    expect(persisted?.session.audio.sources).toMatchObject({
      microphone: { phase: "off", intent: "off" },
      system: { phase: "off", intent: "off" }
    })
    expect(runtime.cleanups).toEqual(["startup"])
  })

  it("disables only a source that fails live and requires its explicit retry", async () => {
    const { orchestrator, controller, runtime } = fixture()
    await orchestrator.start(TEST_SNAPSHOT)
    expect((await controller.command({ type: "master-toggle" })).ok).toBe(true)

    await controller.updateElapsed("microphone", 4_567)
    await controller.handleRuntimeFailure(
      "system",
      new AudioCaptureError("system capture disconnected")
    )

    expect(controller.current().sources).toMatchObject({
      microphone: { phase: "listening", elapsedMs: 4_567 },
      system: {
        intent: "off",
        phase: "error",
        explicitRetryRequired: true,
        error: "system capture disconnected"
      }
    })
    const startsBeforeRetry = runtime.starts.filter(
      (source) => source === "system"
    ).length
    expect(
      await controller.command({ type: "source-toggle", source: "system" })
    ).toMatchObject({ ok: false })
    expect(runtime.starts.filter((source) => source === "system")).toHaveLength(
      startsBeforeRetry
    )

    expect(
      await controller.command({ type: "source-retry", source: "system" })
    ).toMatchObject({
      ok: true,
      state: { sources: { system: { phase: "listening" } } }
    })
  })

  it("publishes partial, preparing-answer, and ready with timestamp provenance", async () => {
    const statuses: string[] = []
    const interview = createTestOrchestrator(undefined, undefined, {
      onState: (state) => {
        if (state.lifecycle === "active") statuses.push(state.audio.status)
      }
    })
    const preferences = new AudioPreferencesRepository(
      new MemoryRecordRepository<M07AudioPreferencesRecord>()
    )
    const controller = new AudioSessionController(
      interview.orchestrator,
      preferences,
      new FakeAudioRuntime()
    )
    await interview.orchestrator.start(TEST_SNAPSHOT)
    await controller.ingestTranscript({
      schemaVersion: 1,
      id: "segment-live",
      source: "system",
      state: "partial",
      text: "How would",
      startedAt: "2026-07-31T10:00:00.000Z",
      revision: 1,
      speaker: defaultSpeaker("system")
    })
    interview.providerFactory.queued.push({
      selection: {
        provider: "codex",
        model: "gpt-5.4",
        responseMode: "fast",
        effort: "low"
      },
      events: [
        {
          type: "typed-payload",
          sequence: 1,
          payload: {
            kind: "audio-analysis-v1",
            attributions: []
          }
        },
        { type: "completed", sequence: 2 }
      ]
    })
    await controller.ingestTranscript({
      schemaVersion: 1,
      id: "segment-live",
      source: "system",
      state: "final",
      text: "How would you design this?",
      startedAt: "2026-07-31T10:00:00.000Z",
      finalizedAt: "2026-07-31T10:00:02.000Z",
      revision: 2,
      speaker: defaultSpeaker("system")
    })

    expect(statuses).toEqual(
      expect.arrayContaining(["transcribing", "preparing-answer", "ready"])
    )
    const state = controller.current()
    expect(state.segments[0]).toMatchObject({
      startedAt: "2026-07-31T10:00:00.000Z",
      finalizedAt: "2026-07-31T10:00:02.000Z"
    })
    const artifact = interview.orchestrator.current()
    expect(artifact.lifecycle).toBe("active")
    if (artifact.lifecycle !== "active") throw new Error("session is not active")
    expect(JSON.parse(artifact.artifacts[0].content)).toMatchObject({
      startedAt: "2026-07-31T10:00:00.000Z",
      finalizedAt: "2026-07-31T10:00:02.000Z"
    })
  })
})
