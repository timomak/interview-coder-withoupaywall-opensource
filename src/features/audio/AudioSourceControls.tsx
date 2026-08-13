import type { AudioSessionState, AudioSource } from "./contracts"
import { sourceName } from "./model"

interface AudioSourceControlsProps {
  readonly state: AudioSessionState
  readonly disabled?: boolean
  readonly onRetry: (source: AudioSource) => void
  readonly onOpenSystemSettings: (source: AudioSource) => void
}

export function AudioSourceControls({
  state,
  disabled = false,
  onRetry,
  onOpenSystemSettings
}: AudioSourceControlsProps) {
  const failedSources = [
    state.sources.microphone,
    state.sources.system
  ].filter(
    (source) => source.phase === "error" || source.permission === "denied"
  )

  if (failedSources.length === 0) return null

  return (
    <section
      className="quiet-audio-recovery-list"
      aria-label="Audio access recovery"
    >
      {failedSources.map((source) => {
        const name = sourceName(source.source)
        return (
          <div key={source.source} className="quiet-audio-recovery">
            <div>
              <strong>{name} needs access</strong>
              <p>{source.error ?? "Permission is unavailable."}</p>
            </div>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onOpenSystemSettings(source.source)}
            >
              Open settings
            </button>
            <button
              className="quiet-primary"
              type="button"
              disabled={disabled}
              onClick={() => onRetry(source.source)}
            >
              Try again
            </button>
          </div>
        )
      })}
    </section>
  )
}
