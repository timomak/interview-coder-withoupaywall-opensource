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
import type { AudioSource } from "../../../src/shared/audio"

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
})
