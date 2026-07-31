import { describe, expect, it } from "vitest"
import { validateArchitectureGraph } from "../../../src/features/system-design/architectureSchema"

describe("vendor-neutral architecture vocabulary", () => {
  it("keeps providers in secondary detail examples only", () => {
    const graph = {
      nodes: [
        {
          id: "object-store",
          type: "datastore" as const,
          label: "Object storage",
          detail: "S3 or equivalent is a secondary implementation example."
        }
      ],
      edges: []
    }
    expect(validateArchitectureGraph(graph)).toEqual([])
    expect(graph.nodes[0].label).not.toMatch(/S3|AWS/)
    expect(graph.nodes[0].detail).toMatch(/S3/)
  })
})
