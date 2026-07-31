import type {
  AudioSessionState,
  AudioSource,
  AudioSourceSessionState
} from "./contracts"
import { isSourceCapturing, sourceName } from "./model"

interface AudioSourceControlsProps {
  readonly state: AudioSessionState
  readonly disabled?: boolean
  readonly onMasterToggle: () => void
  readonly onSourceToggle: (source: AudioSource) => void
  readonly onRetry: (source: AudioSource) => void
  readonly onOpenSystemSettings: (source: AudioSource) => void
}

function sourceStatus(source: AudioSourceSessionState): string {
  if (source.phase === "error" || source.permission === "denied") {
    return source.error ?? "Permission required"
  }
  if (source.intent === "paused" || source.phase === "paused") return "Paused"
  if (isSourceCapturing(source)) return "On"
  return "Off"
}

export function AudioSourceControls({
  state,
  disabled = false,
  onMasterToggle,
  onSourceToggle,
  onRetry,
  onOpenSystemSettings
}: AudioSourceControlsProps) {
  const sources = [state.sources.microphone, state.sources.system] as const
  const bothCapturing = sources.every(isSourceCapturing)

  return (
    <section className="quiet-audio-controls" aria-label="Audio capture controls">
      <button
        type="button"
        className="quiet-audio-master"
        aria-pressed={bothCapturing}
        disabled={disabled}
        onClick={onMasterToggle}
      >
        {bothCapturing ? "Pause both" : "Record both"}
      </button>
      <div className="quiet-audio-sources">
        {sources.map((source) => {
          const name = sourceName(source.source)
          const failed =
            source.phase === "error" || source.permission === "denied"
          return (
            <div key={source.source} className="quiet-audio-source">
              <button
                type="button"
                aria-pressed={isSourceCapturing(source)}
                aria-label={`${
                  isSourceCapturing(source) ? "Pause" : "Enable"
                } ${name.toLocaleLowerCase("en-US")}`}
                disabled={disabled || failed}
                onClick={() => onSourceToggle(source.source)}
              >
                {name}
              </button>
              <span>{sourceStatus(source)}</span>
              {failed ? (
                <span className="quiet-audio-recovery">
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onOpenSystemSettings(source.source)}
                  >
                    Open System Settings
                  </button>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onRetry(source.source)}
                  >
                    Retry {name.toLocaleLowerCase("en-US")}
                  </button>
                </span>
              ) : null}
            </div>
          )
        })}
      </div>
    </section>
  )
}
