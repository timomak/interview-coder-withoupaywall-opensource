import crypto from "node:crypto"
import {
  BUNDLE_MEMBER_PATHS,
  EVIDENCE_MEMBER_PATHS,
  INDEPENDENT_REVIEW_DOMAIN,
  RELEASE_BUNDLE_DOMAIN,
  RELEASE_STATEMENT_DOMAIN,
  ROLE_ATTESTATION_DOMAIN,
  canonicalJson,
  sha256,
  type QualificationMatrix,
  type TrustEntry
} from "../../electron/qualification/protocol"

export interface TestTrust {
  readonly matrix: QualificationMatrix
  readonly privateKeys: Readonly<Record<string, crypto.KeyObject>>
}

function keyMaterial() {
  const pair = crypto.generateKeyPairSync("ed25519")
  const der = pair.publicKey.export({ format: "der", type: "spki" }) as Buffer
  return { privateKey: pair.privateKey, publicKeyBase64Url: der.subarray(-32).toString("base64url") }
}

export function createTestTrust(): TestTrust {
  const definitions = [
    ["independent-reviewer-01", "qualification-independent-review", "independent-reviewer"],
    ["local-operator-key-01", "qualification-role-attestation", "local-operator"],
    ["release-bundle-key-01", "qualification-release-bundle", "release-bundle"],
    ["release-statement-key-01", "qualification-release-statement", "release-statement"],
    ["remote-observer-key-01", "qualification-role-attestation", "remote-observer"]
  ] as const
  const privateKeys: Record<string, crypto.KeyObject> = {}
  const trustRegistry: TrustEntry[] = definitions.map(([keyId, purpose, role]) => {
    const material = keyMaterial()
    privateKeys[keyId] = material.privateKey
    return { keyId, purpose, role, status: "active", publicKeyBase64Url: material.publicKeyBase64Url }
  })
  return {
    matrix: {
      schemaVersion: 1,
      matrixRevision: "matrix-2026-07-31",
      trustRegistry,
      entries: [
        {
          tupleId: "arm64-primary",
          macOSProductVersion: "15.6.1",
          macOSBuildVersion: "24G90",
          architecture: "arm64",
          chromeVersion: "138.0.7204.184",
          meetBuildId: "meet-web-2026-07-31",
          display: {
            displayId: "primary-1",
            type: "internal",
            pixelWidth: 3024,
            pixelHeight: 1964,
            scaleFactor: "2"
          },
          scopes: ["entire-display", "specific-window"]
        }
      ]
    },
    privateKeys
  }
}

export function signedEnvelope(
  payload: Record<string, unknown>,
  privateKey: crypto.KeyObject,
  domain: string
): Record<string, unknown> {
  const signature = crypto.sign(
    null,
    Buffer.from(domain + canonicalJson(payload)),
    privateKey
  )
  return {
    payload,
    signature: {
      algorithm: "Ed25519",
      keyId: payload.keyId,
      value: signature.toString("base64url")
    }
  }
}

function manifest(kind: "evidence" | "bundle", paths: readonly string[], files: Map<string, Buffer>) {
  return Buffer.from(canonicalJson({
    schemaVersion: 1,
    kind,
    algorithm: "sha256",
    entries: paths.map((path) => {
      const bytes = files.get(path)!
      return { path, bytes: String(bytes.length), sha256: sha256(bytes) }
    })
  }))
}

