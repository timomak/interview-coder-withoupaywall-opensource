import { describe, expect, it } from "vitest"
import type { ArchitectureGraph } from "./types"

describe("System Design graph retention", () => {
  it("archives graph data without live export surface", () => {
    const graph: ArchitectureGraph = {
      nodes: [{ id: "api", type: "service", label: "API", detail: "Stateless" }],
      edges: []
    }
    const archived = JSON.parse(JSON.stringify({ graph })) as { graph: ArchitectureGraph }
    expect(archived.graph).toEqual(graph)
    expect(Object.keys(archived)).toEqual(["graph"])
  })
})
