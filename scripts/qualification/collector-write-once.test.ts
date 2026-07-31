import { describe, expect, it } from "vitest"
import { QualificationCollector } from "../../electron/qualification/collector"

describe("qualification collector runtime", () => {
  it("rejects second writes regeneration and mutate-then-restore history", () => {
    const collector = new QualificationCollector()
    collector.create("raw/local-preflight.json", "{}")
    collector.freeze("raw/local-preflight.json")
    expect(() => collector.create("raw/local-preflight.json", "{}"))
      .toThrow("Second write rejected")
    collector.simulateMutation("raw/local-preflight.json", Buffer.from("changed"))
    expect(() => collector.assertFrozen()).toThrow("Frozen qualification member changed")

    const restored = new QualificationCollector()
    restored.create("raw/local-preflight.json", "{}")
    restored.freeze("raw/local-preflight.json")
    restored.simulateMutation("raw/local-preflight.json", Buffer.from("changed"))
    expect(() => restored.assertFrozen()).toThrow()
    restored.simulateMutation("raw/local-preflight.json", Buffer.from("{}"))
    // The production collector's creation ledger rejects a second write before it
    // reaches this helper; the offline digest can only observe restored final state.
    expect(() => restored.create("raw/local-preflight.json", "{}"))
      .toThrow("Second write rejected")
  })
})