export function createValidBundle(includeBundleSignature = false) {
  const trust = createTestTrust()
  const identity = {
    expectedRcSha: "a".repeat(40),
    matrixRevision: trust.matrix.matrixRevision,
    tupleId: "arm64-primary",
    scope: "entire-display" as const,
    runId: "12345678-1234-4123-8123-123456789abc"
  }
  const files = new Map<string, Buffer>()
  const common = {
    rcSha: identity.expectedRcSha,
    matrixRevision: identity.matrixRevision,
    tupleId: identity.tupleId,
    scope: identity.scope,
    runId: identity.runId
  }
  for (const path of EVIDENCE_MEMBER_PATHS.slice(1)) {
    files.set(path, path.endsWith(".json") ? Buffer.from("{}") : Buffer.from("fixture\n"))
  }
  const evidenceMembers = EVIDENCE_MEMBER_PATHS.slice(1).map((path) => {
    const bytes = files.get(path)!
    return { path, bytes: String(bytes.length), sha256: sha256(bytes) }
  })
  files.set("collection.json", Buffer.from(canonicalJson({
    schemaVersion: 1,
    kind: "qualification-collection",
    procedureId: "P12-M01",
    ...common,
    app: {
      semver: "1.0.19",
      commitSha: identity.expectedRcSha,
      packageSha256: "1".repeat(64),
      signingTeamId: "ABCDEFGHIJ",
      signingCertificateSha256: "2".repeat(64),
      notarizationTicketId: "notary-ticket-001"
    },
    environment: {
      macOSProductVersion: "15.6.1",
      macOSBuildVersion: "24G90",
      architecture: "arm64",
      chromeVersion: "138.0.7204.184",
      meetBuildId: "meet-web-2026-07-31",
      display: {
        displayId: "primary-1",
        type: "internal",
        pixelWidth: 3024,
        pixelHeight: 1964,
        scaleFactor: "2"
      }
    },
    roles: {
      localOperator: { roleId: "local-operator-identity-0001", keyId: "local-operator-key-01" },
      remoteObserver: { roleId: "remote-observer-identity-0001", keyId: "remote-observer-key-01" }
    },
    timestamps: {
      startedAt: "2026-07-31T12:00:00.000Z",
      shareStartedAt: "2026-07-31T12:00:15.000Z",
      shareStoppedAt: "2026-07-31T12:02:15.000Z",
      endedAt: "2026-07-31T12:02:30.000Z"
    },
    monotonicNs: {
      startedAt: "1000000000",
      shareStartedAt: "16000000000",
      shareStoppedAt: "136000000000",
      endedAt: "151000000000"
    },
    marker: {
      algorithm: "ic-marker-quadrants-v1",
      seed: "3".repeat(64),
      cadenceHz: "4",
      sizePixels: "256"
    },
    control: {
      algorithm: "ic-control-checker-v1",
      seed: "3".repeat(64),
      cadenceHz: "2",
      gridSize: "8"
    },
    pairingChallengeSha256: "4".repeat(64),
    validator: { version: "1.0.19", commitSha: identity.expectedRcSha },
    contentResult: {
      result: "pass",
      markerDetectedFrames: "0",
      markerContinuityPpm: "1000000",
      controlRecognizedPpm: "1000000",
      validSharedIntervalFrames: "2880"
    },
    evidenceMembers
  })))
  files.set("evidence-manifest.json", manifest("evidence", EVIDENCE_MEMBER_PATHS, files))
  const evidenceManifestSha256 = sha256(files.get("evidence-manifest.json")!)
  for (const role of ["local-operator", "remote-observer"] as const) {
    const keyId = role === "local-operator" ? "local-operator-key-01" : "remote-observer-key-01"
    const acknowledgementId = role === "local-operator"
      ? "raw-streams-finalized"
      : "raw-upload-complete"
    files.set(
      `attestations/${role}.json`,
      Buffer.from(canonicalJson(signedEnvelope({
        schemaVersion: 1,
        kind: "qualification-role-attestation",
        ...common,
        procedureId: "P12-M01",
        role,
        roleId: `${role}-identity-0001`,
        keyId,
        acknowledgements: [{
          acknowledgementId,
          role,
          scope: identity.scope,
          result: "acknowledged",
          at: "2026-07-31T12:02:29.000Z",
          monotonicNs: "150000000000"
        }],
        observedResult: "pass",
        deviations: [],
        aborts: [],
        attestedAt: "2026-07-31T12:03:00.000Z",
        evidenceManifestSha256
      }, trust.privateKeys[keyId], ROLE_ATTESTATION_DOMAIN)))
    )
  }
  files.set("bundle-metadata.json", Buffer.from(canonicalJson({
    schemaVersion: 1,
    kind: "qualification-bundle-metadata",
    ...common,
    procedureId: "P12-M01",
    evidenceManifestSha256,
    localAttestationSha256: sha256(files.get("attestations/local-operator.json")!),
    remoteAttestationSha256: sha256(files.get("attestations/remote-observer.json")!),
    finalizedAt: "2026-07-31T12:04:00.000Z",
    retentionDeleteAt: "2026-08-31T12:04:00.000Z",
    encryptedStoreId: "qualification-store-0001"
  })))
  files.set("bundle-manifest.json", manifest("bundle", BUNDLE_MEMBER_PATHS, files))
  const bundleManifestSha256 = sha256(files.get("bundle-manifest.json")!)
  if (includeBundleSignature) {
    files.set("bundle-manifest.sig", Buffer.from(canonicalJson(signedEnvelope({
      schemaVersion: 1,
      kind: "qualification-release-bundle",
      rcSha: identity.expectedRcSha,
      keyId: "release-bundle-key-01",
      bundleManifestSha256,
      signedAt: "2026-07-31T12:05:00.000Z"
    }, trust.privateKeys["release-bundle-key-01"], RELEASE_BUNDLE_DOMAIN))))
  }
  const review = Buffer.from(canonicalJson(signedEnvelope({
    schemaVersion: 1,
    kind: "qualification-independent-review",
    ...common,
    keyId: "independent-reviewer-01",
    reviewerId: "independent-reviewer-0001",
    bundleManifestSha256,
    result: "pass",
    reviewedAt: "2026-07-31T12:06:00.000Z",
    reports: {
      artifactValidatorReportSha256: "b".repeat(64),
      packagePolicyReportSha256: "c".repeat(64),
      frameSamplingReportSha256: "d".repeat(64),
      claimScanReportSha256: "e".repeat(64)
    },
    observations: {
      canonicalBytesReproduced: true,
      manifestGraphAcyclic: true,
      roleSignaturesValid: true,
      trustRegistryValid: true,
      remoteIntervalsWatched: true,
      firstAndLastFramesChecked: true,
      eachFifteenSecondEpochChecked: true,
      underlyingContentReadable: true,
      livePairingReproduced: true,
      sampledFrames: "10",
      reproductionRunId: "87654321-4321-4321-8321-cba987654321"
    }
  }, trust.privateKeys["independent-reviewer-01"], INDEPENDENT_REVIEW_DOMAIN)))
  return { ...trust, identity, files, review, bundleManifestSha256 }
}

