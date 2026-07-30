import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { createRef } from "react"
import { describe, expect, it, vi } from "vitest"
import { DEFAULT_SHORTCUT_BINDINGS } from "../../shared/shell"
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
})
