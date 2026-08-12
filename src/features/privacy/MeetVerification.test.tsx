import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { MeetVerification } from "./MeetVerification"

describe("guided Google Meet verification", () => {
  it("guides only qualified scopes with remote confirmation", async () => {
    const begin = vi.fn().mockResolvedValue({
      runId: "12345678-1234-4123-8123-123456789abc",
      scope: "entire-display",
      tupleId: "arm64-primary",
      seed: "a".repeat(64),
      pairingChallenge: "one-time-challenge",
      pairingChallengeSha256: "b".repeat(64),
      minimumDurationMs: 120000
    })
    render(<MeetVerification state="Not verified" begin={begin} sample={vi.fn()} acknowledge={vi.fn()} complete={vi.fn()} />)
    expect(screen.getByText(/local preview never counts/i)).toBeTruthy()
    expect(screen.queryByText(/test my setup/i)).toBeNull()
    expect(screen.getByText(/browser-tab sharing.*outside/i)).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Begin guided check" }))
    expect(await screen.findByText(/Your entire screen/)).toBeTruthy()
    expect(screen.getByLabelText("one-time remote pairing challenge").textContent).toBe("one-time-challenge")
    expect(screen.getByLabelText("Qualification Control")).toBeTruthy()
    expect(screen.queryByRole("checkbox")).toBeNull()
    expect(screen.getByLabelText("Signed remote start receipt")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Finalize signed remote raw collection" })).toBeDisabled()
    expect(screen.getByText(/remains pending until frame analysis/i)).toBeTruthy()
  })
})
