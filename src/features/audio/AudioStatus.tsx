import type { AudioSessionState } from "./contracts"
import {
  AUDIO_STATUS_LABELS,
  formatElapsed,
  isSourceCapturing
} from "./model"

const WAVEFORM_LEVELS = [0.24, 0.42, 0.68, 0.9, 0.62, 0.36, 0.2] as const

function microphoneLevel(state: AudioSessionState): string {
  if (!isSourceCapturing(state.sources.microphone)) return "Off"
  if (state.status === "speech-detected") return "Speech detected"
  if (state.status === "transcribing") return "Transcribing speech"
  return "Listening"
}

export function AudioStatus({ state }: { readonly state: AudioSessionState }) {
  const microphone = state.sources.microphone
  const system = state.sources.system
  const level = microphoneLevel(state)

  return (
    <section
      className="quiet-audio-status"
      aria-label="Audio status"
      data-audio-status={state.status}
    >
      <div className="quiet-audio-state" role="status" aria-live="polite">
        <strong>{AUDIO_STATUS_LABELS[state.status]}</strong>
        <span>
          {state.transcriptionPath === "local"
            ? "Local transcription"
            : "Remote transcription · Apple Speech"}
        </span>
      </div>
      <div
        className="quiet-waveform"
        role="img"
        aria-label={`Microphone level: ${level}`}
      >
        <span
          className="quiet-waveform-bars"
          data-active={isSourceCapturing(microphone)}
          aria-hidden="true"
        >
          {WAVEFORM_LEVELS.map((height, index) => (
            <i
              // The fixed bars are decorative; status text carries the signal.
              key={index}
              style={{ "--quiet-wave-height": height } as React.CSSProperties}
            />
          ))}
        </span>
        <span className="quiet-waveform-text">Microphone level: {level}</span>
      </div>
      <span
        className="quiet-audio-elapsed"
        aria-label="Microphone elapsed time"
      >
        Microphone {formatElapsed(microphone.elapsedMs)}
      </span>
      <span
        className="quiet-audio-elapsed"
        aria-label="System audio elapsed time"
      >
        System audio {formatElapsed(system.elapsedMs)}
      </span>
    </section>
  )
}
