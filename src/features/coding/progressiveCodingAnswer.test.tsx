import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { CodingWorkspace } from "./CodingWorkspace"

describe("progressive Coding answer", () => {
  it("renders concise answer before stable code", () => {
    render(
      <CodingWorkspace
        intent="generate-code"
        sections={[
          { id: "answer", order: 0, body: "Use a hash map.", state: "complete" },
          { id: "plan", order: 1, body: "Two steps; one trade-off; Time O(n), Space O(n)", state: "complete" },
          { id: "code", order: 2, body: "def solve():\\n    pass", state: "partial" }
        ]}
        onIntentChange={vi.fn()}
        onNewQuestion={vi.fn()}
        onCodeAction={vi.fn()}
      />
    )
    const answer = screen.getByRole("article", { name: "Answer" })
    const code = screen.getByRole("article", { name: "Code" })
    expect(
      answer.compareDocumentPosition(code) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
    expect(code).toHaveTextContent("def solve")
  })
})
