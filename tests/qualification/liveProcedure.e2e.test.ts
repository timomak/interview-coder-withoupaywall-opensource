import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { describe, expect, it } from "vitest"
import {
  LiveQualificationProcedure,
  REMOTE_OBSERVER_RECEIPT_DOMAIN
} from "../../electron/qualification/liveProcedure"
import { validateQualificationBundle } from "../../electron/qualification/artifactValidator"
import { QualificationCollector } from "../../electron/qualification/collector"
import * as protocol from "../../electron/qualification/protocol"
import { BUNDLE_MEMBER_PATHS, EVIDENCE_MEMBER_PATHS, sha256 } from "../../electron/qualification/protocol"
import { finalizeQualificationRun } from "../../scripts/qualification/qualify-meet.mjs"
import { createTestTrust, createValidBundle, signedEnvelope } from "./testSupport"

describe("executable Meet qualification procedure", () => {
  it("requires signed remote start/stop, starts the clock after ack, and seals only a complete bundle", () => {
    let now = Date.parse("2026-07-31T12:00:00.000Z")
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ic-live-"))
    const trust = createTestTrust()
    const procedure = new LiveQualificationProcedure(root, trust.matrix, () => now, () => "12345678-1234-4123-8123-123456789abc")
    const session = procedure.begin("entire-display", "matrix-2026-07-31", "arm64-primary")
    expect(() => procedure.sample(0, 0)).toThrow("Signed remote observer start")
    now += 60_000
    const common = {
      schemaVersion: 1, runId: session.runId, scope: session.scope, tupleId: session.tupleId,
      pairingChallengeSha256: session.pairingChallengeSha256,
      observerId: "remote-observer-identity-0001", keyId: "remote-observer-key-01",
      remoteHelperSha256: "5".repeat(64), meetBuildId: "meet-web-2026-07-31",
      recordingSessionId: "remote-recording-session-0001", receivedPresentation: true
    }
    const start = signedEnvelope({
      ...common, kind: "qualification-remote-observer-start", at: new Date(now).toISOString()
    }, trust.privateKeys["remote-observer-key-01"], REMOTE_OBSERVER_RECEIPT_DOMAIN)
    const wrongHelper = signedEnvelope({
      ...common,
      remoteHelperSha256: "6".repeat(64),
      kind: "qualification-remote-observer-start",
      at: new Date(now).toISOString()
    }, trust.privateKeys["remote-observer-key-01"], REMOTE_OBSERVER_RECEIPT_DOMAIN)
    expect(() => procedure.acknowledgeObserver(wrongHelper as { payload: unknown; signature: unknown })).toThrow("invalid")
    procedure.acknowledgeObserver(start as { payload: unknown; signature: unknown })
    expect(() => procedure.acknowledgeObserver(start as { payload: unknown; signature: unknown })).toThrow("already consumed")
    for (let frame = 0; frame < 480; frame += 1) {
      now += 250
      procedure.sample(frame, Math.floor(frame / 2))
    }
    const recording = Buffer.from("independent remote device recording")
    const stop = signedEnvelope({
      ...common, kind: "qualification-remote-observer-stop", at: new Date(now).toISOString(),
      recordingSha256: sha256(recording), recordingBytes: String(recording.length)
    }, trust.privateKeys["remote-observer-key-01"], REMOTE_OBSERVER_RECEIPT_DOMAIN)
    const result = procedure.finishRaw(stop as { payload: unknown; signature: unknown }, recording)
    expect(result.state).toBe("awaiting-analysis-and-attestations")
    expect(fs.readFileSync(path.join(result.rawRoot, "raw/local-marker-events.ndjson"), "utf8").split("\n")).toHaveLength(481)
    expect(fs.readFileSync(path.join(result.rawRoot, "raw/remote-observer-events.ndjson"), "utf8")).toContain("observer-stop")
    expect(fs.readFileSync(path.join(result.rawRoot, "raw/remote-observer.mov"))).toEqual(recording)
    expect(() => procedure.sealBundle(result.runId, new Map())).toThrow("Complete analyzed evidence")

    const fixture = createValidBundle()
    const generated = new Set(["raw/local-marker-events.ndjson", "raw/local-control-events.ndjson", "raw/remote-observer-events.ndjson", "raw/remote-observer.mov"])
    const external = new Map<string, Buffer>()
    for (const member of [...EVIDENCE_MEMBER_PATHS, ...BUNDLE_MEMBER_PATHS, "bundle-manifest.json"]) {
      if (!generated.has(member)) external.set(member, fixture.files.get(member)!)
    }
    const sealed = procedure.sealBundle(result.runId, external)
    expect(sealed.size).toBe(EVIDENCE_MEMBER_PATHS.length + BUNDLE_MEMBER_PATHS.length + 1)
    expect(() => fs.writeFileSync(path.join(result.rawRoot, "raw/local-marker-events.ndjson"), "changed")).toThrow()
  })

  it("prevalidates a fixed production inbox before sealing the raw run", () => {
    const checkout = fs.mkdtempSync(path.join(os.tmpdir(), "ic-finalize-"))
    const fixture = createValidBundle()
    const entry = fixture.matrix.entries[0] as Record<string, unknown>
    const procedure = "M01" as const
    const runRoot = path.join(
      checkout,
      ".artifacts/qualification",
      fixture.matrix.matrixRevision,
      String(entry.tupleId),
      procedure,
      fixture.identity.runId
    )
    const externalRoot = path.join(
      checkout,
      ".artifacts/qualification-external",
      fixture.matrix.matrixRevision,
      String(entry.tupleId),
      procedure,
      fixture.identity.runId
    )
    const generated = new Set([
      "raw/local-marker-events.ndjson",
      "raw/local-control-events.ndjson",
      "raw/remote-observer-events.ndjson",
      "raw/remote-observer.mov"
    ])
    for (const relative of [...EVIDENCE_MEMBER_PATHS, ...BUNDLE_MEMBER_PATHS, "bundle-manifest.json"]) {
      if (generated.has(relative)) continue
      const destination = path.join(externalRoot, relative)
      fs.mkdirSync(path.dirname(destination), { recursive: true })
      fs.writeFileSync(destination, fixture.files.get(relative)!)
    }
    const rawCollector = new QualificationCollector(runRoot)
    for (const relative of generated) {
      rawCollector.create(relative, fixture.files.get(relative)!)
      rawCollector.freeze(relative)
    }
    fs.writeFileSync(path.join(externalRoot, "independent-review.json"), fixture.review)
    const pinned = {
      expectedRcSha: fixture.identity.expectedRcSha,
      matrix: fixture.matrix,
      statementPayload: {
        appSemver: fixture.releaseBinding.appSemver,
        packages: [{ architecture: entry.architecture, ...fixture.releaseBinding }]
      }
    }
    const runtime = { LiveQualificationProcedure, validateQualificationBundle, protocol }
    const reviewPath = path.join(externalRoot, "independent-review.json")
    const hostileHardlink = path.join(externalRoot, "independent-review-hardlink.json")
    fs.linkSync(reviewPath, hostileHardlink)
    expect(() => finalizeQualificationRun(
      checkout,
      pinned,
      entry,
      "entire-display",
      procedure,
      runtime
    )).toThrow("external member is unsafe")
    fs.unlinkSync(hostileHardlink)
    expect(fs.existsSync(path.join(runRoot, "collection.json"))).toBe(false)

    const wrongMatrix = {
      ...fixture.matrix,
      entries: [{ ...entry, remoteHelperSha256: "6".repeat(64) }]
    }
    expect(() => finalizeQualificationRun(
      checkout,
      { ...pinned, matrix: wrongMatrix },
      wrongMatrix.entries[0],
      "entire-display",
      procedure,
      runtime
    )).toThrow("Qualification collection did not pass")
    expect(fs.existsSync(path.join(runRoot, "collection.json"))).toBe(false)

    finalizeQualificationRun(
      checkout,
      pinned,
      entry,
      "entire-display",
      procedure,
      runtime
    )
    expect(fs.existsSync(`${runRoot}.collector-state/finalized.json`)).toBe(true)
    expect(fs.readFileSync(path.join(runRoot, "collection.json"))).toEqual(fixture.files.get("collection.json"))
  })
})
