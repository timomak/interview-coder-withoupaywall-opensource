import type {
  AudioCommand,
  AudioSessionState,
  AudioSource,
  AudioSourceSessionState,
  AudioVisibleStatus,
  TranscriptSegmentV1
} from "./contracts"

export const AUDIO_STATUS_LABELS: Readonly<Record<AudioVisibleStatus, string>> = {
  "microphone-off": "Microphone off",
  listening: "Listening",
  "speech-detected": "Speech detected",
  transcribing: "Transcribing",
  "question-detected": "Question detected",
  "preparing-answer": "Preparing answer",
  ready: "Ready",
  error: "Audio or permission error"
}

export const INITIAL_AUDIO_SESSION: AudioSessionState = {
  schemaVersion: 1,
  status: "microphone-off",
  sources: {
    microphone: {
      source: "microphone",
      intent: "off",
      phase: "off",
      permission: "unknown",
      explicitRetryRequired: false,
      elapsedMs: 0
    },
    system: {
      source: "system",
      intent: "off",
      phase: "off",
      permission: "unknown",
      explicitRetryRequired: false,
      elapsedMs: 0
    }
  },
  segments: [],
  transcriptionPath: "local"
}

export function isSourceCapturing(source: AudioSourceSessionState): boolean {
  return source.intent === "active" &&
    (source.phase === "starting" || source.phase === "listening")
}

export function masterRecordPresentation(state: AudioSessionState): {
  readonly label: "Record" | "Pause"
  readonly pressed: boolean
  readonly description: string
} {
  const bothCapturing =
    isSourceCapturing(state.sources.microphone) &&
    isSourceCapturing(state.sources.system)
  return bothCapturing
    ? {
        label: "Pause",
        pressed: true,
        description: "Pause microphone and system audio"
      }
    : {
        label: "Record",
        pressed: false,
        description: "Start or resume microphone and system audio"
      }
}

export function sourceName(source: AudioSource): string {
  return source === "microphone" ? "Microphone" : "System audio"
}

export function defaultSpeaker(source: AudioSource): "You" | "Interviewer" {
  return source === "microphone" ? "You" : "Interviewer"
}

export function visibleSpeaker(segment: TranscriptSegmentV1): string {
  return segment.speaker.label.trim() || defaultSpeaker(segment.source)
}

export function speakerCorrectionCommand(
  segmentId: string,
  label: string
): AudioCommand {
  const corrected = label.trim()
  if (!segmentId || !corrected) {
    throw new Error("A transcript segment and speaker label are required")
  }
  return { type: "correct-speaker", segmentId, label: corrected }
}

export function formatElapsed(elapsedMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes.toString().padStart(2, "0")}:${seconds
    .toString()
    .padStart(2, "0")}`
}
