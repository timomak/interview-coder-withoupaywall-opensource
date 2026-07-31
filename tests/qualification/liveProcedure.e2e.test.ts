import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { LiveQualificationProcedure } from "../../electron/qualification/liveProcedure"

describe("executable Meet qualification procedure", () => {
  it("enforces pairing one-shot marker control and 120-second collection", () => {
    let now = Date.parse("2026-07-31T12:00:00.000Z")
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ic-live-"))
    const procedure = new LiveQualificationProcedure(root, () => now, () => "12345678-1234-4123-8123-123456789abc")
    const session = procedure.begin("entire-display", "matrix-2026-07-31", "arm64-primary")
    procedure.acknowledgeObserver({
      pairingChallenge: session.pairingChallenge,
      observerId: "remote-observer-identity-0001",
      receivedPresentation: true
    })
    expect(() => procedure.acknowledgeObserver({
      pairingChallenge: session.pairingChallenge,
      observerId: "remote-observer-identity-0001",
      receivedPresentation: true
    })).toThrow("already consumed")
    for (let frame = 0; frame < 480; frame += 1) {
      now += 250
      procedure.sample(frame, Math.floor(frame / 2))
    }
    const result = procedure.finish()
    expect(fs.readFileSync(path.join(result.rawRoot, "raw/local-marker-events.ndjson"), "utf8").split("\n")).toHaveLength(481)
    expect(fs.readFileSync(path.join(result.rawRoot, "raw/local-control-events.ndjson"), "utf8")).toContain("control-render")
    expect(() => fs.writeFileSync(path.join(result.rawRoot, "raw/local-marker-events.ndjson"), "changed"))
      .toThrow()
  })
})
