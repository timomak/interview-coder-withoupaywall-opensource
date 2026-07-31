export type AudioSource = "microphone" | "system"

export type AudioVisibleStatus =
  | "microphone-off"
  | "listening"
  | "speech-detected"
  | "transcribing"
  | "question-detected"
  | "preparing-answer"
  | "ready"
  | "error"

export interface AudioSourceSessionState {
  readonly source: AudioSource
  readonly intent: "off" | "active" | "paused"
  readonly phase: "off" | "starting" | "listening" | "paused" | "error"
  readonly permission: "unknown" | "granted" | "denied"
  readonly explicitRetryRequired: boolean
  readonly elapsedMs: number
  readonly error?: string
}

export interface TranscriptSpeaker {
  readonly label: string
  readonly certainty: "default" | "certain" | "uncertain"
  readonly corrected: boolean
}

export interface TranscriptSegmentV1 {
  readonly schemaVersion: 1
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
  readonly schemaVersion: 1
  readonly sessionId?: string
  readonly status: AudioVisibleStatus
  readonly sources: Readonly<Record<AudioSource, AudioSourceSessionState>>
  readonly segments: readonly TranscriptSegmentV1[]
  readonly pendingQuestion?: PendingQuestion
  readonly transcriptionPath: "local" | "remote"
}

export interface AudioPreferences {
  readonly schemaVersion: 1
  readonly sourceDefaults: {
    readonly microphone: false
    readonly system: false
  }
  readonly appleSpeechEnabled: boolean
  readonly transcriptRetention: boolean
}

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

export interface AudioRendererBridge {
  getAudioSessionState(): Promise<AudioSessionState>
  dispatchAudioCommand(command: AudioCommand): Promise<AudioCommandResult>
  onAudioSessionState(
    callback: (state: AudioSessionState) => void
  ): () => void
  getAudioPreferences(): Promise<AudioPreferences>
  updateAudioPreferences(
    preferences: AudioPreferences
  ): Promise<AudioPreferences>
}
