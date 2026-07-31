import type {
  SpeakerCertainty,
  TranscriptSpeaker
} from "../../src/shared/audio"

export interface AudioAnalysisPayload {
  readonly attributions: readonly {
    readonly segmentId: string
    readonly speaker: TranscriptSpeaker
  }[]
  readonly question?: {
    readonly text: string
    readonly segmentIds: readonly string[]
  }
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowed: readonly string[]
): boolean {
  const keys = new Set(allowed)
  return Object.keys(value).every((key) => keys.has(key))
}

export function parseAudioAnalysisPayload(
  value: unknown,
  allowedSegmentIds: readonly string[]
): AudioAnalysisPayload | undefined {
  const payload = record(value)
  if (
    !payload ||
    !hasOnlyKeys(payload, ["kind", "attributions", "question"]) ||
    payload.kind !== "audio-analysis-v1" ||
    !Array.isArray(payload.attributions)
  ) {
    return undefined
  }
  const allowed = new Set(allowedSegmentIds)
  const attributions: AudioAnalysisPayload["attributions"][number][] = []
  for (const item of payload.attributions) {
    const attribution = record(item)
    if (
      !attribution ||
      !hasOnlyKeys(attribution, ["segmentId", "label", "certainty"]) ||
      typeof attribution.segmentId !== "string" ||
      !allowed.has(attribution.segmentId) ||
      typeof attribution.label !== "string" ||
      attribution.label.trim().length === 0 ||
      attribution.label.length > 128 ||
      !["default", "certain", "uncertain"].includes(
        String(attribution.certainty)
      )
    ) {
      return undefined
    }
    attributions.push({
      segmentId: attribution.segmentId,
      speaker: {
        label: attribution.label,
        certainty: attribution.certainty as SpeakerCertainty,
        corrected: false
      }
    })
  }
  if (new Set(attributions.map((item) => item.segmentId)).size !== attributions.length) {
    return undefined
  }
  if (payload.question === undefined) return { attributions }
  const question = record(payload.question)
  if (
    !question ||
    !hasOnlyKeys(question, ["text", "segmentIds"]) ||
    typeof question.text !== "string" ||
    question.text.trim().length === 0 ||
    question.text.length > 16_384 ||
    !Array.isArray(question.segmentIds) ||
    question.segmentIds.length === 0 ||
    question.segmentIds.some(
      (id) => typeof id !== "string" || !allowed.has(id)
    ) ||
    new Set(question.segmentIds).size !== question.segmentIds.length
  ) {
    return undefined
  }
  return {
    attributions,
    question: {
      text: question.text,
      segmentIds: question.segmentIds as string[]
    }
  }
}
