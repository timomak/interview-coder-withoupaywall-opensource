import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import {
  createIdleInterviewSession,
  reduceInterviewSession
} from "../../domain/interview"
import { CommandRail, type CommandRailProps } from "./CommandRail"

function activeSession() {
  const result = reduceInterviewSession(createIdleInterviewSession(), {
    type: "start",
    eventId: "event:start",
    sessionId: "session:one",
    sequence: 1,
    at: "2026-07-30T20:00:00Z",
    snapshot: {
      mode: "coding",
      provider: "codex",
      model: "gpt-5",
      responseMode: "reasoning",
      language: "typescript",
      context: []
    }
  })
  if (result.state.lifecycle !== "active") throw new Error("fixture did not start")
  return result.state
}

function props(overrides: Partial<CommandRailProps> = {}): CommandRailProps {
  return {
    session: createIdleInterviewSession(),
    mode: "coding",
    onModeChange: vi.fn(),
    onStart: vi.fn(),
    onRecord: vi.fn(),
    onScreenshot: vi.fn(),
    onChat: vi.fn(),
    onSubmit: vi.fn(),
    onHotKeys: vi.fn(),
    onReset: vi.fn(),
    onWorkspace: vi.fn(),
    contextLabel: "Full context",
    canSubmit: true,
    ...overrides
  }
}

describe("CommandRail", () => {
  it("renders exact pre-session and active controls", () => {
    const { rerender } = render(<CommandRail {...props()} />)
    expect(screen.getAllByRole("radio")).toHaveLength(3)
    expect(screen.getByRole("button", { name: "Start interview" })).toBeVisible()
    expect(screen.getByRole("button", { name: "HotKeys" })).toBeVisible()

    rerender(<CommandRail {...props({ session: activeSession() })} />)
    for (const name of [
      "Record",
      "Screenshot",
      "Chat",
      "Submit",
      "HotKeys"
    ]) {
      expect(screen.getByRole("button", { name })).toBeVisible()
    }
    fireEvent.click(screen.getByText("More"))
    expect(screen.getByRole("button", { name: "Workspace" })).toBeVisible()
    expect(screen.getByRole("button", { name: "Reset" })).toBeVisible()
    expect(screen.getByLabelText("Context: Full context")).toBeVisible()
  })

  it("supports arrow-key mode selection without hiding any mode", () => {
    const onModeChange = vi.fn()
    render(<CommandRail {...props({ onModeChange })} />)

    fireEvent.keyDown(screen.getByRole("radio", { name: "Coding" }), {
      key: "ArrowRight"
    })

    expect(onModeChange).toHaveBeenCalledWith("system-design")
    expect(screen.getAllByRole("radio")).toHaveLength(3)
  })
})
