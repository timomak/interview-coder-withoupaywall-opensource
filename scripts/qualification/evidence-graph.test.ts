import { describe, expect, it } from "vitest"
import { qualificationEvidenceGraph } from "../../electron/qualification/protocol"

describe("qualification evidence graph", () => {
  it("proves the exact sixteen-node twenty-eight-edge graph is acyclic", () => {
    const graph = qualificationEvidenceGraph()
    expect(graph.nodes).toHaveLength(16)
    expect(graph.edges).toHaveLength(28)
    expect(graph.topologicalOrder).toHaveLength(16)
    expect(new Set(graph.topologicalOrder)).toEqual(new Set(graph.nodes))
    for (const [from, to] of graph.edges) {
      expect(graph.topologicalOrder.indexOf(from)).toBeLessThan(
        graph.topologicalOrder.indexOf(to)
      )
    }
  })
})
