export const AUDIO_SCHEMA_VERSION = 1 as const

export const AUDIO_SOURCES = ["microphone", "system"] as const
export type AudioSource = (typeof AUDIO_SOURCES)[number]

export const AUDIO_VISIBLE_STATUSES = [
  "microphone-off",
  "listening",
  "speech-detected",
  "transcribing",
  "question-detected",
  "preparing-answer",
  "ready",
  "error"
] as const
export type AudioVisibleStatus = (typeof AUDIO_VISIBLE_STATUSES)[number]

export type AudioSourceIntent = "off" | "active" | "paused"
export type AudioSourcePhase =
  | "off"
  | "starting"
  | "listening"
  | "paused"
  | "error"
export type AudioPermissionState = "unknown" | "granted" | "denied"

export interface AudioSourceSessionState {
  readonly source: AudioSource
  readonly intent: AudioSourceIntent
  readonly phase: AudioSourcePhase
  readonly permission: AudioPermissionState
  readonly explicitRetryRequired: boolean
  readonly elapsedMs: number
  readonly error?: string
}

export type SpeakerCertainty = "default" | "certain" | "uncertain"

export interface TranscriptSpeaker {
  readonly label: string
  readonly certainty: SpeakerCertainty
  readonly corrected: boolean
}

export interface TranscriptSegmentV1 {
  readonly schemaVersion: typeof AUDIO_SCHEMA_VERSION
  readonly id: string
  readonly source: AudioSource
  readonly state: "partial" | "final"
  readonly text: string
  readonly startedAt: string
  readonly finalizedAt?: string
  readonly revision: number
  readonly speaker: TranscriptSpeaker
}

export interface PendingQuestion {
  readonly id: string
  readonly text: string
  readonly segmentIds: readonly string[]
  readonly detectedAt: string
  readonly revision: number
}

export interface AudioSessionState {
  readonly schemaVersion: typeof AUDIO_SCHEMA_VERSION
  readonly sessionId?: string
  readonly status: AudioVisibleStatus
  readonly sources: Readonly<Record<AudioSource, AudioSourceSessionState>>
  readonly segments: readonly TranscriptSegmentV1[]
  readonly pendingQuestion?: PendingQuestion
  readonly transcriptionPath: "local" | "remote"
}

export interface AudioPreferencesV1 {
  readonly schemaVersion: typeof AUDIO_SCHEMA_VERSION
  readonly sourceDefaults: Readonly<Record<AudioSource, false>>
  readonly appleSpeechEnabled: boolean
  readonly transcriptRetention: boolean
}

export const DEFAULT_AUDIO_PREFERENCES: AudioPreferencesV1 = Object.freeze({
  schemaVersion: AUDIO_SCHEMA_VERSION,
  sourceDefaults: Object.freeze({
    microphone: false,
    system: false
  }),
  appleSpeechEnabled: false,
  transcriptRetention: true
})

export type AudioCommand =
  | { readonly type: "master-toggle" }
  | { readonly type: "source-toggle"; readonly source: AudioSource }
  | { readonly type: "source-retry"; readonly source: AudioSource }
  | {
      readonly type: "correct-speaker"
      readonly segmentId: string
      readonly label: string
    }
  | {
      readonly type: "edit-pending-question"
      readonly text: string
    }
  | { readonly type: "dismiss-pending-question" }

export interface AudioCommandResult {
  readonly ok: boolean
  readonly state: AudioSessionState
  readonly error?: string
}

export const AUDIO_STATE_CHANNEL = "audio:get-state" as const
export const AUDIO_COMMAND_CHANNEL = "audio:command" as const
export const AUDIO_STATE_EVENT = "audio:state" as const
export const AUDIO_PREFERENCES_CHANNEL = "audio:get-preferences" as const
export const AUDIO_PREFERENCES_UPDATE_CHANNEL =
  "audio:update-preferences" as const
export const AUDIO_OPEN_SYSTEM_SETTINGS_CHANNEL =
  "audio:open-system-settings" as const
