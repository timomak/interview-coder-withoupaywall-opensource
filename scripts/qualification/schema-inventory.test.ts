import { describe, expect, it } from "vitest"
import { SCHEMA_INVENTORY } from "../../electron/qualification/protocol"

describe("qualification schema inventory", () => {
  it("keeps all thirteen protocol families recursively closed", () => {
    expect(SCHEMA_INVENTORY).toHaveLength(13)
    expect(new Set(SCHEMA_INVENTORY.map((schema) => schema.name)).size).toBe(13)
    for (const schema of SCHEMA_INVENTORY) {
      expect(schema.additionalProperties).toBe(false)
      expect(schema.arraysConstrained).toBe(true)
    }
  })
})
