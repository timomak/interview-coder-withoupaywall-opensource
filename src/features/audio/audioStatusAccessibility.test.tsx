import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { AudioStatus } from "./AudioStatus"
import { AUDIO_STATUS_LABELS } from "./model"
import { audioState } from "./testFixtures"

describe("accessible audio status", () => {
  it("renders complete accessible audio state model", () => {
    const { rerender } = render(<AudioStatus state={audioState()} />)

    for (const [status, label] of Object.entries(AUDIO_STATUS_LABELS)) {
      rerender(
        <AudioStatus
          state={audioState(status as keyof typeof AUDIO_STATUS_LABELS)}
        />
      )
      expect(screen.getByRole("status")).toHaveTextContent(label)
      expect(
        screen.getByLabelText("Audio status").getAttribute("data-audio-status")
      ).toBe(status)
    }

    expect(
      screen.getByRole("img", { name: /Microphone level:/ })
    ).toBeVisible()
    expect(screen.getByText(/Elapsed 00:00/)).toBeVisible()
  })

  it("names Local and Remote transcription without relying on color", () => {
    const { rerender } = render(<AudioStatus state={audioState()} />)
    expect(screen.getByText("Local transcription")).toBeVisible()

    rerender(
      <AudioStatus
        state={audioState("listening", { transcriptionPath: "remote" })}
      />
    )
    expect(
      screen.getByText("Remote transcription · Apple Speech")
    ).toBeVisible()
  })
})
