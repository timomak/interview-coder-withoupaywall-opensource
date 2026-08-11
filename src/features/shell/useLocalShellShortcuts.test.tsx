import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { useLocalShellShortcuts } from "./useLocalShellShortcuts"

describe("local shell shortcuts", () => {
  it("keeps every advertised app shortcut active from editable controls", () => {
    const onSettings = vi.fn()
    const onHotKeys = vi.fn()
    const onStart = vi.fn()

    function Harness() {
      useLocalShellShortcuts({
        lifecycle: "idle",
        onSettings,
        onHotKeys,
        onStart
      })
      return <input aria-label="Focused editor" />
    }

    render(<Harness />)
    const editor = screen.getByRole("textbox", { name: "Focused editor" })
    editor.focus()

    fireEvent.keyDown(editor, { key: ",", metaKey: true })
    fireEvent.keyDown(editor, { key: "/", metaKey: true })
    fireEvent.keyDown(editor, { key: "Enter", metaKey: true })

    expect(onSettings).toHaveBeenCalledOnce()
    expect(onHotKeys).toHaveBeenCalledOnce()
    expect(onStart).toHaveBeenCalledOnce()
  })
})
