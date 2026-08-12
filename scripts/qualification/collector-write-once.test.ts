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

    const target = path.join(runRoot, "raw/local-preflight.json")
    fs.chmodSync(target, 0o600)
    fs.writeFileSync(target, "changed")
    fs.writeFileSync(target, "{}")
    fs.chmodSync(target, 0o400)
    expect(() => resumed.assertFrozen()).toThrow("Frozen qualification member changed")

    const cleanRoot = path.join(parent, "clean-run")
    const clean = new QualificationCollector(cleanRoot)
    clean.create("raw/local-preflight.json", "{}")
    clean.freeze("raw/local-preflight.json")
    const result = clean.finish(["raw/local-preflight.json"])
    expect(result.get("raw/local-preflight.json")?.toString()).toBe("{}")
    fs.chmodSync(cleanRoot, 0o700)
    fs.chmodSync(path.join(cleanRoot, "raw"), 0o700)
    fs.unlinkSync(path.join(cleanRoot, "raw/local-preflight.json"))
    expect(() => clean.recover("raw/local-preflight.json", "{}"))
      .toThrow("already finalized")
    expect(() => resumed.create("raw/other.json", "{}"))
      .not.toThrow()
  })
})
