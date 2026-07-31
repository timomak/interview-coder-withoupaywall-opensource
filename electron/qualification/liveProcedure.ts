import crypto from "node:crypto"
import path from "node:path"
import { QualificationCollector } from "./collector"
import { canonicalJson, sha256 } from "./protocol"
import type { CaptureScope } from "../privacy/verificationRecord"

export interface LiveProcedureSession {
  readonly runId: string
  readonly scope: CaptureScope
  readonly seed: string
  readonly pairingChallenge: string
  readonly pairingChallengeSha256: string
  readonly minimumDurationMs: 120000
}

interface Sample {
  readonly at: string
  readonly monotonicNs: string
  readonly markerFrame: string
  readonly controlFrame: string
  readonly quadrant: string
  readonly color: string
}

export class LiveQualificationProcedure {
  private session?: LiveProcedureSession
  private startedAt = 0
  private samples: Sample[] = []
  private observer?: { readonly observerId: string; readonly at: string }
  private pairingConsumed = false

  constructor(
    private readonly artifactRoot: string,
    private readonly now: () => number = () => Date.now(),
    private readonly random: () => string = () => crypto.randomUUID()
  ) {}

  begin(scope: CaptureScope, matrixRevision: string, tupleId: string): LiveProcedureSession {
    if (this.session) throw new Error("A qualification procedure is already active")
    const runId = this.random()
    const seed = sha256(`${matrixRevision}${tupleId}${scope}`)
    const pairingChallenge = crypto.randomBytes(32).toString("base64url")
    this.session = {
      runId,
      scope,
      seed,
      pairingChallenge,
      pairingChallengeSha256: sha256(pairingChallenge),
      minimumDurationMs: 120000
    }
    this.startedAt = this.now()
    this.samples = []
    this.observer = undefined
    this.pairingConsumed = false
    return this.session
  }

  sample(markerFrame: number, controlFrame: number): void {
    if (!this.session || this.pairingConsumed && !this.observer) throw new Error("Qualification procedure is inactive")
    if (markerFrame !== this.samples.length || controlFrame !== Math.floor(markerFrame / 2)) {
      throw new Error("Marker/control frame continuity is invalid")
    }
    const colors = ["#FF00FF", "#00FFFF", "#A6FF00", "#000000"]
    const quadrants = ["top-left", "top-right", "bottom-right", "bottom-left"]
    const elapsed = this.now() - this.startedAt
    this.samples.push({
      at: new Date(this.now()).toISOString(),
      monotonicNs: String(BigInt(elapsed) * 1_000_000n),
      markerFrame: String(markerFrame),
      controlFrame: String(controlFrame),
      quadrant: quadrants[Math.floor(elapsed / 15000) % quadrants.length],
      color: colors[markerFrame % colors.length]
    })
  }

  acknowledgeObserver(input: {
    readonly pairingChallenge: string
    readonly observerId: string
    readonly receivedPresentation: true
  }): void {
    if (!this.session || this.pairingConsumed) throw new Error("Pairing challenge is absent or already consumed")
    if (
      input.pairingChallenge !== this.session.pairingChallenge ||
      !/^[a-z0-9][a-z0-9-]{15,63}$/.test(input.observerId) ||
      input.receivedPresentation !== true
    ) throw new Error("Independent observer acknowledgement is invalid")
    this.pairingConsumed = true
    this.observer = { observerId: input.observerId, at: new Date(this.now()).toISOString() }
  }

  finish(): { readonly runId: string; readonly rawRoot: string } {
    if (!this.session || !this.observer) throw new Error("Independent observer acknowledgement is required")
    const elapsed = this.now() - this.startedAt
    if (elapsed < 120000 || this.samples.length < 480) throw new Error("A continuous 120-second observation is required")
    const runRoot = path.join(this.artifactRoot, this.session.runId)
    const collector = new QualificationCollector(runRoot)
    const marker = this.samples.map((sample, sequence) => canonicalJson({
      schemaVersion: 1, sequence: String(sequence), at: sample.at,
      monotonicNs: sample.monotonicNs, frameId: sample.markerFrame,
      eventType: "marker-render",
      payload: { seed: this.session!.seed, frame: sample.markerFrame, quadrant: sample.quadrant, color: sample.color, sizePixels: "256" }
    })).join("\n") + "\n"
    const controls = this.samples.filter((_, index) => index % 2 === 0).map((sample, sequence) => canonicalJson({
      schemaVersion: 1, sequence: String(sequence), at: sample.at,
      monotonicNs: sample.monotonicNs, frameId: sample.controlFrame,
      eventType: "control-render",
      payload: { seed: this.session!.seed, frame: sample.controlFrame, checkerIndex: String(sequence % 64), counter: sample.controlFrame }
    })).join("\n") + "\n"
    const observer = canonicalJson({
      schemaVersion: 1, sequence: "0", at: this.observer.at,
      monotonicNs: String(BigInt(elapsed) * 1_000_000n), frameId: "0",
      eventType: "observer-pairing",
      payload: { observerId: this.observer.observerId, pairingChallengeSha256: this.session.pairingChallengeSha256, receivedPresentation: true }
    }) + "\n"
    for (const [relative, bytes] of [
      ["raw/local-marker-events.ndjson", marker],
      ["raw/local-control-events.ndjson", controls],
      ["raw/remote-observer-events.ndjson", observer]
    ] as const) {
      collector.create(relative, bytes)
      collector.freeze(relative)
    }
    collector.finish([
      "raw/local-marker-events.ndjson",
      "raw/local-control-events.ndjson",
      "raw/remote-observer-events.ndjson"
    ])
    const result = { runId: this.session.runId, rawRoot: runRoot }
    this.session = undefined
    return result
  }
}
