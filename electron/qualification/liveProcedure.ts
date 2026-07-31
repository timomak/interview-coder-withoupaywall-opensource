import crypto from "node:crypto"
import path from "node:path"
import { QualificationCollector } from "./collector"
import {
  BUNDLE_MEMBER_PATHS,
  EVIDENCE_MEMBER_PATHS,
  ROLE_ATTESTATION_DOMAIN,
  canonicalJson,
  requireClosedObject,
  sha256,
  verifyEnvelope,
  type QualificationMatrix
} from "./protocol"
import type { CaptureScope } from "../privacy/verificationRecord"

export const REMOTE_OBSERVER_RECEIPT_DOMAIN =
  `${ROLE_ATTESTATION_DOMAIN}remote-helper-receipt\n`

export interface LiveProcedureSession {
  readonly runId: string
  readonly scope: CaptureScope
  readonly tupleId: string
  readonly seed: string
  readonly pairingChallenge: string
  readonly pairingChallengeSha256: string
  readonly minimumDurationMs: 120000
}

export interface RemoteObserverReceipt {
  readonly payload: unknown
  readonly signature: unknown
}

interface Sample {
  readonly at: string
  readonly monotonicNs: string
  readonly markerFrame: string
  readonly controlFrame: string
  readonly quadrant: string
  readonly color: string
}

interface ObserverStart {
  readonly observerId: string
  readonly keyId: string
  readonly remoteHelperSha256: string
  readonly meetBuildId: string
  readonly recordingSessionId: string
  readonly at: string
}

const START_KEYS = [
  "schemaVersion", "kind", "runId", "scope", "tupleId", "pairingChallengeSha256",
  "observerId", "keyId", "remoteHelperSha256", "meetBuildId", "recordingSessionId",
  "receivedPresentation", "at"
] as const
const STOP_KEYS = [
  "schemaVersion", "kind", "runId", "scope", "tupleId", "pairingChallengeSha256",
  "observerId", "keyId", "remoteHelperSha256", "meetBuildId", "recordingSessionId",
  "recordingSha256", "recordingBytes", "receivedPresentation", "at"
] as const

export class LiveQualificationProcedure {
  private session?: LiveProcedureSession
  private observedAt = 0
  private samples: Sample[] = []
  private observer?: ObserverStart
  private pairingConsumed = false

  constructor(
    private readonly artifactRoot: string,
    private readonly matrix: QualificationMatrix,
    private readonly now: () => number = () => Date.now(),
    private readonly random: () => string = () => crypto.randomUUID()
  ) {}

  begin(scope: CaptureScope, matrixRevision: string, tupleId: string): LiveProcedureSession {
    if (this.session) throw new Error("A qualification procedure is already active")
    if (matrixRevision !== this.matrix.matrixRevision || !this.matrix.entries.some((item) => item.tupleId === tupleId)) {
      throw new Error("Pinned qualification tuple is invalid")
    }
    const runId = this.random()
    const seed = sha256(`${matrixRevision}${tupleId}${scope}`)
    const pairingChallenge = crypto.randomBytes(32).toString("base64url")
    this.session = {
      runId, scope, tupleId, seed, pairingChallenge,
      pairingChallengeSha256: sha256(pairingChallenge), minimumDurationMs: 120000
    }
    this.observedAt = 0
    this.samples = []
    this.observer = undefined
    this.pairingConsumed = false
    return this.session
  }

  private remotePayload(receipt: RemoteObserverReceipt, phase: "start" | "stop"): Record<string, unknown> {
    if (!this.session) throw new Error("Qualification procedure is inactive")
    const payload = verifyEnvelope(
      receipt,
      this.matrix,
      REMOTE_OBSERVER_RECEIPT_DOMAIN,
      "qualification-role-attestation",
      "remote-observer"
    )
    requireClosedObject(payload, phase === "start" ? START_KEYS : STOP_KEYS, `remote observer ${phase} receipt`)
    const matrixEntry = this.matrix.entries.find((item) => item.tupleId === this.session!.tupleId)!
    if (
      payload.schemaVersion !== 1 || payload.kind !== `qualification-remote-observer-${phase}` ||
      payload.runId !== this.session.runId || payload.scope !== this.session.scope ||
      payload.tupleId !== this.session.tupleId ||
      payload.pairingChallengeSha256 !== this.session.pairingChallengeSha256 ||
      payload.meetBuildId !== matrixEntry.meetBuildId || payload.receivedPresentation !== true ||
      !/^[a-z0-9][a-z0-9-]{15,63}$/.test(String(payload.observerId)) ||
      !/^[0-9a-f]{64}$/.test(String(payload.remoteHelperSha256)) ||
      !/^[a-z0-9][a-z0-9-]{15,63}$/.test(String(payload.recordingSessionId)) ||
      Number.isNaN(Date.parse(String(payload.at)))
    ) throw new Error(`Independent observer ${phase} receipt is invalid`)
    return payload
  }

  acknowledgeObserver(receipt: RemoteObserverReceipt): { readonly meetBuildId: string } {
    if (!this.session || this.pairingConsumed) throw new Error("Pairing challenge is absent or already consumed")
    const payload = this.remotePayload(receipt, "start")
    this.pairingConsumed = true
    this.observedAt = this.now()
    this.observer = {
      observerId: String(payload.observerId), keyId: String(payload.keyId),
      remoteHelperSha256: String(payload.remoteHelperSha256), meetBuildId: String(payload.meetBuildId),
      recordingSessionId: String(payload.recordingSessionId), at: String(payload.at)
    }
    return { meetBuildId: this.observer.meetBuildId }
  }

