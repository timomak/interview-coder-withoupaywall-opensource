import type {
  AudioSessionState,
  AudioSource,
  AudioSourceSessionState,
  AudioVisibleStatus,
  TranscriptSegmentV1
} from "./contracts"

function source(
  id: AudioSource,
  overrides: Partial<AudioSourceSessionState> = {}
): AudioSourceSessionState {
  return {
    source: id,
    intent: "off",
    phase: "off",
    permission: "unknown",
    explicitRetryRequired: false,
    elapsedMs: 0,
    ...overrides
  }
}
export function audioState(
  status: AudioVisibleStatus = "microphone-off",
  overrides: Partial<AudioSessionState> = {}
): AudioSessionState {
  return {
    schemaVersion: 1,
    sessionId: "session:audio-ui",
    status,
    sources: {
      microphone: source("microphone"),
      system: source("system")
    },
    segments: [],
    transcriptionPath: "local",
    ...overrides
  }
}

export function transcriptSegment(
  sourceId: AudioSource,
  overrides: Partial<TranscriptSegmentV1> = {}
): TranscriptSegmentV1 {
  return {
    schemaVersion: 1,
    id: `segment:${sourceId}`,
    source: sourceId,
    state: "final",
    text: sourceId === "microphone" ? "My response" : "What would you build?",
    startedAt: "2026-07-31T10:00:00.000Z",
    finalizedAt: "2026-07-31T10:00:01.000Z",
    revision: 1,
    speaker: {
      label: sourceId === "microphone" ? "You" : "Interviewer",
      certainty: "default",
      corrected: false
    },
    ...overrides
  }
}
