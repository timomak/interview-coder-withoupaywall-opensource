import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { QualificationCollector } from "../../electron/qualification/collector"

describe("qualification collector runtime", () => {
  it("persists first-touch recovery and rejects replay or final mutation", () => {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), "ic-collector-"))
    const runRoot = path.join(parent, "run")
    const first = new QualificationCollector(runRoot)
    first.reserveForRecovery("raw/local-preflight.json", "{}")

    // A new process can finish the exact bytes after interruption, but neither
    // different bytes nor a second logical create can reuse the reservation.
    const resumed = new QualificationCollector(runRoot)
    resumed.recover("raw/local-preflight.json", "{}")
    expect(() => resumed.recover("raw/local-preflight.json", "changed"))
      .toThrow("disagree with first touch")
    expect(() => resumed.create("raw/local-preflight.json", "{}"))
      .toThrow("Second write rejected")
    resumed.freeze("raw/local-preflight.json")

    fs.writeFileSync(path.join(runRoot, "raw/local-preflight.json"), "changed")
    expect(() => resumed.assertFrozen()).toThrow("Frozen qualification member changed")
    fs.writeFileSync(path.join(runRoot, "raw/local-preflight.json"), "{}")
    const result = resumed.finish(["raw/local-preflight.json"])
    expect(result.get("raw/local-preflight.json")?.toString()).toBe("{}")
    expect(() => resumed.create("raw/other.json", "{}"))
      .toThrow("already finalized")
  })
})
