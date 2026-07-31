import { useCallback, useEffect, useState } from "react"
import type {
  AudioCommand,
  AudioRendererBridge,
  AudioSessionState
} from "./contracts"
import { INITIAL_AUDIO_SESSION } from "./model"

function rendererAudioBridge(): AudioRendererBridge | undefined {
  const candidate = window.electronAPI as Partial<AudioRendererBridge>
  return typeof candidate.getAudioSessionState === "function" &&
    typeof candidate.dispatchAudioCommand === "function" &&
    typeof candidate.onAudioSessionState === "function"
    ? (candidate as AudioRendererBridge)
    : undefined
}

export function useAudioSession() {
  const [state, setState] = useState<AudioSessionState>(INITIAL_AUDIO_SESSION)
  const [available, setAvailable] = useState(false)
  const [error, setError] = useState<string>()

  useEffect(() => {
    const bridge = rendererAudioBridge()
    if (!bridge) {
      setAvailable(false)
      return
    }
    setAvailable(true)
    void bridge
      .getAudioSessionState()
      .then(setState)
      .catch(() => setError("Audio status is unavailable."))
    return bridge.onAudioSessionState((next) => {
      setState(next)
      setError(undefined)
    })
  }, [])

  const dispatch = useCallback(async (command: AudioCommand) => {
    const bridge = rendererAudioBridge()
    if (!bridge) {
      setError("Audio controls are unavailable.")
      return undefined
    }
    try {
      const result = await bridge.dispatchAudioCommand(command)
      setState(result.state)
      setError(result.ok ? undefined : result.error ?? "Audio action failed.")
      return result
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Audio action could not finish."
      )
      return undefined
    }
  }, [])

  return { state, available, error, dispatch }
}
