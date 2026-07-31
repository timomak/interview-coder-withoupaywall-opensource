import {
  AUDIO_SCHEMA_VERSION,
  AUDIO_SOURCES,
  DEFAULT_AUDIO_PREFERENCES,
  type AudioPreferencesV1,
  type AudioSessionState,
  type AudioSource,
  type AudioSourcePhase,
  type AudioSourceSessionState,
  type AudioVisibleStatus,
  type PendingQuestion,
  type TranscriptSegmentV1,
  type TranscriptSpeaker
} from "./types"

function initialSource(source: AudioSource): AudioSourceSessionState {
  return {
    source,
    intent: "off",
    phase: "off",
    permission: "unknown",
    explicitRetryRequired: false,
    elapsedMs: 0
  }
}

export function defaultSpeaker(source: AudioSource): TranscriptSpeaker {
  return {
    label: source === "system" ? "Interviewer" : "You",
    certainty: "default",
    corrected: false
  }
}

export function createInitialAudioSessionState(
  sessionId?: string,
  preferences: AudioPreferencesV1 = DEFAULT_AUDIO_PREFERENCES
): AudioSessionState {
  return {
    schemaVersion: AUDIO_SCHEMA_VERSION,
    sessionId,
    status: "microphone-off",
    sources: {
      microphone: initialSource("microphone"),
      system: initialSource("system")
    },
    segments: [],
    transcriptionPath: preferences.appleSpeechEnabled ? "remote" : "local"
  }
}

export function audioStateForRecovery(
  value: AudioSessionState | undefined,
  sessionId: string,
  retainFinalizedTranscript = true
): AudioSessionState {
  const fallback = createInitialAudioSessionState(sessionId)
  if (!value || value.schemaVersion !== AUDIO_SCHEMA_VERSION) return fallback
  const segments = retainFinalizedTranscript ? value.segments : []
  const pendingQuestion = retainFinalizedTranscript
    ? value.pendingQuestion
    : undefined
  return {
    ...value,
    sessionId,
    status: pendingQuestion
      ? "question-detected"
      : segments.some((segment) => segment.state === "final")
        ? "ready"
        : "microphone-off",
    sources: {
      microphone: initialSource("microphone"),
      system: initialSource("system")
    },
    segments,
    pendingQuestion
  }
}

export function sourceIntentAfterMaster(
  state: AudioSessionState
): Readonly<Record<AudioSource, "active" | "paused">> {
  const bothListening = AUDIO_SOURCES.every(
    (source) =>
      state.sources[source].intent === "active" &&
      state.sources[source].phase === "listening"
  )
  return bothListening
    ? { microphone: "paused", system: "paused" }
    : { microphone: "active", system: "active" }
}

const SOURCE_TRANSITIONS: Readonly<
  Record<AudioSourcePhase, readonly AudioSourcePhase[]>
> = {
  off: ["starting"],
  starting: ["listening", "off", "error"],
  listening: ["paused", "off", "error"],
  paused: ["starting", "off", "error"],
  error: ["starting", "off"]
}

export function updateAudioSourceState(
  state: AudioSessionState,
  next: AudioSourceSessionState
): AudioSessionState {
  const prior = state.sources[next.source]
  if (
    next.elapsedMs < prior.elapsedMs ||
    (prior.phase !== next.phase &&
      !SOURCE_TRANSITIONS[prior.phase].includes(next.phase)) ||
    (next.phase === "error" &&
      (!next.error || !next.explicitRetryRequired)) ||
    (next.permission === "denied" &&
      (next.phase !== "error" || !next.explicitRetryRequired)) ||
    (next.phase === "listening" && next.intent !== "active") ||
    (next.phase === "paused" && next.intent !== "paused") ||
    (next.phase === "off" && next.intent !== "off")
  ) {
    throw new Error("Audio source transition is invalid")
  }
  const status: AudioVisibleStatus =
    next.phase === "error"
      ? "error"
      : next.phase === "listening"
        ? "listening"
        : AUDIO_SOURCES.every((source) =>
              source === next.source
                ? next.phase === "off" || next.phase === "paused"
                : ["off", "paused"].includes(state.sources[source].phase)
            )
          ? "microphone-off"
          : state.status
  return {
    ...state,
    status,
    sources: {
      ...state.sources,
      [next.source]: structuredClone(next)
    }
  }
}

