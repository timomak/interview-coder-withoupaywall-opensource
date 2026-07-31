import { useEffect, useState } from "react"
import type {
  AudioPreferences,
  AudioRendererBridge
} from "./contracts"

const DEFAULT_PREFERENCES: AudioPreferences = {
  schemaVersion: 1,
  sourceDefaults: {
    microphone: false,
    system: false
  },
  appleSpeechEnabled: false,
  transcriptRetention: true
}

function settingsBridge(): AudioRendererBridge | undefined {
  const candidate = window.electronAPI as Partial<AudioRendererBridge>
  return typeof candidate.getAudioPreferences === "function" &&
    typeof candidate.updateAudioPreferences === "function"
    ? (candidate as AudioRendererBridge)
    : undefined
}

export function AudioSettings({ disabled = false }: { readonly disabled?: boolean }) {
  const [preferences, setPreferences] =
    useState<AudioPreferences>(DEFAULT_PREFERENCES)
  const [remoteConsentOpen, setRemoteConsentOpen] = useState(false)
  const [message, setMessage] = useState<string>()
  const bridge = settingsBridge()

  useEffect(() => {
    if (!bridge) return
    void bridge
      .getAudioPreferences()
      .then(setPreferences)
      .catch(() => setMessage("Audio preferences could not be loaded."))
  }, [bridge])

  const update = async (next: AudioPreferences) => {
    if (!bridge) {
      setMessage("Audio preferences are unavailable.")
      return
    }
    try {
      setPreferences(await bridge.updateAudioPreferences(next))
      setMessage("Audio preferences saved.")
    } catch {
      setMessage("Audio preferences were not changed.")
    }
  }

  return (
    <section className="quiet-audio-settings" aria-labelledby="audio-settings-title">
      <h3 id="audio-settings-title">Audio</h3>
      <p>
        Microphone and system audio always start off for every new or resumed
        session. Raw audio is never retained.
      </p>
      <div className="quiet-transcription-path">
        <strong>
          {preferences.appleSpeechEnabled
            ? "Remote · Apple Speech"
            : "Local · on device"}
        </strong>
        <span>Active transcription path</span>
      </div>
      <label>
        <input
          type="checkbox"
          checked={preferences.appleSpeechEnabled}
          disabled={disabled || !bridge}
          onChange={(event) => {
            if (event.target.checked) {
              setRemoteConsentOpen(true)
            } else {
              setRemoteConsentOpen(false)
              void update({ ...preferences, appleSpeechEnabled: false })
            }
          }}
        />
        Allow Apple Speech remote transcription
      </label>
      {remoteConsentOpen && !preferences.appleSpeechEnabled ? (
        <div
          className="quiet-audio-consent"
          role="group"
          aria-label="Remote transcription consent"
        >
          <p>
            Finalized speech may be sent to Apple for transcription. This does
            not change the answer provider, does not enable capture, and never
            happens silently.
          </p>
          <button
            type="button"
            disabled={disabled}
            onClick={() => setRemoteConsentOpen(false)}
          >
            Keep Local
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              setRemoteConsentOpen(false)
              void update({ ...preferences, appleSpeechEnabled: true })
            }}
          >
            Enable Remote transcription
          </button>
        </div>
      ) : null}
      <label>
        <input
          type="checkbox"
          checked={preferences.transcriptRetention}
          disabled={disabled || !bridge}
          onChange={(event) =>
            void update({
              ...preferences,
              transcriptRetention: event.target.checked
            })
          }
        />
        Retain finalized transcript with the encrypted session
      </label>
      <p className="quiet-audio-note">
        Transcript retention is separate from raw audio, which remains off.
      </p>
      {message ? (
        <p className="quiet-audio-note" role="status">
          {message}
        </p>
      ) : null}
    </section>
  )
}
