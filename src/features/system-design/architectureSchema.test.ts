import { describe, expect, it } from "vitest"
import { validateArchitectureGraph } from "./architectureSchema"

describe("Architecture schema", () => {
  it("validates safe vendor-neutral graphs", () => {
    expect(
      validateArchitectureGraph({
        nodes: [
          { id: "api", type: "service", label: "API service", detail: "Stateless; Amazon ECS is one secondary example." },
          { id: "store", type: "datastore", label: "Primary datastore", detail: "Durable records." }
        ],
        edges: [{ id: "writes", from: "api", to: "store", label: "writes" }]
      })
    ).toEqual([])
    expect(
      validateArchitectureGraph({
        nodes: [{ id: "aws", type: "service", label: "AWS Lambda", detail: "<script>" }],
        edges: [{ id: "bad", from: "aws", to: "missing", label: "javascript:x" }]
      })
    ).not.toEqual([])
  })
})