export function setAudioVisibleStatus(
  state: AudioSessionState,
  status: AudioVisibleStatus
): AudioSessionState {
  return { ...state, status }
}

export function setTranscriptionPath(
  state: AudioSessionState,
  path: "local" | "remote"
): AudioSessionState {
  return { ...state, transcriptionPath: path }
}

export function upsertTranscriptSegment(
  state: AudioSessionState,
  segment: TranscriptSegmentV1
): AudioSessionState {
  const prior = state.segments.find((candidate) => candidate.id === segment.id)
  const startedAt = Date.parse(segment.startedAt)
  const finalizedAt =
    segment.finalizedAt === undefined
      ? undefined
      : Date.parse(segment.finalizedAt)
  if (
    !Number.isFinite(startedAt) ||
    (segment.state === "final" &&
      (!Number.isFinite(finalizedAt) || finalizedAt! < startedAt))
  ) {
    throw new Error("Transcript timestamp provenance is invalid")
  }
  if (prior) {
    if (
      prior.source !== segment.source ||
      prior.state === "final" ||
      prior.startedAt !== segment.startedAt ||
      segment.revision !== prior.revision + 1
    ) {
      throw new Error("Transcript segment transition is invalid")
    }
  } else if (segment.revision !== 1) {
    throw new Error("New transcript segment must start at revision 1")
  }
  return {
    ...state,
    status: segment.state === "partial" ? "transcribing" : "ready",
    segments: prior
      ? state.segments.map((candidate) =>
          candidate.id === segment.id ? structuredClone(segment) : candidate
        )
      : [...state.segments, structuredClone(segment)]
  }
}

export function correctTranscriptSpeaker(
  state: AudioSessionState,
  segmentId: string,
  label: string
): AudioSessionState {
  const normalized = label.normalize("NFC").trim()
  const segment = state.segments.find(
    (candidate) => candidate.id === segmentId && candidate.state === "final"
  )
  if (!segment || normalized.length === 0 || normalized.length > 128) {
    throw new Error("Only a finalized transcript label can be corrected")
  }
  return {
    ...state,
    segments: state.segments.map((candidate) =>
      candidate.id === segmentId
        ? {
            ...candidate,
            revision: candidate.revision + 1,
            speaker: {
              label: normalized,
              certainty: "certain" as const,
              corrected: true
            }
          }
        : candidate
    )
  }
}

export function attributeTranscriptSpeaker(
  state: AudioSessionState,
  segmentId: string,
  speaker: TranscriptSpeaker
): AudioSessionState {
  const normalized = speaker.label.normalize("NFC").trim()
  const segment = state.segments.find(
    (candidate) => candidate.id === segmentId && candidate.state === "final"
  )
  if (
    !segment ||
    normalized.length === 0 ||
    normalized.length > 128 ||
    speaker.corrected
  ) {
    throw new Error("Provider attribution is invalid")
  }
  return {
    ...state,
    segments: state.segments.map((candidate) =>
      candidate.id === segmentId
        ? {
            ...candidate,
            revision: candidate.revision + 1,
            speaker: { ...speaker, label: normalized }
          }
        : candidate
    )
  }
}

export function setPendingQuestion(
  state: AudioSessionState,
  question: PendingQuestion
): AudioSessionState {
  if (
    question.text.trim().length === 0 ||
    question.segmentIds.length === 0 ||
    question.segmentIds.some(
      (id) =>
        !state.segments.some(
          (segment) => segment.id === id && segment.state === "final"
        )
    )
  ) {
    throw new Error("Pending question must reference finalized transcript")
  }
  return {
    ...state,
    status: "question-detected",
    pendingQuestion: structuredClone(question)
  }
}

export function editPendingQuestion(
  state: AudioSessionState,
  text: string
): AudioSessionState {
  const normalized = text.normalize("NFC").trim()
  if (!state.pendingQuestion || normalized.length === 0) {
    throw new Error("No pending question is available to edit")
  }
  return {
    ...state,
    pendingQuestion: {
      ...state.pendingQuestion,
      text: normalized,
      revision: state.pendingQuestion.revision + 1
    }
  }
}

export function dismissPendingQuestion(
  state: AudioSessionState
): AudioSessionState {
  if (!state.pendingQuestion) {
    throw new Error("No pending question is available to dismiss")
  }
  return {
    ...state,
    status: state.segments.some((segment) => segment.state === "final")
      ? "ready"
      : "microphone-off",
    pendingQuestion: undefined
  }
}
