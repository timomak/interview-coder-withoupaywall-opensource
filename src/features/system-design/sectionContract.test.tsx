import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { SystemDesignWorkspace } from "./SystemDesignWorkspace"
import { SYSTEM_DESIGN_SECTIONS } from "./types"

describe("System Design section contract", () => {
  it("renders fixed progressive design sequence", () => {
    render(
      <SystemDesignWorkspace
        sections={[
          { id: "architecture", order: 2, body: "graph ready", state: "complete" },
          { id: "clarify", order: 0, body: "", state: "partial" }
        ]}
      />
    )
    expect(
      screen.getAllByRole("article").map((article) => article.getAttribute("aria-label"))
    ).toEqual(SYSTEM_DESIGN_SECTIONS)
    expect(screen.getByRole("article", { name: "architecture" })).toHaveTextContent(
      "graph ready"
    )
    expect(screen.getByRole("article", { name: "clarify" })).toHaveAttribute(
      "aria-busy",
      "true"
    )
  })
})
