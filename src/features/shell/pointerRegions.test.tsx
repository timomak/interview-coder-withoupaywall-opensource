import { fireEvent, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { PointerRegions } from "./PointerRegions"

describe("pointer regions", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("separates passthrough drag and controls", () => {
    const setWindowPointerEvents = vi.fn(() => Promise.resolve({ success: true }))
    Object.defineProperty(window, "electronAPI", {
      configurable: true,
      value: { setWindowPointerEvents }
    })
    const { container, unmount } = render(
      <>
        <PointerRegions />
        <div data-testid="transparent">
          <button data-interactive>Control</button>
        </div>
      </>
    )

    fireEvent.pointerOver(container.querySelector("[data-testid=transparent]")!)
    expect(setWindowPointerEvents).toHaveBeenLastCalledWith(true, true)
    fireEvent.pointerOver(container.querySelector("button")!)
    expect(setWindowPointerEvents).toHaveBeenLastCalledWith(false, true)

    unmount()
    expect(setWindowPointerEvents).toHaveBeenLastCalledWith(false, false)
  })
})
