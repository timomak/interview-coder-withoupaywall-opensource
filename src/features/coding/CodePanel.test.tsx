import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { CodePanel } from "./CodePanel"

describe("CodePanel", () => {
  it("exposes only approved read-only actions", () => {
    const onAction = vi.fn()
    render(<CodePanel code="const value = 42" onAction={onAction} />)
    expect(
      screen.getAllByRole("button").map((button) => button.textContent)
    ).toEqual(["Copy", "Regenerate", "Explain"])
    expect(
      screen.queryByRole("button", { name: /edit|run|terminal|test/i })
    ).toBeNull()
    expect(
      screen.getByRole("article", { name: "Code" }).querySelector("textarea")
    ).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Copy" }))
    expect(onAction).toHaveBeenCalledWith("copy")
  })

  it("strips markdown fences from the rendered code", () => {
    render(
      <CodePanel
        code={"```python\ndef solve():\n    pass\n```"}
        onAction={vi.fn()}
      />
    )
    const code = screen.getByRole("article", { name: "Code" })
    expect(code).toHaveTextContent("def solve()")
    expect(code.textContent).not.toContain("```")
  })
})
