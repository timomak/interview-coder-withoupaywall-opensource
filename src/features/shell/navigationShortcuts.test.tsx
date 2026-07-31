import { act, fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { AnswerSections } from "./AnswerSections"
import type { ShortcutAction } from "../../shared/shell"

describe("answer navigation shortcuts", () => {
  it("separates window and answer navigation", () => {
    let shortcut: ((action: ShortcutAction) => void) | undefined
    const scrollBy = vi.fn()
    window.electronAPI = {
      ...window.electronAPI,
      onShellShortcut: (callback) => {
        shortcut = callback
        return () => undefined
      }
    }
    HTMLElement.prototype.scrollBy = scrollBy
    render(
      <AnswerSections
        sections={[
          { id: "answer", order: 0, body: "First", state: "complete" },
          { id: "details", order: 1, body: "Second", state: "complete" }
        ]}
      />
    )

    expect(screen.getByText("First")).toBeTruthy()
    act(() => shortcut?.("section-next"))
    expect(screen.getByText("Second")).toBeTruthy()
    act(() => shortcut?.("section-scroll-down"))
    expect(scrollBy).toHaveBeenCalledWith({ top: 120, behavior: "smooth" })
    act(() => shortcut?.("move-right"))
    expect(screen.getByText("Second")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "answer" }))
    expect(screen.getByText("First")).toBeTruthy()
  })
})
