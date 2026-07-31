import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { AudioPreferences } from "./contracts"
import { AudioSettings } from "./AudioSettings"

const localPreferences: AudioPreferences = {
  schemaVersion: 1,
  sourceDefaults: {
    microphone: false,
    system: false
  },
  appleSpeechEnabled: false,
  transcriptRetention: false
}

describe("Audio Settings", () => {
  beforeEach(() => {
    const getAudioPreferences = vi.fn().mockResolvedValue(localPreferences)
    const updateAudioPreferences = vi.fn(
      async (preferences: AudioPreferences) => preferences
    )
    Object.assign(window, {
      electronAPI: {
        getAudioPreferences,
        updateAudioPreferences
      }
    })
  })

  it("requires explicit visible consent before enabling Remote transcription", async () => {
    render(<AudioSettings />)
    expect(await screen.findByText("Local · on device")).toBeVisible()

    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Allow Apple Speech remote transcription"
      })
    )
    expect(
      screen.getByRole("group", { name: "Remote transcription consent" })
    ).toBeVisible()
    expect(
      window.electronAPI.updateAudioPreferences
    ).not.toHaveBeenCalled()

    fireEvent.click(
      screen.getByRole("button", {
        name: "Enable Remote transcription"
      })
    )
    await waitFor(() =>
      expect(window.electronAPI.updateAudioPreferences).toHaveBeenCalledWith({
        ...localPreferences,
        appleSpeechEnabled: true
      })
    )
    expect(await screen.findByText("Remote · Apple Speech")).toBeVisible()
  })
})