  sample(markerFrame: number, controlFrame: number): void {
    if (!this.session || !this.observer) throw new Error("Signed remote observer start is required")
    if (markerFrame !== this.samples.length || controlFrame !== Math.floor(markerFrame / 2)) {
      throw new Error("Marker/control frame continuity is invalid")
    }
    const colors = ["#FF00FF", "#00FFFF", "#A6FF00", "#000000"]
    const quadrants = ["top-left", "top-right", "bottom-right", "bottom-left"]
    const elapsed = this.now() - this.observedAt
    this.samples.push({
      at: new Date(this.now()).toISOString(), monotonicNs: String(BigInt(elapsed) * 1_000_000n),
      markerFrame: String(markerFrame), controlFrame: String(controlFrame),
      quadrant: quadrants[Math.floor(elapsed / 15000) % quadrants.length],
      color: colors[markerFrame % colors.length]
    })
  }

  finishRaw(receipt: RemoteObserverReceipt, remoteRecording: Buffer): {
    readonly runId: string
    readonly rawRoot: string
    readonly state: "awaiting-analysis-and-attestations"
  } {
    if (!this.session || !this.observer) throw new Error("Signed remote observer start is required")
    const stop = this.remotePayload(receipt, "stop")
    const elapsed = this.now() - this.observedAt
    if (
      elapsed < 120000 || this.samples.length < 480 ||
      stop.observerId !== this.observer.observerId || stop.keyId !== this.observer.keyId ||
      stop.remoteHelperSha256 !== this.observer.remoteHelperSha256 ||
      stop.recordingSessionId !== this.observer.recordingSessionId ||
      stop.recordingSha256 !== sha256(remoteRecording) || stop.recordingBytes !== String(remoteRecording.length) ||
      remoteRecording.length === 0
    ) throw new Error("Continuous remote observation or recording proof is invalid")
    const runRoot = path.join(this.artifactRoot, this.session.runId)
    const collector = new QualificationCollector(runRoot)
    const marker = this.samples.map((sample, sequence) => canonicalJson({
      schemaVersion: 1, sequence: String(sequence), at: sample.at,
      monotonicNs: sample.monotonicNs, frameId: sample.markerFrame, eventType: "marker-render",
      payload: { seed: this.session!.seed, frame: sample.markerFrame, quadrant: sample.quadrant, color: sample.color, sizePixels: "256" }
    })).join("\n") + "\n"
    const controls = this.samples.filter((_, index) => index % 2 === 0).map((sample, sequence) => canonicalJson({
      schemaVersion: 1, sequence: String(sequence), at: sample.at,
      monotonicNs: sample.monotonicNs, frameId: sample.controlFrame, eventType: "control-render",
      payload: { seed: this.session!.seed, frame: sample.controlFrame, checkerIndex: String(sequence % 64), counter: sample.controlFrame }
    })).join("\n") + "\n"
    const observer = [
      { ...this.observer, kind: "observer-pairing", sequence: "0", monotonicNs: "0", recordingSha256: undefined },
      { observerId: stop.observerId, remoteHelperSha256: stop.remoteHelperSha256, meetBuildId: stop.meetBuildId,
        recordingSessionId: stop.recordingSessionId, kind: "observer-stop", sequence: "1",
        at: stop.at, monotonicNs: String(BigInt(elapsed) * 1_000_000n),
        recordingSha256: stop.recordingSha256, recordingBytes: stop.recordingBytes }
    ].map((event) => canonicalJson({
      schemaVersion: 1, sequence: event.sequence, at: event.at, monotonicNs: event.monotonicNs,
      frameId: event.sequence, eventType: event.kind,
      payload: Object.fromEntries(Object.entries({
        observerId: event.observerId, pairingChallengeSha256: this.session!.pairingChallengeSha256,
        receivedPresentation: true, remoteHelperSha256: event.remoteHelperSha256,
        meetBuildId: event.meetBuildId, recordingSessionId: event.recordingSessionId,
        recordingSha256: event.recordingSha256, recordingBytes: "recordingBytes" in event ? event.recordingBytes : undefined
      }).filter(([, value]) => value !== undefined))
    })).join("\n") + "\n"
    for (const [relative, bytes] of [
      ["raw/local-marker-events.ndjson", Buffer.from(marker)],
      ["raw/local-control-events.ndjson", Buffer.from(controls)],
      ["raw/remote-observer-events.ndjson", Buffer.from(observer)],
      ["raw/remote-observer.mov", remoteRecording]
    ] as const) {
      collector.create(relative, bytes)
      collector.freeze(relative)
    }
    const result = { runId: this.session.runId, rawRoot: runRoot, state: "awaiting-analysis-and-attestations" as const }
    this.session = undefined
    return result
  }

  sealBundle(runId: string, externallyProduced: ReadonlyMap<string, Buffer>): ReadonlyMap<string, Buffer> {
    const runRoot = path.join(this.artifactRoot, runId)
    const collector = new QualificationCollector(runRoot)
    const generated = new Set([
      "raw/local-marker-events.ndjson", "raw/local-control-events.ndjson",
      "raw/remote-observer-events.ndjson", "raw/remote-observer.mov"
    ])
    const exact = [...EVIDENCE_MEMBER_PATHS, ...BUNDLE_MEMBER_PATHS, "bundle-manifest.json"]
    const requiredExternal = exact.filter((member) => !generated.has(member))
    if (
      externallyProduced.size !== requiredExternal.length ||
      requiredExternal.some((member) => !externallyProduced.has(member))
    ) throw new Error("Complete analyzed evidence and signed attestations are required")
    for (const member of requiredExternal) {
      collector.create(member, externallyProduced.get(member)!)
      collector.freeze(member)
    }
    return collector.finish(exact)
  }
}
