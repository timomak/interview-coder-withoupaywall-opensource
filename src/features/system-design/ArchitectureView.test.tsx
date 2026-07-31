import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { ArchitectureView } from "./ArchitectureView"

describe("ArchitectureView", () => {
  it("exposes only approved read-only interactions", () => {
    render(
      <ArchitectureView
        graph={{
          nodes: [
            { id: "client", type: "client", label: "Client", detail: "Sends requests." },
            { id: "api", type: "service", label: "API", detail: "Handles requests." }
          ],
          edges: [{ id: "calls", from: "client", to: "api", label: "HTTPS" }]
        }}
        onRegenerate={vi.fn()}
      />
    )
    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual([
      "Inspect",
      "Zoom in",
      "Zoom out",
      "Pan",
      "Regenerate"
    ])
    expect(screen.queryByRole("button", { name: /move|rename|add|remove|reconnect|copy|export/i })).toBeNull()
    expect(screen.getByLabelText("Accessible architecture")).toHaveTextContent(
      "Client (client)"
    )
  })
})
