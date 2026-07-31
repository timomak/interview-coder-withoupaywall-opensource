import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { AudioStatus } from "./AudioStatus"
import { TranscriptPanel } from "./TranscriptPanel"
import { AUDIO_STATUS_LABELS } from "./model"
import { audioState, transcriptSegment } from "./testFixtures"

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
    expect(screen.getByLabelText("Microphone elapsed time")).toHaveTextContent(
      "Microphone 00:00"
    )
    expect(screen.getByLabelText("System audio elapsed time")).toHaveTextContent(
      "System audio 00:00"
    )
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

  it("announces partial/final state and exposes exact timestamp provenance", () => {
    const { rerender } = render(
      <TranscriptPanel
        segments={[
          transcriptSegment("system", {
            state: "partial",
            finalizedAt: undefined
          })
        ]}
        onCorrectSpeaker={() => {}}
      />
    )
    expect(
      screen.getByRole("status", {
        name: "Transcript segment segment:system is partial"
      })
    ).toHaveTextContent("Partial")
    expect(screen.getByText("Started 10:00:00 UTC")).toHaveAttribute(
      "datetime",
      "2026-07-31T10:00:00.000Z"
    )
    expect(screen.queryByText(/Finalized/)).toBeNull()
    expect(
      screen.getByRole("combobox", {
        name: "Speaker for segment segment:system"
      })
    ).toBeDisabled()

    rerender(
      <TranscriptPanel
        segments={[transcriptSegment("system")]}
        onCorrectSpeaker={() => {}}
      />
    )
    expect(
      screen.getByRole("status", {
        name: "Transcript segment segment:system is final"
      })
    ).toHaveTextContent("Final")
    expect(screen.getByText("Finalized 10:00:01 UTC")).toHaveAttribute(
      "datetime",
      "2026-07-31T10:00:01.000Z"
    )
    expect(
      screen.getByRole("combobox", {
        name: "Speaker for segment segment:system"
      })
    ).toBeEnabled()
  })
})
