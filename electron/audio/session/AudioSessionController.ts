import {
  AUDIO_SOURCES,
  createInitialAudioSessionState,
  parseAudioCommand,
  sourceIntentAfterMaster,
  validateTranscriptSegment,
  type AudioCommand,
  type AudioCommandResult,
  type AudioSessionState,
  type AudioSource,
  type AudioSourceSessionState,
  type TranscriptSegmentV1
} from "../../../src/shared/audio"
import type { CommandResult } from "../../../src/shared/interview"
import type { InterviewOrchestrator } from "../../orchestrator"
import type { AudioPreferencesRepository } from "./AudioPreferencesRepository"

export type AudioCleanupReason = "startup" | "reset" | "shutdown"

export interface AudioCaptureRuntime {
  start(source: AudioSource, path: "local" | "remote"): Promise<void>
  pause(source: AudioSource): Promise<void>
  stop(source: AudioSource): Promise<void>
  cleanup(reason: AudioCleanupReason): Promise<void>
}

export class AudioCaptureError extends Error {
  constructor(
    message: string,
    readonly permission: "unknown" | "denied" = "unknown"
  ) {
    super(message)
  }
}

export class UnavailableAudioCaptureRuntime implements AudioCaptureRuntime {
  async start(): Promise<void> {
    throw new AudioCaptureError(
      "The native audio capture adapter is unavailable in this build"
    )
  }

  async pause(): Promise<void> {}
  async stop(): Promise<void> {}
  async cleanup(): Promise<void> {}
}

export class AudioSessionController {
  constructor(
    private readonly orchestrator: InterviewOrchestrator,
    private readonly preferences: AudioPreferencesRepository,
    private readonly runtime: AudioCaptureRuntime
  ) {}

  current(): AudioSessionState {
    const session = this.orchestrator.current()
    return session.lifecycle === "active"
      ? structuredClone(session.audio)
      : createInitialAudioSessionState()
  }

  async command(value: unknown): Promise<AudioCommandResult> {
    let command: AudioCommand
    try {
      command = parseAudioCommand(value)
    } catch (error) {
      return {
        ok: false,
        state: this.current(),
        error: error instanceof Error ? error.message : "Audio command failed"
      }
    }
    if (this.orchestrator.current().lifecycle !== "active") {
      return {
        ok: false,
        state: this.current(),
        error: "Audio controls require an active interview"
      }
    }
    try {
      switch (command.type) {
        case "master-toggle":
          await this.masterToggle()
          break
        case "source-toggle":
          await this.sourceToggle(command.source)
          break
        case "source-retry":
          await this.retry(command.source)
          break
        case "correct-speaker":
          await this.orchestrator.audioMutation({
            type: "speaker-correction",
            segmentId: command.segmentId,
            label: command.label
          })
          await this.orchestrator.synchronizeTranscriptCorrection(
            command.segmentId
          )
          break
        case "edit-pending-question":
          await this.orchestrator.audioMutation({
            type: "question-edited",
            text: command.text
          })
          break
        case "dismiss-pending-question":
          await this.orchestrator.audioMutation({
            type: "question-dismissed"
          })
          break
        default: {
          const exhaustive: never = command
          return exhaustive
        }
      }
      return { ok: true, state: this.current() }
    } catch (error) {
      return {
        ok: false,
        state: this.current(),
        error: error instanceof Error ? error.message : "Audio command failed"
      }
    }
  }

  async ingestTranscript(value: unknown): Promise<void> {
    const segment = validateTranscriptSegment(value)
    await this.orchestrator.audioMutation({ type: "transcript", segment })
    if (segment.state !== "final") return
    try {
      await this.orchestrator.audioMutation({
        type: "visible-status",
        status: "preparing-answer"
      })
      await this.orchestrator.analyzeFinalizedTranscript([segment.id])
    } catch (error) {
      await this.orchestrator.audioMutation({
        type: "visible-status",
        status: "error"
      })
      throw error
    }
  }

  async updateStatus(
    status: "speech-detected" | "transcribing" | "preparing-answer" | "ready"
  ): Promise<void> {
    await this.orchestrator.audioMutation({ type: "visible-status", status })
  }

  async updateElapsed(source: AudioSource, elapsedMs: number): Promise<void> {
    if (
      this.orchestrator.current().lifecycle !== "active" ||
      !Number.isFinite(elapsedMs) ||
      elapsedMs < 0
    ) {
      return
    }
    const current = this.current().sources[source]
    if (current.phase !== "starting" && current.phase !== "listening") return
    const nextElapsed = Math.floor(elapsedMs)
    if (nextElapsed <= current.elapsedMs) return
    await this.setSource({ ...current, elapsedMs: nextElapsed })
  }

