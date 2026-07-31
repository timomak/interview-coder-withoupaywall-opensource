import type {
  AudioSource,
  TranscriptSegmentV1
} from "./contracts"
import { sourceName, visibleSpeaker } from "./model"

const COMMON_SPEAKERS = ["Interviewer", "You", "Speaker 1", "Speaker 2"] as const

interface TranscriptPanelProps {
  readonly segments: readonly TranscriptSegmentV1[]
  readonly onCorrectSpeaker: (segmentId: string, label: string) => void
}

function speakerOptions(segment: TranscriptSegmentV1): readonly string[] {
  const current = visibleSpeaker(segment)
  return COMMON_SPEAKERS.includes(
    current as (typeof COMMON_SPEAKERS)[number]
  )
    ? COMMON_SPEAKERS
    : [current, ...COMMON_SPEAKERS]
}

function sourceLabel(source: AudioSource): string {
  return `${sourceName(source)} channel`
}

export function TranscriptPanel({
  segments,
  onCorrectSpeaker
}: TranscriptPanelProps) {
  if (segments.length === 0) {
    return (
      <section className="quiet-transcript" aria-label="Transcript">
        <p>No transcript yet. Audio remains separate by source.</p>
      </section>
    )
  }

  return (
    <section className="quiet-transcript" aria-label="Transcript">
      <h2>Transcript</h2>
      <ol>
        {segments.map((segment) => {
          const speaker = visibleSpeaker(segment)
          return (
            <li key={segment.id}>
              <div className="quiet-transcript-meta">
                <span>{sourceLabel(segment.source)}</span>
                <span>{segment.state === "partial" ? "Partial" : "Final"}</span>
                {segment.speaker.certainty === "uncertain" ? (
                  <strong>Attribution uncertain</strong>
                ) : null}
              </div>
              <label>
                Speaker
                <select
                  aria-label={`Speaker for segment ${segment.id}`}
                  value={speaker}
                  onChange={(event) =>
                    onCorrectSpeaker(segment.id, event.target.value)
                  }
                >
                  {speakerOptions(segment).map((candidate) => (
                    <option key={candidate}>{candidate}</option>
                  ))}
                </select>
              </label>
              <p>{segment.text}</p>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
