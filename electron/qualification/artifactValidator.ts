import {
  BUNDLE_MEMBER_PATHS,
  EVIDENCE_MEMBER_PATHS,
  INDEPENDENT_REVIEW_DOMAIN,
  RELEASE_BUNDLE_DOMAIN,
  ROLE_ATTESTATION_DOMAIN,
  RUN_ID_PATTERN,
  SHA256_PATTERN,
  UINT64_PATTERN,
  UTC_MILLIS_PATTERN,
  canonicalJson,
  parseCanonicalJson,
  requireClosedObject,
  sha256,
  validateManifest,
  verifyEnvelope,
  type QualificationMatrix
} from "./protocol"

export interface QualificationIdentity {
  readonly expectedRcSha: string
  readonly matrixRevision: string
  readonly tupleId: string
  readonly scope: "entire-display" | "specific-window"
  readonly runId: string
}

export interface ReleaseArtifactBinding {
  readonly appSemver: string
  readonly packageSha256: string
  readonly signingTeamId: string
  readonly signingCertificateSha256: string
  readonly notarizationTicketId: string
}

const LOCAL_ACKS = {
  "entire-display": ["preflight-ready", "meet-two-party-confirmed", "personal-content-absent", "entire-display-share-selected", "remote-observation-start-received", "continuous-interval-complete", "presentation-stop-commanded", "raw-streams-finalized"],
  "specific-window": ["preflight-ready", "meet-two-party-confirmed", "personal-content-absent", "specific-window-share-selected", "remote-observation-start-received", "continuous-interval-complete", "presentation-stop-commanded", "raw-streams-finalized"]
} as const
const REMOTE_ACKS = {
  "entire-display": ["recorder-armed", "meet-two-party-confirmed", "entire-display-presentation-received", "presentation-pinned", "control-seed-readable", "observation-start-acknowledged", "continuous-interval-complete", "presentation-stopped", "raw-upload-complete"],
  "specific-window": ["recorder-armed", "meet-two-party-confirmed", "specific-window-presentation-received", "presentation-pinned", "control-seed-readable", "observation-start-acknowledged", "continuous-interval-complete", "presentation-stopped", "raw-upload-complete"]
} as const

const OPTIONAL_BUNDLE_SIGNATURE = "bundle-manifest.sig"
const COLLECTION_KEYS = [
  "schemaVersion", "kind", "rcSha", "procedureId", "matrixRevision", "tupleId",
  "scope", "runId", "app", "environment", "roles", "timestamps", "monotonicNs",
  "marker", "control", "pairingChallengeSha256", "validator", "contentResult",
  "evidenceMembers"
] as const
const IDENTITY_KEYS = ["rcSha", "matrixRevision", "tupleId", "scope", "runId"] as const
const ROLE_ATTESTATION_KEYS = [
  "schemaVersion", "kind", ...IDENTITY_KEYS, "procedureId", "role", "roleId", "keyId",
  "acknowledgements", "observedResult", "deviations", "aborts", "attestedAt",
  "evidenceManifestSha256"
] as const
const METADATA_KEYS = [
  "schemaVersion", "kind", ...IDENTITY_KEYS, "procedureId", "evidenceManifestSha256",
  "localAttestationSha256", "remoteAttestationSha256", "finalizedAt", "retentionDeleteAt",
  "encryptedStoreId"
] as const
const REVIEW_KEYS = [
  "schemaVersion", "kind", ...IDENTITY_KEYS, "bundleManifestSha256", "reviewerId", "keyId",
  "result", "reviewedAt", "reports", "observations"
] as const
const ALLOWED_RUN_PATHS = new Set([
  ...EVIDENCE_MEMBER_PATHS,
  ...BUNDLE_MEMBER_PATHS,
  "bundle-manifest.json",
  OPTIONAL_BUNDLE_SIGNATURE
])

function json(files: ReadonlyMap<string, Buffer>, path: string): unknown {
  const bytes = files.get(path)
  if (!bytes) throw new Error(`Missing qualification member: ${path}`)
  return parseCanonicalJson(bytes)
}

function assertIdentity(payload: Record<string, unknown>, identity: QualificationIdentity): void {
  if (
    payload.rcSha !== identity.expectedRcSha ||
    payload.matrixRevision !== identity.matrixRevision ||
    payload.tupleId !== identity.tupleId ||
    payload.scope !== identity.scope ||
    payload.runId !== identity.runId
  ) throw new Error("Qualification identity binding is invalid")
}

