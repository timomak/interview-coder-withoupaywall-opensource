import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { CompactComposer } from "./CompactComposer"

describe("CompactComposer", () => {
  it("implements universal submit and focus return", async () => {
    const onSubmit = vi.fn(() => true)
    const onDraftChange = vi.fn()
    const origin = document.createElement("button")
    document.body.append(origin)
    origin.focus()
    const { unmount } = render(
      <CompactComposer
        hasSelectedEvidence={false}
        onDraftChange={onDraftChange}
        onSubmit={onSubmit}
        onClose={vi.fn()}
      />
    )
    const field = screen.getByRole("textbox", { name: "Message" })
    expect(field).toHaveFocus()

    fireEvent.change(field, { target: { value: "first line" } })
    expect(onDraftChange).toHaveBeenLastCalledWith("first line")
    fireEvent.keyDown(field, { key: "Enter" })
    expect(onSubmit).not.toHaveBeenCalled()
    fireEvent.keyDown(field, {
      key: "Enter",
      ctrlKey: true,
      shiftKey: true
    })
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith("first line"))
    expect(onDraftChange).toHaveBeenLastCalledWith("")

    unmount()
    expect(origin).toHaveFocus()
    origin.remove()
  })

  it("does not call the provider route without a message or evidence", async () => {
    const onSubmit = vi.fn(() => true)
    render(
      <CompactComposer
        hasSelectedEvidence={false}
        onSubmit={onSubmit}
        onClose={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole("button", { name: "Send" }))

    expect(onSubmit).not.toHaveBeenCalled()
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Add a message or select evidence"
    )
  })
})
