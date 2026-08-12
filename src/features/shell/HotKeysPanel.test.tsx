import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { createRef } from "react"
import { describe, expect, it, vi } from "vitest"
import {
  DEFAULT_SHORTCUT_BINDINGS,
  SHORTCUT_ACTIONS
} from "../../shared/shell"
import { HotKeysPanel } from "./HotKeysPanel"

describe("HotKeysPanel", () => {
  it("recovers the active map when Reset all cannot persist defaults", async () => {
    const activeBindings = {
      ...DEFAULT_SHORTCUT_BINDINGS,
      record: "Control+Shift+8"
    }
    const getShortcutBindings = vi
      .fn()
      .mockResolvedValueOnce(DEFAULT_SHORTCUT_BINDINGS)
      .mockResolvedValueOnce(activeBindings)
    window.electronAPI = {
      ...window.electronAPI,
      getShortcutBindings,
      resetShortcutBindings: vi.fn().mockRejectedValue(new Error("disk full"))
    }
    render(
      <HotKeysPanel
        returnFocusTo={createRef<HTMLButtonElement>()}
        onClose={vi.fn()}
      />
    )

    const recordBinding = await screen.findByRole("textbox", {
      name: "Record"
    })
    fireEvent.change(recordBinding, {
      target: { value: "Control+Shift+9" }
    })
    fireEvent.click(screen.getByRole("button", { name: "Reset all" }))

    await waitFor(() =>
      expect(
        screen.getByText(
          "Defaults were not restored because preferences could not be saved."
        )
      ).toBeTruthy()
    )
    expect(getShortcutBindings).toHaveBeenCalledTimes(2)
    expect(recordBinding).toHaveValue("Control+Shift+8")
  })

  it("keeps every shortcut action available as a visible control", async () => {
    const invokeShellAction = vi.fn().mockResolvedValue({ success: true })
    window.electronAPI = {
      ...window.electronAPI,
      getShortcutBindings: vi.fn().mockResolvedValue(DEFAULT_SHORTCUT_BINDINGS),
      invokeShellAction
    }
    render(
      <HotKeysPanel
        returnFocusTo={createRef<HTMLButtonElement>()}
        onClose={vi.fn()}
      />
    )

    await screen.findByRole("textbox", { name: "Record" })
    const runButtons = screen.getAllByRole("button", { name: /^Run / })
    expect(runButtons).toHaveLength(SHORTCUT_ACTIONS.length)
    fireEvent.click(screen.getByRole("button", { name: "Run Move window left" }))
    expect(invokeShellAction).toHaveBeenCalledWith("move-left")
  })

  it("does not allow Command or Option shortcuts to be saved", async () => {
    window.electronAPI = {
      ...window.electronAPI,
      getShortcutBindings: vi.fn().mockResolvedValue(DEFAULT_SHORTCUT_BINDINGS)
    }
    render(
      <HotKeysPanel
        returnFocusTo={createRef<HTMLButtonElement>()}
        onClose={vi.fn()}
      />
    )

    const recordBinding = await screen.findByRole("textbox", { name: "Record" })
    fireEvent.change(recordBinding, { target: { value: "Command+Q" } })

    expect(
      screen.getByText("Shortcuts must use the Control+Shift+Key format.")
    ).toBeVisible()
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled()
  })
})