export function createReleaseStatement(trust = createTestTrust()) {
  const context = {
    expectedRcSha: "a".repeat(40),
    matrixBlobSha256: "b".repeat(64),
    matrixRevision: trust.matrix.matrixRevision,
    appSemver: "1.0.19",
    architectures: ["arm64"] as const,
    packageSha256: { arm64: "c".repeat(64) }
  }
  const payload = {
    schemaVersion: 1,
    kind: "qualification-release-statement",
    expectedRcSha: context.expectedRcSha,
    matrixPath: "docs/qualification/macos-google-meet.json",
    matrixBlobSha256: context.matrixBlobSha256,
    matrixRevision: context.matrixRevision,
    appSemver: context.appSemver,
    packages: [{
      architecture: "arm64",
      packageSha256: context.packageSha256.arm64,
      signingTeamId: "ABCDEFGHIJ",
      signingCertificateSha256: "d".repeat(64),
      hardenedRuntime: true,
      notarizationTicketId: "notary-ticket-001",
      notarizationStatus: "Accepted",
      notarizationLogSha256: "e".repeat(64),
      stapleStatus: "valid",
      staplerStdoutSha256: "f".repeat(64),
      staplerStderrSha256: "0".repeat(64),
      spctlStatus: "accepted",
      spctlStdoutSha256: "1".repeat(64),
      spctlStderrSha256: "2".repeat(64),
      notarytoolSubmitRawExit: 0,
      notarytoolLogRawExit: 0,
      staplerRawExit: 0,
      spctlRawExit: 0,
      builtAt: "2026-07-31T12:00:00.000Z",
      notarizedAt: "2026-07-31T12:01:00.000Z",
      stapledAt: "2026-07-31T12:02:00.000Z"
    }],
    releaseKeyId: "release-statement-key-01",
    keyId: "release-statement-key-01",
    issuedAt: "2026-07-31T12:03:00.000Z"
  }
  return {
    ...trust,
    context,
    bytes: Buffer.from(canonicalJson(signedEnvelope(
      payload,
      trust.privateKeys["release-statement-key-01"],
      RELEASE_STATEMENT_DOMAIN
    )))
  }
}
