import {
  RC_SHA_PATTERN,
  RELEASE_STATEMENT_DOMAIN,
  SHA256_PATTERN,
  TOKEN_PATTERN,
  UTC_MILLIS_PATTERN,
  parseCanonicalJson,
  requireClosedObject,
  verifyEnvelope,
  type QualificationMatrix
} from "./protocol"

export interface PinnedReleaseContext {
  readonly expectedRcSha: string
  readonly matrixBlobSha256: string
  readonly matrixRevision: string
  readonly appSemver: string
  readonly architectures: readonly ("arm64" | "x64")[]
  readonly packageSha256: Readonly<Partial<Record<"arm64" | "x64", string>>>
}

const PACKAGE_KEYS = [
  "architecture",
  "packageSha256",
  "signingTeamId",
  "signingCertificateSha256",
  "hardenedRuntime",
  "notarizationTicketId",
  "notarizationStatus",
  "notarizationLogSha256",
  "stapleStatus",
  "staplerStdoutSha256",
  "staplerStderrSha256",
  "spctlStatus",
  "spctlStdoutSha256",
  "spctlStderrSha256",
  "notarytoolSubmitRawExit",
  "notarytoolLogRawExit",
  "staplerRawExit",
  "spctlRawExit",
  "builtAt",
  "notarizedAt",
  "stapledAt"
] as const

export function validateReleaseStatement(
  bytes: Buffer,
  matrix: QualificationMatrix,
  context: PinnedReleaseContext
): Record<string, unknown> {
  const envelope = parseCanonicalJson(bytes)
  const payload = verifyEnvelope(
    envelope,
    matrix,
    RELEASE_STATEMENT_DOMAIN,
    "qualification-release-statement",
    "release-statement",
    "releaseKeyId"
  )
  requireClosedObject(
    payload,
    ["schemaVersion", "kind", "expectedRcSha", "matrixPath", "matrixBlobSha256", "matrixRevision", "appSemver", "packages", "releaseKeyId", "issuedAt"],
    "release statement payload"
  )
  if (
    payload.schemaVersion !== 1 ||
    payload.kind !== "qualification-release-statement" ||
    payload.expectedRcSha !== context.expectedRcSha ||
    !RC_SHA_PATTERN.test(String(payload.expectedRcSha)) ||
    payload.matrixPath !== "docs/qualification/macos-google-meet.json" ||
    payload.matrixBlobSha256 !== context.matrixBlobSha256 ||
    payload.matrixRevision !== context.matrixRevision ||
    payload.appSemver !== context.appSemver ||
    !UTC_MILLIS_PATTERN.test(String(payload.issuedAt)) ||
    Number.isNaN(Date.parse(String(payload.issuedAt))) ||
    !Array.isArray(payload.packages)
  ) throw new Error("Release statement binding is invalid")

  const architectures = [...context.architectures].sort()
  const packages = payload.packages as Array<Record<string, unknown>>
  if (JSON.stringify(packages.map((item) => item.architecture)) !== JSON.stringify(architectures)) {
    throw new Error("Release statement architecture set is invalid")
  }
  let latestStapled = 0
  for (const item of packages) {
    requireClosedObject(item, PACKAGE_KEYS, "release package")
    const architecture = item.architecture as "arm64" | "x64"
    const times = [item.builtAt, item.notarizedAt, item.stapledAt].map(String)
    if (
      !["arm64", "x64"].includes(architecture) ||
      item.packageSha256 !== context.packageSha256[architecture] ||
      !SHA256_PATTERN.test(String(item.packageSha256)) ||
      !/^[A-Z0-9]{10}$/.test(String(item.signingTeamId)) ||
      !SHA256_PATTERN.test(String(item.signingCertificateSha256)) ||
      item.hardenedRuntime !== true ||
      !TOKEN_PATTERN.test(String(item.notarizationTicketId)) ||
      item.notarizationStatus !== "Accepted" ||
      item.stapleStatus !== "valid" ||
      item.spctlStatus !== "accepted" ||
      ["notarizationLogSha256", "staplerStdoutSha256", "staplerStderrSha256", "spctlStdoutSha256", "spctlStderrSha256"].some(
        (key) => !SHA256_PATTERN.test(String(item[key]))
      ) ||
      ["notarytoolSubmitRawExit", "notarytoolLogRawExit", "staplerRawExit", "spctlRawExit"].some(
        (key) => item[key] !== 0
      ) ||
      times.some((time) => !UTC_MILLIS_PATTERN.test(time) || Number.isNaN(Date.parse(time))) ||
      !(Date.parse(times[0]) < Date.parse(times[1]) && Date.parse(times[1]) < Date.parse(times[2]))
    ) throw new Error("Release package identity is invalid")
    latestStapled = Math.max(latestStapled, Date.parse(times[2]))
  }
  if (Date.parse(String(payload.issuedAt)) < latestStapled) {
    throw new Error("Release statement was issued before package completion")
  }
  return payload
}
