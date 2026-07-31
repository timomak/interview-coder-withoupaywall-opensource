import {
  BUNDLE_MEMBER_PATHS,
  EVIDENCE_MEMBER_PATHS,
  INDEPENDENT_REVIEW_DOMAIN,
  RELEASE_BUNDLE_DOMAIN,
  ROLE_ATTESTATION_DOMAIN,
  RUN_ID_PATTERN,
  SHA256_PATTERN,
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

export function validateQualificationBundle(
  files: ReadonlyMap<string, Buffer>,
  independentReviewBytes: Buffer,
  matrix: QualificationMatrix,
  identity: QualificationIdentity
): { readonly bundleManifestSha256: string } {
  if (!RUN_ID_PATTERN.test(identity.runId)) throw new Error("Qualification run ID is invalid")
  for (const path of files.keys()) {
    if (!ALLOWED_RUN_PATHS.has(path)) throw new Error(`Unexpected qualification member: ${path}`)
  }
  for (const path of ALLOWED_RUN_PATHS) {
    if (path !== OPTIONAL_BUNDLE_SIGNATURE && !files.has(path)) {
      throw new Error(`Missing qualification member: ${path}`)
    }
  }
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
  const contentResult = collection.contentResult
  if (
    collection.schemaVersion !== 1 ||
    collection.kind !== "qualification-collection" ||
    collection.procedureId !== (identity.scope === "entire-display" ? "P12-M01" : "P12-M02") ||
    collection.app.commitSha !== identity.expectedRcSha ||
    collection.validator.commitSha !== identity.expectedRcSha ||
    collection.marker.algorithm !== "ic-marker-quadrants-v1" ||
    collection.marker.cadenceHz !== "4" ||
    collection.marker.sizePixels !== "256" ||
    collection.control.algorithm !== "ic-control-checker-v1" ||
    collection.control.cadenceHz !== "2" ||
    collection.control.gridSize !== "8" ||
    collection.control.seed !== collection.marker.seed ||
    contentResult.result !== "pass" ||
    contentResult.markerDetectedFrames !== "0" ||
    !Array.isArray(collection.evidenceMembers)
  ) throw new Error("Qualification collection did not pass")
  for (const member of collection.evidenceMembers) {
    requireClosedObject(member, ["path", "bytes", "sha256"], "collection evidence member")
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
    for (const acknowledgement of payload.acknowledgements) {
      requireClosedObject(
        acknowledgement,
        ["acknowledgementId", "role", "scope", "result", "at", "monotonicNs"],
        "role acknowledgement"
      )
    }
    if (
      payload.kind !== "qualification-role-attestation" ||
      payload.procedureId !== collection.procedureId ||
      payload.role !== role ||
      payload.observedResult !== "pass" ||
      payload.evidenceManifestSha256 !== evidenceDigest ||
      JSON.stringify(payload.deviations) !== "[]" ||
      JSON.stringify(payload.aborts) !== "[]"
    ) throw new Error("Qualification role attestation is invalid")
  }

  const metadata = json(files, "bundle-metadata.json") as Record<string, unknown>
  requireClosedObject(metadata, METADATA_KEYS, "bundle metadata")
  assertIdentity(metadata, identity)
  if (
    metadata.schemaVersion !== 1 ||
    metadata.kind !== "qualification-bundle-metadata" ||
    metadata.procedureId !== collection.procedureId ||
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
  assertIdentity(review, identity)
  if (
    review.kind !== "qualification-independent-review" ||
    review.result !== "pass" ||
    review.bundleManifestSha256 !== bundleDigest
  ) throw new Error("Detached independent review is invalid")
  return { bundleManifestSha256: bundleDigest }
}

export function canonicalProtocolObject(value: unknown): Buffer {
  return Buffer.from(canonicalJson(value))
}

export function assertDigest(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    throw new Error(`${label} must be SHA-256`)
  }
}
