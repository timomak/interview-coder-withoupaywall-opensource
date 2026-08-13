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
    promptMenuOpen: false,
    onPromptMenuOpenChange: vi.fn(),
    moreMenuOpen: false,
    onMoreMenuOpenChange: vi.fn(),
    onStart: vi.fn(),
    onRecord: vi.fn(),
    onScreenshot: vi.fn(),
    onChat: vi.fn(),
    onHotKeys: vi.fn(),
    onSettings: vi.fn(),
    onQuit: vi.fn(),
    onReset: vi.fn(),
    onWorkspace: vi.fn(),
    contextLabel: "Full context",
    shortcuts: DEFAULT_SHORTCUT_BINDINGS,
    debugActive: false,
    onDebugToggle: vi.fn(),
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
    expect(
      screen.getByRole("button", { name: "System prompt: Coding" })
    ).toHaveAttribute("aria-expanded", "false")
    expect(screen.getByRole("button", { name: "Start interview" })).toBeVisible()
    expect(screen.getByRole("button", { name: "Settings" })).toBeVisible()
    fireEvent.click(screen.getByRole("button", { name: "Settings" }))
    expect(onSettings).toHaveBeenCalledOnce()
    rerender(<CommandRail {...props({ session: activeSession(), onSettings, onQuit })} />)
    for (const name of [
      "Record",
      "See screen",
      "Chat",
      "Debug",
      "Reset"
    ]) {
      expect(screen.getByRole("button", { name })).toBeVisible()
    }
    expect(
      screen.getByRole("button", { name: "Debug" })
    ).toHaveAttribute("aria-pressed", "false")
    expect(screen.getByLabelText("More session controls")).toBeVisible()
    rerender(
      <CommandRail
        {...props({
          session: activeSession(),
          onSettings,
          onQuit,
          moreMenuOpen: true
        })}
      />
    )
    expect(screen.getByRole("button", { name: "Workspace" })).toBeVisible()
    expect(
      screen.queryByRole("button", { name: "End session" })
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Keyboard shortcuts" })
    ).toBeVisible()
    expect(screen.getByLabelText("Context: Full context")).toBeVisible()
  })

  it("selects one system prompt from the complete dropdown", () => {
    const onModeChange = vi.fn()
    const onPromptMenuOpenChange = vi.fn()
    const { rerender } = render(
      <CommandRail
        {...props({ onModeChange, onPromptMenuOpenChange })}
      />
    )

    fireEvent.click(
      screen.getByRole("button", { name: "System prompt: Coding" })
    )
    expect(onPromptMenuOpenChange).toHaveBeenCalledWith(true)

    rerender(
      <CommandRail
        {...props({
          onModeChange,
          onPromptMenuOpenChange,
          promptMenuOpen: true
        })}
      />
    )
    expect(screen.getByRole("listbox", { name: "System prompts" })).toBeVisible()
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Coding✓",
      "System Design",
      "Behavioral"
    ])
    fireEvent.click(screen.getByRole("option", { name: "System Design" }))

    expect(onModeChange).toHaveBeenCalledWith("system-design")
    expect(onPromptMenuOpenChange).toHaveBeenLastCalledWith(false)
  })
})
