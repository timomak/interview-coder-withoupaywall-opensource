import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { AudioSourceControls } from "./AudioSourceControls"
import { PendingQuestionReview } from "./PendingQuestionReview"
import { audioState } from "./testFixtures"
import { masterRecordPresentation } from "./model"

describe("audio controls", () => {
  it("presents Pause only when both sources are actively capturing", () => {
    const activeSource = {
      intent: "active" as const,
      phase: "listening" as const,
      permission: "granted" as const,
      explicitRetryRequired: false,
      elapsedMs: 12_000
    }
    const both = audioState("listening", {
      sources: {
        microphone: { source: "microphone", ...activeSource },
        system: { source: "system", ...activeSource }
      }
    })
    expect(masterRecordPresentation(both)).toMatchObject({
      label: "Pause",
      pressed: true
    })
    expect(
      masterRecordPresentation({
        ...both,
        sources: {
          ...both.sources,
          system: {
            source: "system",
            intent: "paused",
            phase: "paused",
            permission: "granted",
            explicitRetryRequired: false,
            elapsedMs: 12_000
          }
        }
      })
    ).toMatchObject({ label: "Record", pressed: false })
  })

  it("presents deterministic master and independent source actions", () => {
    const onMasterToggle = vi.fn()
    const onSourceToggle = vi.fn()
    render(
      <AudioSourceControls
        state={audioState()}
        onMasterToggle={onMasterToggle}
        onSourceToggle={onSourceToggle}
        onRetry={vi.fn()}
        onOpenSystemSettings={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole("button", { name: "Record both" }))
    fireEvent.click(
      screen.getByRole("button", { name: "Enable microphone" })
    )
    expect(onMasterToggle).toHaveBeenCalledTimes(1)
    expect(onSourceToggle).toHaveBeenCalledWith("microphone")
    expect(onSourceToggle).not.toHaveBeenCalledWith("system")
  })

  it("scopes permission repair and retry to the failed source", () => {
    const onRetry = vi.fn()
    const onOpenSystemSettings = vi.fn()
    render(
      <AudioSourceControls
        state={audioState("error", {
          sources: {
            microphone: {
              source: "microphone",
              intent: "off",
              phase: "error",
              permission: "denied",
              explicitRetryRequired: true,
              elapsedMs: 0,
              error: "Microphone access denied"
            },
            system: {
              source: "system",
              intent: "off",
              phase: "off",
              permission: "granted",
              explicitRetryRequired: false,
              elapsedMs: 0
            }
          }
        })}
        onMasterToggle={vi.fn()}
        onSourceToggle={vi.fn()}
        onRetry={onRetry}
        onOpenSystemSettings={onOpenSystemSettings}
      />
    )

    expect(screen.getByText("Microphone access denied")).toBeVisible()
    expect(screen.queryByRole("button", { name: "Retry system audio" })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Retry microphone" }))
    fireEvent.click(
      screen.getByRole("button", { name: "Open System Settings" })
    )
    expect(onRetry).toHaveBeenCalledWith("microphone")
    expect(onOpenSystemSettings).toHaveBeenCalledWith("microphone")
  })
})
describe("pending question", () => {
  it("never answers until the user invokes the explicit mode action", () => {
    const onEdit = vi.fn()
    const onAnswer = vi.fn()
    render(
      <PendingQuestionReview
        mode="coding"
        question={{
          id: "question:one",
          text: "How would you design the cache?",
          segmentIds: ["segment:system"],
          detectedAt: "2026-07-31T10:00:02.000Z",
          revision: 1
        }}
        onEdit={onEdit}
        onDismiss={vi.fn()}
        onAnswer={onAnswer}
      />
    )

    expect(onAnswer).not.toHaveBeenCalled()
    const editor = screen.getByRole("textbox", { name: "Pending question" })
    fireEvent.change(editor, {
      target: { value: "How would you design the cache safely?" }
    })
    expect(onAnswer).not.toHaveBeenCalled()
    fireEvent.blur(editor)
    expect(onEdit).toHaveBeenCalledWith(
      "How would you design the cache safely?"
    )
    fireEvent.click(screen.getByRole("button", { name: "Solve" }))
    expect(onAnswer).toHaveBeenCalledWith(
      "How would you design the cache safely?"
    )
  })
})
