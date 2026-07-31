import { fireEvent, render, screen } from "@testing-library/react"
import { expect, it, vi } from "vitest"
import { CrashDecision } from "./CrashDecision"

it("offers explicit safe recovery without duplicate archive", () => {
  const resume = vi.fn()
  const reset = vi.fn()
  render(
    <CrashDecision
      recovery={{ available: true, sessionId: "session-1", captureActive: false }}
      onResume={resume}
      onReset={reset}
    />
  )
  expect(screen.getByText("Capture remains off.", { exact: false })).toBeVisible()
  fireEvent.click(screen.getByRole("button", { name: "Resume" }))
  fireEvent.click(screen.getByRole("button", { name: "Reset" }))
  expect(resume).toHaveBeenCalledTimes(1)
  expect(reset).toHaveBeenCalledTimes(1)
})
