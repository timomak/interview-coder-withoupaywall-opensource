import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { MeetVerification } from "./MeetVerification"

describe("guided Google Meet verification", () => {
  it("guides only qualified scopes with remote confirmation", () => {
    const confirmed = vi.fn()
    render(<MeetVerification state="Not verified" onRemoteConfirmation={confirmed} />)
    expect(screen.getByText(/local preview never counts/i)).toBeTruthy()
    expect(screen.queryByText(/test my setup/i)).toBeNull()
    expect(screen.getByText(/browser-tab sharing.*outside/i)).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Begin guided check" }))
    expect(screen.getByText(/Your entire screen/)).toBeTruthy()
    const record = screen.getByRole("button", { name: "Record remote confirmation" })
    expect(record).toBeDisabled()
    fireEvent.click(
      screen.getByRole("checkbox", { name: /Independent remote observer/ })
    )
    fireEvent.click(record)
    expect(confirmed).toHaveBeenCalledWith("entire-display")

    fireEvent.click(screen.getByRole("radio", { name: "Specific window" }))
    fireEvent.click(screen.getByRole("button", { name: "Begin guided check" }))
    expect(screen.getByText(/Qualification Control/)).toBeTruthy()
    expect(screen.queryByText(/Your entire screen/)).toBeNull()
  })
})