function validateNdjson(
  bytes: Buffer,
  label: string,
  allowedEvents: Readonly<Record<string, readonly string[]>>
): readonly Record<string, unknown>[] {
  const source = new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  if (!source.endsWith("\n") || source.length === 1) throw new Error(`${label} must be nonempty LF-terminated NDJSON`)
  let expectedSequence = 0n
  let previousMonotonic = -1n
  const events: Record<string, unknown>[] = []
  for (const line of source.slice(0, -1).split("\n")) {
    const event = parseCanonicalJson(line)
    requireClosedObject(event, ["schemaVersion", "sequence", "at", "monotonicNs", "frameId", "eventType", "payload"], `${label} event`)
    const payloadKeys = allowedEvents[String(event.eventType)]
    if (!payloadKeys) throw new Error(`${label} event type is invalid`)
    requireClosedObject(event.payload, payloadKeys, `${label} payload`)
    if (
      event.schemaVersion !== 1 || event.sequence !== String(expectedSequence) ||
      !UTC_MILLIS_PATTERN.test(String(event.at)) || !UINT64_PATTERN.test(String(event.monotonicNs)) ||
      !UINT64_PATTERN.test(String(event.frameId)) || BigInt(String(event.monotonicNs)) <= previousMonotonic
    ) throw new Error(`${label} event ordering is invalid`)
    expectedSequence += 1n
    previousMonotonic = BigInt(String(event.monotonicNs))
    events.push(event)
  }
  return events
}

function validateRawAndDerived(
  files: ReadonlyMap<string, Buffer>,
  identity: QualificationIdentity,
  release: ReleaseArtifactBinding
): {
  readonly preflight: Record<string, unknown>
  readonly markerEvents: readonly Record<string, unknown>[]
  readonly controlEvents: readonly Record<string, unknown>[]
  readonly observerEvents: readonly Record<string, unknown>[]
  readonly coverage: Record<string, unknown>
  readonly report: Record<string, unknown>
} {
  const preflight = json(files, "raw/local-preflight.json")
  requireClosedObject(preflight, ["schemaVersion", "kind", ...IDENTITY_KEYS, "packageSha256", "participantCount", "network", "clockSkewMillis", "diskFreeBytes", "permissions", "notificationsDisabled"], "local preflight")
  assertIdentity(preflight, identity)
  requireClosedObject(preflight.network, ["downMbps", "upMbps", "rttMillis", "packetLossPpm"], "preflight network")
  requireClosedObject(preflight.permissions, ["screenRecording", "observerRecording"], "preflight permissions")
  if (
    preflight.schemaVersion !== 1 || preflight.kind !== "qualification-local-preflight" ||
    preflight.participantCount !== "2" || preflight.notificationsDisabled !== true ||
    preflight.packageSha256 !== release.packageSha256 || !SHA256_PATTERN.test(String(preflight.packageSha256)) ||
    !UINT64_PATTERN.test(String(preflight.network.downMbps)) || BigInt(String(preflight.network.downMbps)) < 10n ||
    !UINT64_PATTERN.test(String(preflight.network.upMbps)) || BigInt(String(preflight.network.upMbps)) < 10n ||
    !UINT64_PATTERN.test(String(preflight.network.rttMillis)) || BigInt(String(preflight.network.rttMillis)) > 100n ||
    !UINT64_PATTERN.test(String(preflight.network.packetLossPpm)) || BigInt(String(preflight.network.packetLossPpm)) >= 10000n ||
    !UINT64_PATTERN.test(String(preflight.clockSkewMillis)) || BigInt(String(preflight.clockSkewMillis)) > 2000n ||
    !UINT64_PATTERN.test(String(preflight.diskFreeBytes)) || BigInt(String(preflight.diskFreeBytes)) < 5_368_709_120n ||
    preflight.permissions.screenRecording !== true || preflight.permissions.observerRecording !== true
  ) throw new Error("Local preflight did not pass")

  const markerEvents = validateNdjson(files.get("raw/local-marker-events.ndjson")!, "marker events", {
    "marker-render": ["seed", "frame", "quadrant", "color", "sizePixels"]
  })
  const controlEvents = validateNdjson(files.get("raw/local-control-events.ndjson")!, "control events", {
    "control-render": ["seed", "frame", "checkerIndex", "counter"]
  })
  const observerEvents = validateNdjson(files.get("raw/remote-observer-events.ndjson")!, "observer events", {
    "observer-pairing": ["observerId", "pairingChallengeSha256", "receivedPresentation"],
    "observer-stop": ["observerId", "pairingChallengeSha256", "receivedPresentation"]
  })
  validateNdjson(files.get("derived/frame-analysis.ndjson")!, "frame analysis", {
    "frame-analysis": ["markerDetected", "controlRecognized", "markerContinuityPpm"]
  })

  const coverage = json(files, "derived/control-coverage.json")
  requireClosedObject(coverage, ["schemaVersion", "kind", "seed", "totalFrames", "recognizedFrames", "recognizedPpm", "oneSecondGapCount"], "control coverage")
  if (coverage.schemaVersion !== 1 || coverage.kind !== "qualification-control-coverage" || coverage.oneSecondGapCount !== "0") {
    throw new Error("Control coverage is invalid")
  }
  const report = json(files, "validation/report.json")
  requireClosedObject(report, ["schemaVersion", "kind", ...IDENTITY_KEYS, "result", "markerDetectedFrames", "markerContinuityPpm", "controlRecognizedPpm", "validSharedIntervalFrames"], "content validation report")
  assertIdentity(report, identity)
  if (report.schemaVersion !== 1 || report.kind !== "qualification-content-validation" || report.result !== "pass" || report.markerDetectedFrames !== "0") {
    throw new Error("Content validation report is invalid")
  }
  if ((files.get("raw/remote-observer.mov")?.length ?? 0) === 0) throw new Error("Remote observer video is empty")
  return { preflight, markerEvents, controlEvents, observerEvents, coverage, report }
}