  async handleRuntimeFailure(
    source: AudioSource,
    error: unknown
  ): Promise<void> {
    if (this.orchestrator.current().lifecycle !== "active") return
    const current = this.current().sources[source]
    if (current.phase === "off") return
    const captureError =
      error instanceof AudioCaptureError
        ? error
        : new AudioCaptureError(
            error instanceof Error ? error.message : `${source} failed`
          )
    if (
      current.phase === "error" &&
      current.error === captureError.message &&
      current.permission === captureError.permission
    ) {
      return
    }
    await this.setSource({
      ...current,
      intent: "off",
      phase: "error",
      permission: captureError.permission,
      explicitRetryRequired: true,
      error: captureError.message
    })
  }

  async cleanupStartup(): Promise<void> {
    await this.runtime.cleanup("startup")
  }

  async reset(
    resetInterview: () => Promise<CommandResult>
  ): Promise<CommandResult> {
    await this.runtime.cleanup("reset")
    if (this.orchestrator.current().lifecycle === "active") {
      for (const source of AUDIO_SOURCES) {
        await this.forceOff(source)
      }
    }
    return resetInterview()
  }

  async shutdown(): Promise<void> {
    await this.runtime.cleanup("shutdown")
  }

  private async masterToggle(): Promise<void> {
    const intents = sourceIntentAfterMaster(this.current())
    const failures: string[] = []
    for (const source of AUDIO_SOURCES) {
      try {
        if (intents[source] === "paused") {
          await this.pause(source)
        } else if (this.current().sources[source].explicitRetryRequired) {
          failures.push(`${source} requires explicit Retry`)
        } else {
          await this.start(source)
        }
      } catch (error) {
        failures.push(
          error instanceof Error ? error.message : `${source} failed`
        )
      }
    }
    if (failures.length > 0) throw new Error(failures.join("; "))
  }

  private async sourceToggle(source: AudioSource): Promise<void> {
    const current = this.current().sources[source]
    if (current.explicitRetryRequired) {
      throw new Error(`${source} requires explicit Retry`)
    }
    if (current.phase === "listening" || current.phase === "starting") {
      await this.forceOff(source)
    } else {
      await this.start(source)
    }
  }

  private async retry(source: AudioSource): Promise<void> {
    if (!this.current().sources[source].explicitRetryRequired) {
      throw new Error(`${source} does not require Retry`)
    }
    await this.start(source, true)
  }

  private async start(source: AudioSource, retry = false): Promise<void> {
    const current = this.current().sources[source]
    if (current.phase === "listening") return
    if (current.explicitRetryRequired && !retry) {
      throw new Error(`${source} requires explicit Retry`)
    }
    const preferences = await this.preferences.load()
    const transcriptionPath = preferences.appleSpeechEnabled
      ? "remote"
      : "local"
    await this.orchestrator.audioMutation({
      type: "transcription-path",
      path: transcriptionPath
    })
    await this.setSource({
      ...current,
      intent: "active",
      phase: "starting",
      permission: retry ? "unknown" : current.permission,
      explicitRetryRequired: false,
      error: undefined
    })
    try {
      await this.runtime.start(source, transcriptionPath)
      await this.setSource({
        ...this.current().sources[source],
        intent: "active",
        phase: "listening",
        permission: "granted",
        explicitRetryRequired: false,
        error: undefined
      })
    } catch (error) {
      const captureError =
        error instanceof AudioCaptureError
          ? error
          : new AudioCaptureError(
              error instanceof Error ? error.message : `${source} failed`
            )
      await this.setSource({
        ...this.current().sources[source],
        intent: "off",
        phase: "error",
        permission: captureError.permission,
        explicitRetryRequired: true,
        error: captureError.message
      })
      throw captureError
    }
  }

  private async pause(source: AudioSource): Promise<void> {
    const current = this.current().sources[source]
    if (current.phase !== "listening") return
    await this.runtime.pause(source)
    await this.setSource({
      ...current,
      intent: "paused",
      phase: "paused"
    })
  }

  private async forceOff(source: AudioSource): Promise<void> {
    const current = this.current().sources[source]
    if (current.phase === "off") return
    await this.runtime.stop(source)
    await this.setSource({
      ...current,
      intent: "off",
      phase: "off",
      explicitRetryRequired: false,
      error: undefined
    })
  }

  private async setSource(sourceState: AudioSourceSessionState): Promise<void> {
    await this.orchestrator.audioMutation({
      type: "source-state",
      sourceState
    })
  }
}

export function finalizedTranscript(
  value: Omit<TranscriptSegmentV1, "state" | "finalizedAt"> & {
    readonly finalizedAt: string
  }
): TranscriptSegmentV1 {
  return { ...value, state: "final" }
}
