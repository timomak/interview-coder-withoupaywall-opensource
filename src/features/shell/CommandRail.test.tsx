import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import {
  createIdleInterviewSession,
  reduceInterviewSession
} from "../../domain/interview"
import { DEFAULT_SHORTCUT_BINDINGS } from "../../shared/shell"
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
    onSettings: vi.fn(),
    onQuit: vi.fn(),
    onReset: vi.fn(),
    onWorkspace: vi.fn(),
    shortcuts: DEFAULT_SHORTCUT_BINDINGS,
    contextLabel: "Full context",
    canSubmit: true,
    ...overrides
  }
}

describe("CommandRail", () => {
  it("renders exact pre-session and active controls", () => {
    const onSettings = vi.fn()
    const onQuit = vi.fn()
    const { rerender } = render(<CommandRail {...props({ onSettings, onQuit })} />)
    expect(screen.getByRole("img", { name: "InterviewCopilot" })).toBeVisible()
    expect(screen.queryByText("InterviewCopilot")).not.toBeInTheDocument()
    expect(screen.queryByText("Prompt")).not.toBeInTheDocument()
    expect(screen.getByRole("combobox", { name: "System prompt" })).toHaveValue(
      "coding"
    )
    expect(screen.getAllByRole("option")).toHaveLength(3)
    expect(screen.getByRole("button", { name: "Start interview" })).toBeVisible()
    expect(screen.getByRole("button", { name: "HotKeys" })).toBeVisible()
    expect(screen.getByRole("button", { name: "Settings" })).toBeVisible()
    expect(screen.getByRole("button", { name: "Quit" })).toBeVisible()
    for (const chip of ["⌃⇧/", "⌃⇧,", "⌃⇧↵", "⌃⇧Q"]) {
      expect(screen.getByText(chip)).toBeVisible()
    }
    fireEvent.click(screen.getByRole("button", { name: "Settings" }))
    expect(onSettings).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole("button", { name: "Quit" }))
    expect(onQuit).toHaveBeenCalledOnce()

    rerender(<CommandRail {...props({ session: activeSession(), onSettings, onQuit })} />)
    for (const name of [
      "Record",
      "Screenshot",
      "Chat",
      "Submit",
      "HotKeys",
      "Settings",
      "Quit"
    ]) {
      expect(screen.getByRole("button", { name })).toBeVisible()
    }
    fireEvent.click(screen.getByText("More"))
    expect(screen.getByRole("button", { name: "Workspace" })).toBeVisible()
    expect(screen.getByRole("button", { name: "Reset" })).toBeVisible()
    expect(screen.getByLabelText("Context: Full context")).toBeVisible()
    for (const chip of ["⌃⇧R", "⌃⇧S", "⌃⇧C", "⌃⇧↵", "⌃⇧⌫"]) {
      expect(screen.getByText(chip)).toBeVisible()
    }
  })

  it("selects one system prompt from the complete dropdown", () => {
    const onModeChange = vi.fn()
    render(<CommandRail {...props({ onModeChange })} />)

    fireEvent.change(screen.getByRole("combobox", { name: "System prompt" }), {
      target: { value: "system-design" }
    })

    expect(onModeChange).toHaveBeenCalledWith("system-design")
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Coding",
      "System Design",
      "Behavioral"
    ])
  })
})