export function validateQualificationBundle(
  files: ReadonlyMap<string, Buffer>,
  independentReviewBytes: Buffer,
  matrix: QualificationMatrix,
  identity: QualificationIdentity,
  release: ReleaseArtifactBinding
): { readonly bundleManifestSha256: string; readonly evidenceManifestSha256: string; readonly reviewedAt: string } {
  if (!RUN_ID_PATTERN.test(identity.runId)) throw new Error("Qualification run ID is invalid")
  for (const path of files.keys()) {
    if (!ALLOWED_RUN_PATHS.has(path)) throw new Error(`Unexpected qualification member: ${path}`)
  }
  for (const path of ALLOWED_RUN_PATHS) {
    if (path !== OPTIONAL_BUNDLE_SIGNATURE && !files.has(path)) {
      throw new Error(`Missing qualification member: ${path}`)
    }
  }
  const raw = validateRawAndDerived(files, identity, release)
  const collection = json(files, "collection.json") as Record<string, unknown>
  requireClosedObject(collection, COLLECTION_KEYS, "qualification collection")
  assertIdentity(collection, identity)
  requireClosedObject(collection.app, ["semver", "commitSha", "packageSha256", "signingTeamId", "signingCertificateSha256", "notarizationTicketId"], "collection app")
  requireClosedObject(collection.environment, ["macOSProductVersion", "macOSBuildVersion", "architecture", "chromeVersion", "meetBuildId", "display"], "collection environment")
  requireClosedObject(collection.environment.display, ["displayId", "type", "pixelWidth", "pixelHeight", "scaleFactor"], "collection display")
  requireClosedObject(collection.roles, ["localOperator", "remoteObserver"], "collection roles")
  requireClosedObject(collection.roles.localOperator, ["roleId", "keyId"], "local operator role")
  requireClosedObject(collection.roles.remoteObserver, ["roleId", "keyId"], "remote observer role")
  requireClosedObject(collection.timestamps, ["startedAt", "shareStartedAt", "shareStoppedAt", "endedAt"], "collection timestamps")
  requireClosedObject(collection.monotonicNs, ["startedAt", "shareStartedAt", "shareStoppedAt", "endedAt"], "collection monotonic times")
  requireClosedObject(collection.marker, ["algorithm", "seed", "cadenceHz", "sizePixels"], "collection marker")
  requireClosedObject(collection.control, ["algorithm", "seed", "cadenceHz", "gridSize"], "collection control")
  requireClosedObject(collection.validator, ["version", "commitSha"], "collection validator")
  requireClosedObject(collection.contentResult, ["result", "markerDetectedFrames", "markerContinuityPpm", "controlRecognizedPpm", "validSharedIntervalFrames"], "collection content result")
  const marker = collection.marker
  const control = collection.control
  const contentResult = collection.contentResult
  const matrixEntry = matrix.entries.find((entry) => entry.tupleId === identity.tupleId)
  if (!matrixEntry) throw new Error("Qualification tuple is absent from pinned matrix")
  const expectedEnvironment = {
    macOSProductVersion: matrixEntry.macOSProductVersion,
    macOSBuildVersion: matrixEntry.macOSBuildVersion,
    architecture: matrixEntry.architecture,
    chromeVersion: matrixEntry.chromeVersion,
    meetBuildId: matrixEntry.meetBuildId,
    display: matrixEntry.display
  }
  const timestamps = collection.timestamps
  const monotonic = collection.monotonicNs
  const utcValues = [timestamps.startedAt, timestamps.shareStartedAt, timestamps.shareStoppedAt, timestamps.endedAt].map(String)
  const monotonicValues = [monotonic.startedAt, monotonic.shareStartedAt, monotonic.shareStoppedAt, monotonic.endedAt].map(String)
  const exactEvidencePaths = EVIDENCE_MEMBER_PATHS.slice(1)
  if (
    collection.schemaVersion !== 1 ||
    collection.kind !== "qualification-collection" ||
    collection.procedureId !== (identity.scope === "entire-display" ? "P12-M01" : "P12-M02") ||
    collection.app.commitSha !== identity.expectedRcSha ||
    collection.app.semver !== release.appSemver ||
    collection.app.packageSha256 !== release.packageSha256 ||
    collection.app.signingTeamId !== release.signingTeamId ||
    collection.app.signingCertificateSha256 !== release.signingCertificateSha256 ||
    collection.app.notarizationTicketId !== release.notarizationTicketId ||
    canonicalJson(collection.environment) !== canonicalJson(expectedEnvironment) ||
    collection.validator.commitSha !== identity.expectedRcSha ||
    marker.algorithm !== "ic-marker-quadrants-v1" ||
    marker.cadenceHz !== "4" ||
    marker.sizePixels !== "256" ||
    control.algorithm !== "ic-control-checker-v1" ||
    control.cadenceHz !== "2" ||
    control.gridSize !== "8" ||
    control.seed !== marker.seed ||
    raw.markerEvents.some((event) => {
      const payload = event.payload as Record<string, unknown>
      return payload.seed !== marker.seed || payload.sizePixels !== marker.sizePixels
    }) ||
    raw.controlEvents.some((event) => {
      const payload = event.payload as Record<string, unknown>
      return payload.seed !== control.seed
    }) ||
    raw.observerEvents.some((event) => {
      const payload = event.payload as Record<string, unknown>
      return payload.pairingChallengeSha256 !== collection.pairingChallengeSha256 || payload.receivedPresentation !== true
    }) ||
    raw.coverage.seed !== control.seed ||
    raw.coverage.recognizedPpm !== contentResult.controlRecognizedPpm ||
    raw.report.result !== contentResult.result ||
    raw.report.markerDetectedFrames !== contentResult.markerDetectedFrames ||
    raw.report.markerContinuityPpm !== contentResult.markerContinuityPpm ||
    raw.report.controlRecognizedPpm !== contentResult.controlRecognizedPpm ||
    raw.report.validSharedIntervalFrames !== contentResult.validSharedIntervalFrames ||
    contentResult.result !== "pass" ||
    contentResult.markerDetectedFrames !== "0" ||
    !Array.isArray(collection.evidenceMembers) ||
    JSON.stringify(collection.evidenceMembers.map((item) => (item as Record<string, unknown>).path)) !== JSON.stringify(exactEvidencePaths) ||
    utcValues.some((value) => !UTC_MILLIS_PATTERN.test(value) || Number.isNaN(Date.parse(value))) ||
    !(Date.parse(utcValues[0]) < Date.parse(utcValues[1]) && Date.parse(utcValues[1]) < Date.parse(utcValues[2]) && Date.parse(utcValues[2]) < Date.parse(utcValues[3])) ||
    Date.parse(utcValues[2]) - Date.parse(utcValues[1]) < 120_000 ||
    monotonicValues.some((value) => !UINT64_PATTERN.test(value)) ||
    !(BigInt(monotonicValues[0]) < BigInt(monotonicValues[1]) && BigInt(monotonicValues[1]) < BigInt(monotonicValues[2]) && BigInt(monotonicValues[2]) < BigInt(monotonicValues[3])) ||
    BigInt(monotonicValues[2]) - BigInt(monotonicValues[1]) < 120_000_000_000n ||
    !UINT64_PATTERN.test(String(contentResult.markerContinuityPpm)) ||
    !UINT64_PATTERN.test(String(contentResult.controlRecognizedPpm)) ||
    !UINT64_PATTERN.test(String(contentResult.validSharedIntervalFrames)) ||
    BigInt(String(contentResult.markerContinuityPpm)) < 995000n ||
    BigInt(String(contentResult.markerContinuityPpm)) > 1000000n ||
    BigInt(String(contentResult.controlRecognizedPpm)) < 995000n ||
    BigInt(String(contentResult.controlRecognizedPpm)) > 1000000n ||
    BigInt(String(contentResult.validSharedIntervalFrames)) === 0n
  ) throw new Error("Qualification collection did not pass")
  for (const member of collection.evidenceMembers) {
    requireClosedObject(member, ["path", "bytes", "sha256"], "collection evidence member")
    const memberBytes = files.get(String(member.path))
    if (
      !memberBytes || member.bytes !== String(memberBytes.length) ||
      member.sha256 !== sha256(memberBytes)
    ) throw new Error("Collection evidence member binding is invalid")
  }

  const evidenceManifest = json(files, "evidence-manifest.json")
  validateManifest(evidenceManifest, "evidence", EVIDENCE_MEMBER_PATHS, files)
  const evidenceDigest = sha256(files.get("evidence-manifest.json")!)

  const roles = [
    ["attestations/local-operator.json", "local-operator"],
    ["attestations/remote-observer.json", "remote-observer"]
  ] as const
  for (const [path, role] of roles) {
    const payload = verifyEnvelope(
      json(files, path),
      matrix,
      ROLE_ATTESTATION_DOMAIN,
      "qualification-role-attestation",
      role
    )
    requireClosedObject(payload, ROLE_ATTESTATION_KEYS, `${role} attestation payload`)
    assertIdentity(payload, identity)
    if (!Array.isArray(payload.acknowledgements)) throw new Error("Role acknowledgements are invalid")
    let previousAt = 0
    let previousNs = -1n
    for (const acknowledgement of payload.acknowledgements) {
      requireClosedObject(
        acknowledgement,
        ["acknowledgementId", "role", "scope", "result", "at", "monotonicNs"],
        "role acknowledgement"
      )
      const at = String(acknowledgement.at)
      const ns = String(acknowledgement.monotonicNs)
      if (
        !UTC_MILLIS_PATTERN.test(at) || Number.isNaN(Date.parse(at)) || Date.parse(at) <= previousAt ||
        !UINT64_PATTERN.test(ns) || BigInt(ns) <= previousNs
      ) throw new Error("Role acknowledgement timing is invalid")
      previousAt = Date.parse(at)
      previousNs = BigInt(ns)
    }
    const expectedAcknowledgements = role === "local-operator" ? LOCAL_ACKS[identity.scope] : REMOTE_ACKS[identity.scope]
    if (
      payload.kind !== "qualification-role-attestation" ||
      payload.procedureId !== collection.procedureId ||
      payload.role !== role ||
      JSON.stringify(payload.acknowledgements.map((item) => (item as Record<string, unknown>).acknowledgementId)) !== JSON.stringify(expectedAcknowledgements) ||
      payload.acknowledgements.some((item) => {
        const acknowledgement = item as Record<string, unknown>
        return acknowledgement.role !== role || acknowledgement.scope !== identity.scope || acknowledgement.result !== "acknowledged"
      }) ||
      payload.observedResult !== "pass" ||
      payload.evidenceManifestSha256 !== evidenceDigest ||
      JSON.stringify(payload.deviations) !== "[]" ||
      JSON.stringify(payload.aborts) !== "[]"
    ) throw new Error("Qualification role attestation is invalid")
    const byId = new Map(payload.acknowledgements.map((item) => {
      const acknowledgement = item as Record<string, unknown>
      return [acknowledgement.acknowledgementId, acknowledgement]
    }))
    if (
      role === "remote-observer" &&
      (byId.get("observation-start-acknowledged")?.at !== timestamps.shareStartedAt ||
        byId.get("presentation-stopped")?.at !== timestamps.shareStoppedAt)
    ) throw new Error("Remote acknowledgement boundaries are invalid")
    if (
      !UTC_MILLIS_PATTERN.test(String(payload.attestedAt)) ||
      Date.parse(String(payload.attestedAt)) <= previousAt ||
      Date.parse(String(payload.attestedAt)) > Date.parse(String(timestamps.endedAt))
    ) throw new Error("Role attestation time is invalid")
  }

  const metadata = json(files, "bundle-metadata.json") as Record<string, unknown>
  requireClosedObject(metadata, METADATA_KEYS, "bundle metadata")
  assertIdentity(metadata, identity)
  if (
    metadata.schemaVersion !== 1 ||
    metadata.kind !== "qualification-bundle-metadata" ||
    metadata.procedureId !== collection.procedureId ||
    !UTC_MILLIS_PATTERN.test(String(metadata.finalizedAt)) ||
    !UTC_MILLIS_PATTERN.test(String(metadata.retentionDeleteAt)) ||
    Date.parse(String(metadata.retentionDeleteAt)) <= Date.parse(String(metadata.finalizedAt)) ||
    metadata.evidenceManifestSha256 !== evidenceDigest ||
    metadata.localAttestationSha256 !== sha256(files.get("attestations/local-operator.json")!) ||
    metadata.remoteAttestationSha256 !== sha256(files.get("attestations/remote-observer.json")!)
  ) throw new Error("Bundle metadata digest binding is invalid")

  const bundleManifest = json(files, "bundle-manifest.json")
  validateManifest(bundleManifest, "bundle", BUNDLE_MEMBER_PATHS, files)
  const bundleDigest = sha256(files.get("bundle-manifest.json")!)
  if (files.has(OPTIONAL_BUNDLE_SIGNATURE)) {
    const payload = verifyEnvelope(
      json(files, OPTIONAL_BUNDLE_SIGNATURE),
      matrix,
      RELEASE_BUNDLE_DOMAIN,
      "qualification-release-bundle",
      "release-bundle"
    )
    requireClosedObject(
      payload,
      ["schemaVersion", "kind", "rcSha", "keyId", "bundleManifestSha256", "signedAt"],
      "release bundle payload"
    )
    if (
      payload.kind !== "qualification-release-bundle" ||
      payload.rcSha !== identity.expectedRcSha ||
      payload.bundleManifestSha256 !== bundleDigest
    ) throw new Error("Optional release bundle signature is invalid")
  }

  const reviewEnvelope = parseCanonicalJson(independentReviewBytes)
  const review = verifyEnvelope(
    reviewEnvelope,
    matrix,
    INDEPENDENT_REVIEW_DOMAIN,
    "qualification-independent-review",
    "independent-reviewer"
  )
  requireClosedObject(review, REVIEW_KEYS, "independent review payload")
  requireClosedObject(
    review.reports,
    ["artifactValidatorReportSha256", "packagePolicyReportSha256", "frameSamplingReportSha256", "claimScanReportSha256"],
    "independent review reports"
  )
  requireClosedObject(
    review.observations,
    [
      "canonicalBytesReproduced", "manifestGraphAcyclic", "roleSignaturesValid",
      "trustRegistryValid", "remoteIntervalsWatched", "firstAndLastFramesChecked",
      "eachFifteenSecondEpochChecked", "underlyingContentReadable", "livePairingReproduced",
      "sampledFrames", "reproductionRunId"
    ],
    "independent review observations"
  )
  const observations = review.observations
  assertIdentity(review, identity)
  if (
    review.kind !== "qualification-independent-review" ||
    review.result !== "pass" ||
    review.bundleManifestSha256 !== bundleDigest ||
    !Object.values(review.reports).every((value) => typeof value === "string" && SHA256_PATTERN.test(value)) ||
    ["canonicalBytesReproduced", "manifestGraphAcyclic", "roleSignaturesValid", "trustRegistryValid", "remoteIntervalsWatched", "firstAndLastFramesChecked", "eachFifteenSecondEpochChecked", "underlyingContentReadable", "livePairingReproduced"].some((key) => observations[key] !== true) ||
    !UINT64_PATTERN.test(String(observations.sampledFrames)) ||
    BigInt(String(observations.sampledFrames)) < 10n ||
    !RUN_ID_PATTERN.test(String(observations.reproductionRunId))
  ) throw new Error("Detached independent review is invalid")
  return {
    bundleManifestSha256: bundleDigest,
    evidenceManifestSha256: evidenceDigest,
    reviewedAt: String(review.reviewedAt)
  }
}

export function canonicalProtocolObject(value: unknown): Buffer {
  return Buffer.from(canonicalJson(value))
}

export function assertDigest(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    throw new Error(`${label} must be SHA-256`)
  }
}
