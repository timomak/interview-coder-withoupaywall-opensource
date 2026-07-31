import { describe, expect, it } from "vitest"
import { validateMaterialCalculations } from "../../../src/features/system-design/estimates"

describe("material System Design estimates", () => {
  it("validates bounded material calculations", () => {
    expect(
      validateMaterialCalculations([
        { name: "write traffic", expression: "10m / 86400", result: 116, unit: "writes/s", assumption: "10m daily writes" },
        { name: "storage", expression: "10m * 2kb * 365", result: 7.3, unit: "TB/year", assumption: "2KB per record" }
      ])
    ).toEqual([])
    expect(validateMaterialCalculations([])).toContain(
      "Estimate requires 2-4 material calculations"
    )
  })
})
