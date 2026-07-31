import {
  AUDIO_SCHEMA_VERSION,
  AUDIO_SOURCES,
  type AudioCommand,
  type AudioPreferencesV1,
  type TranscriptSegmentV1
} from "./types"

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowed: readonly string[]
): boolean {
  const keys = new Set(allowed)
  return Object.keys(value).every((key) => keys.has(key))
}

function boundedString(value: unknown, maximum: number): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= maximum &&
    ![...value].some((character) => {
      const code = character.charCodeAt(0)
      return (code <= 31 && code !== 9 && code !== 10 && code !== 13) ||
        code === 127
    })
  )
}

export function validateAudioPreferences(
  value: unknown
): AudioPreferencesV1 {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      "schemaVersion",
      "sourceDefaults",
      "appleSpeechEnabled",
      "transcriptRetention"
    ]) ||
    value.schemaVersion !== AUDIO_SCHEMA_VERSION ||
    !isRecord(value.sourceDefaults) ||
    !hasOnlyKeys(value.sourceDefaults, AUDIO_SOURCES) ||
    value.sourceDefaults.microphone !== false ||
    value.sourceDefaults.system !== false ||
    typeof value.appleSpeechEnabled !== "boolean" ||
    typeof value.transcriptRetention !== "boolean"
  ) {
    throw new Error("Audio preferences are malformed")
  }
  return structuredClone(value) as unknown as AudioPreferencesV1
}

export function parseAudioCommand(value: unknown): AudioCommand {
  if (!isRecord(value) || typeof value.type !== "string") {
    throw new Error("Audio command is malformed")
  }
  switch (value.type) {
    case "master-toggle":
    case "dismiss-pending-question":
      if (hasOnlyKeys(value, ["type"])) return { type: value.type }
      break
    case "source-toggle":
    case "source-retry":
      if (
        hasOnlyKeys(value, ["type", "source"]) &&
        AUDIO_SOURCES.includes(value.source as (typeof AUDIO_SOURCES)[number])
      ) {
        return {
          type: value.type,
          source: value.source as (typeof AUDIO_SOURCES)[number]
        }
      }
      break
    case "correct-speaker":
      if (
        hasOnlyKeys(value, ["type", "segmentId", "label"]) &&
        boundedString(value.segmentId, 512) &&
        boundedString(value.label, 128)
      ) {
        return {
          type: value.type,
          segmentId: value.segmentId,
          label: value.label
        }
      }
      break
    case "edit-pending-question":
      if (
        hasOnlyKeys(value, ["type", "text"]) &&
        boundedString(value.text, 16_384)
      ) {
        return { type: value.type, text: value.text }
      }
      break
  }
  throw new Error("Audio command is malformed")
}

export function validateTranscriptSegment(
  value: unknown
): TranscriptSegmentV1 {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      "schemaVersion",
      "id",
      "source",
      "state",
      "text",
      "startedAt",
      "finalizedAt",
      "revision",
      "speaker"
    ]) ||
    value.schemaVersion !== AUDIO_SCHEMA_VERSION ||
    !boundedString(value.id, 512) ||
    !AUDIO_SOURCES.includes(value.source as (typeof AUDIO_SOURCES)[number]) ||
    (value.state !== "partial" && value.state !== "final") ||
    typeof value.text !== "string" ||
    value.text.length > 1_048_576 ||
    !boundedString(value.startedAt, 64) ||
    !Number.isSafeInteger(value.revision) ||
    Number(value.revision) < 1 ||
    !isRecord(value.speaker) ||
    !hasOnlyKeys(value.speaker, ["label", "certainty", "corrected"]) ||
    !boundedString(value.speaker.label, 128) ||
    !["default", "certain", "uncertain"].includes(
      String(value.speaker.certainty)
    ) ||
    typeof value.speaker.corrected !== "boolean"
  ) {
    throw new Error("Transcript segment is malformed")
  }
  if (
    (value.state === "final" && !boundedString(value.finalizedAt, 64)) ||
    (value.state === "partial" && value.finalizedAt !== undefined)
  ) {
    throw new Error("Transcript finalization is malformed")
  }
  const startedAt = Date.parse(value.startedAt as string)
  const finalizedAt =
    value.finalizedAt === undefined
      ? undefined
      : Date.parse(value.finalizedAt as string)
  if (
    !Number.isFinite(startedAt) ||
    (value.state === "final" &&
      (!Number.isFinite(finalizedAt) || finalizedAt! < startedAt))
  ) {
    throw new Error("Transcript timestamp provenance is malformed")
  }
  return structuredClone(value) as unknown as TranscriptSegmentV1
}
