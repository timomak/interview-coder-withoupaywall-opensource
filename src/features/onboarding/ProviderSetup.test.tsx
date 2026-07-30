import { fireEvent, render, screen } from "@testing-library/react"
import { ProviderSetup } from "./ProviderSetup"

describe("provider onboarding", () => {
  it("completes provider-only onboarding", () => {
    const onComplete = vi.fn()
    const getUserMedia = vi.fn()
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia }
    })
    render(
      <ProviderSetup
        diagnostics={[
          {
            provider: "claude-code",
            installed: true,
            authenticated: true,
            supported: true,
            version: "2.1.220"
          },
          {
            provider: "codex",
            installed: true,
            authenticated: false,
            supported: true,
            reason: "Sign in first"
          }
        ]}
        onComplete={onComplete}
      />
    )

    const claude = screen.getByRole("radio", { name: "Use Claude Code" })
    const codex = screen.getByRole("radio", { name: "Use Codex" })
    expect(codex).toBeDisabled()
    fireEvent.click(claude)
    fireEvent.click(screen.getByRole("radio", { name: "Reasoning" }))
    const start = screen.getByRole("button", { name: "Start Interview" })
    start.focus()
    fireEvent.keyDown(start, { key: "Enter" })
    fireEvent.click(start)

    expect(onComplete).toHaveBeenCalledWith({
      provider: "claude-code",
      model: "sonnet",
      responseMode: "reasoning",
      effort: "high"
    })
    expect(getUserMedia).not.toHaveBeenCalled()
  })
})
