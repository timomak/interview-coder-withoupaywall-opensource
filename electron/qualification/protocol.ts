import crypto from "node:crypto"

export const SHA256_PATTERN = /^[0-9a-f]{64}$/
export const RC_SHA_PATTERN = /^[0-9a-f]{40}$/
export const TOKEN_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/
export const ROLE_ID_PATTERN = /^[a-z0-9][a-z0-9-]{15,63}$/
export const RUN_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
export const UTC_MILLIS_PATTERN = /^20[0-9]{2}-(0[1-9]|1[0-2])-([0-2][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]\.[0-9]{3}Z$/
export const UINT64_PATTERN = /^(0|[1-9][0-9]{0,19})$/

export const ROLE_ATTESTATION_DOMAIN =
  "InterviewCopilot qualification role attestation v1\n"
export const RELEASE_BUNDLE_DOMAIN =
  "InterviewCopilot qualification release bundle v1\n"
export const INDEPENDENT_REVIEW_DOMAIN =
  "InterviewCopilot qualification independent review v1\n"
export const RELEASE_STATEMENT_DOMAIN =
  "InterviewCopilot qualification release statement v1\n"

export interface TrustEntry {
  readonly keyId: string
  readonly publicKeyBase64Url: string
  readonly purpose:
    | "qualification-role-attestation"
    | "qualification-independent-review"
    | "qualification-release-bundle"
    | "qualification-release-statement"
  readonly role:
    | "local-operator"
    | "remote-observer"
    | "independent-reviewer"
    | "release-bundle"
    | "release-statement"
  readonly status: "active" | "revoked"
}

export interface QualificationMatrix {
  readonly schemaVersion: 1
  readonly matrixRevision: string
  readonly trustRegistry: readonly TrustEntry[]
  readonly entries: readonly Record<string, unknown>[]
}

const PURPOSE_ROLES = new Set([
  "qualification-role-attestation:local-operator",
  "qualification-role-attestation:remote-observer",
  "qualification-independent-review:independent-reviewer",
  "qualification-release-bundle:release-bundle",
  "qualification-release-statement:release-statement"
])

export const EVIDENCE_MEMBER_PATHS = Object.freeze([
  "collection.json",
  "derived/control-coverage.json",
  "derived/frame-analysis.ndjson",
  "raw/local-control-events.ndjson",
  "raw/local-marker-events.ndjson",
  "raw/local-preflight.json",
  "raw/remote-observer-events.ndjson",
  "raw/remote-observer.mov",
  "validation/report.json"
])

export const BUNDLE_MEMBER_PATHS = Object.freeze([
  "attestations/local-operator.json",
  "attestations/remote-observer.json",
  "bundle-metadata.json",
  "evidence-manifest.json"
])

export const SCHEMA_INVENTORY = Object.freeze([
  "matrix",
  "release-envelope",
  "marker-event",
  "control-event",
  "observer-event",
  "frame-event",
  "local-preflight",
  "control-coverage",
  "content-validation",
  "collection",
  "manifest-entry",
  "role-attestation",
  "detached-review"
].map((name) => ({ name, additionalProperties: false, arraysConstrained: true })))

function validateUnicode(value: unknown): void {
  if (typeof value === "string") {
    const hasControl = [...value].some((character) => {
      const code = character.codePointAt(0) ?? 0
      return code <= 0x1f || code === 0x7f
    })
    if (value.normalize("NFC") !== value || hasControl) {
      throw new Error("Protocol strings must be NFC Unicode without control characters")
    }
    return
  }
  if (Array.isArray(value)) {
    value.forEach(validateUnicode)
    return
  }
  if (value && typeof value === "object") {
    Object.entries(value).forEach(([key, child]) => {
      validateUnicode(key)
      validateUnicode(child)
    })
  }
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "number") {
    if (typeof value === "number" && (!Number.isFinite(value) || !Number.isSafeInteger(value))) {
      throw new Error("Protocol JSON numbers must be finite safe integers")
    }
    return JSON.stringify(value)
  }
  if (typeof value === "string") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      // RFC 8785 section 3.2.3 sorts property names by their raw UTF-16
      // code units, which is JavaScript's default string ordering.
      .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([key, child]) => `${JSON.stringify(key)}:${canonicalize(child)}`)
      .join(",")}}`
  }
  throw new Error("Protocol value is not representable as JSON")
}

export function canonicalJson(value: unknown): string {
  validateUnicode(value)
  return canonicalize(value)
}

export function parseCanonicalJson(bytes: Buffer | string): unknown {
  const source = Buffer.isBuffer(bytes)
    ? new TextDecoder("utf-8", { fatal: true }).decode(bytes)
    : bytes
  if (source.startsWith("\ufeff") || source.endsWith("\n")) {
    throw new Error("Protocol JSON must not contain a BOM or trailing newline")
  }
  const parsed = JSON.parse(source) as unknown
  if (canonicalJson(parsed) !== source) {
    throw new Error("Protocol JSON bytes are not canonical JCS")
  }
  return parsed
}

export function sha256(bytes: Buffer | string): string {
  return crypto.createHash("sha256").update(bytes).digest("hex")
}

export function requireClosedObject(
  value: unknown,
  keys: readonly string[],
  label: string
): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`)
  }
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} contains missing or additional properties`)
  }
}

function decodeBase64Url(value: string, bytes: number): Buffer {
  const decoded = Buffer.from(value, "base64url")
  if (
    decoded.length !== bytes ||
    decoded.toString("base64url") !== value
  ) throw new Error(`Expected canonical ${bytes}-byte base64url value`)
  return decoded
}

export function validateTrustRegistry(registry: readonly TrustEntry[]): void {
  if (registry.length < 4 || registry.length > 64) {
    throw new Error("Trust registry must contain 4–64 entries")
  }
  const ids = new Set<string>()
  const publicKeys = new Set<string>()
  let previous = ""
  const activePairs = new Set<string>()
  for (const entry of registry) {
    requireClosedObject(
      entry,
      ["keyId", "publicKeyBase64Url", "purpose", "role", "status"],
      "trust entry"
    )
    if (!/^[a-z0-9][a-z0-9._-]{15,63}$/.test(entry.keyId)) {
      throw new Error("Trust key ID is malformed")
    }
    if (previous && Buffer.from(previous).compare(Buffer.from(entry.keyId)) >= 0) {
      throw new Error("Trust registry must be strictly sorted by key ID")
    }
    previous = entry.keyId
    decodeBase64Url(entry.publicKeyBase64Url, 32)
    const pair = `${entry.purpose}:${entry.role}`
    if (!PURPOSE_ROLES.has(pair)) throw new Error("Trust purpose/role pair is invalid")
    if (entry.status !== "active" && entry.status !== "revoked") {
      throw new Error("Trust key status is invalid")
    }
    if (ids.has(entry.keyId) || publicKeys.has(entry.publicKeyBase64Url)) {
      throw new Error("Trust keys and public bytes must be globally unique")
    }
    ids.add(entry.keyId)
    publicKeys.add(entry.publicKeyBase64Url)
    if (entry.status === "active") activePairs.add(pair)
  }
  for (const required of [
    "qualification-role-attestation:local-operator",
    "qualification-role-attestation:remote-observer",
    "qualification-independent-review:independent-reviewer",
    "qualification-release-statement:release-statement"
  ]) {
    if (!activePairs.has(required)) throw new Error(`Missing active trust purpose: ${required}`)
  }
}

export function validateMatrix(value: unknown): QualificationMatrix {
  requireClosedObject(
    value,
    ["schemaVersion", "matrixRevision", "trustRegistry", "entries"],
    "qualification matrix"
  )
  if (value.schemaVersion !== 1 || !TOKEN_PATTERN.test(String(value.matrixRevision))) {
    throw new Error("Qualification matrix identity is invalid")
  }
  if (!Array.isArray(value.trustRegistry) || !Array.isArray(value.entries) || value.entries.length === 0) {
    throw new Error("Qualification matrix registry and entries are required")
  }
  validateTrustRegistry(value.trustRegistry as unknown as TrustEntry[])
  let previous = ""
  const ids = new Set<string>()
  for (const entry of value.entries) {
    requireClosedObject(
      entry,
      ["tupleId", "macOSProductVersion", "macOSBuildVersion", "architecture", "chromeVersion", "meetBuildId", "remoteHelperSha256", "display", "scopes"],
      "matrix entry"
    )
    const tupleId = String(entry.tupleId)
    if (!TOKEN_PATTERN.test(tupleId) || ids.has(tupleId) || (previous && Buffer.from(previous).compare(Buffer.from(tupleId)) >= 0)) {
      throw new Error("Matrix tuple IDs must be unique and sorted")
    }
    previous = tupleId
    ids.add(tupleId)
    if (!/^\d+\.\d+\.\d+$/.test(String(entry.macOSProductVersion))) {
      throw new Error("macOS product version must be exact")
    }
    if (!/^\d+\.\d+\.\d+\.\d+$/.test(String(entry.chromeVersion))) {
      throw new Error("Chrome version must be exact")
    }
    if (
      !TOKEN_PATTERN.test(String(entry.macOSBuildVersion)) ||
      !TOKEN_PATTERN.test(String(entry.meetBuildId)) ||
      !SHA256_PATTERN.test(String(entry.remoteHelperSha256))
    ) {
      throw new Error("Matrix build identifiers must be exact tokens")
    }
    if (entry.architecture !== "arm64" && entry.architecture !== "x64") {
      throw new Error("Matrix architecture is unsupported")
    }
    if (JSON.stringify(entry.scopes) !== JSON.stringify(["entire-display", "specific-window"])) {
      throw new Error("Every tuple must contain both qualified scopes")
    }
    requireClosedObject(
      entry.display,
      ["displayId", "type", "pixelWidth", "pixelHeight", "scaleFactor"],
      "matrix display"
    )
    if (
      !TOKEN_PATTERN.test(String(entry.display.displayId)) ||
      !["internal", "external"].includes(String(entry.display.type)) ||
      !Number.isInteger(entry.display.pixelWidth) ||
      !Number.isInteger(entry.display.pixelHeight) ||
      Number(entry.display.pixelWidth) < 1 ||
      Number(entry.display.pixelWidth) > 32768 ||
      Number(entry.display.pixelHeight) < 1 ||
      Number(entry.display.pixelHeight) > 32768 ||
      !/^[1-4](\.[0-9]{1,3})?$/.test(String(entry.display.scaleFactor))
    ) throw new Error("Matrix display is invalid")
  }
  return value as unknown as QualificationMatrix
}

export function trustKey(
  matrix: QualificationMatrix,
  keyId: string,
  purpose: TrustEntry["purpose"],
  role: TrustEntry["role"]
): TrustEntry {
  const entry = matrix.trustRegistry.find((item) => item.keyId === keyId)
  if (!entry || entry.status !== "active" || entry.purpose !== purpose || entry.role !== role) {
    throw new Error("Unknown, revoked, or wrong-purpose trust key")
  }
  return entry
}

export function verifyEnvelope(
  envelope: unknown,
  matrix: QualificationMatrix,
  domain: string,
  purpose: TrustEntry["purpose"],
  role: TrustEntry["role"],
  payloadKeyField: "keyId" | "releaseKeyId" = "keyId"
): Record<string, unknown> {
  requireClosedObject(envelope, ["payload", "signature"], "signature envelope")
  requireClosedObject(envelope.signature, ["algorithm", "keyId", "value"], "signature")
  if (envelope.signature.algorithm !== "Ed25519") throw new Error("Signature algorithm must be Ed25519")
  if (!envelope.payload || typeof envelope.payload !== "object" || Array.isArray(envelope.payload)) {
    throw new Error("Signed payload must be an object")
  }
  const payload = envelope.payload as Record<string, unknown>
  if (payload[payloadKeyField] !== envelope.signature.keyId) throw new Error("Envelope key IDs disagree")
  const key = trustKey(matrix, String(payload[payloadKeyField]), purpose, role)
  const rawPublic = decodeBase64Url(key.publicKeyBase64Url, 32)
  const publicKey = crypto.createPublicKey({
    key: Buffer.concat([
      Buffer.from("302a300506032b6570032100", "hex"),
      rawPublic
    ]),
    format: "der",
    type: "spki"
  })
  const signature = decodeBase64Url(String(envelope.signature.value), 64)
  if (!crypto.verify(null, Buffer.from(domain + canonicalJson(payload)), publicKey, signature)) {
    throw new Error("Signature verification failed")
  }
  return payload
}

export interface GraphProof {
  readonly nodes: readonly string[]
  readonly edges: readonly (readonly [string, string])[]
  readonly topologicalOrder: readonly string[]
}

export function qualificationEvidenceGraph(includeBundleSignature = true): GraphProof {
  const nodes = [
    ...EVIDENCE_MEMBER_PATHS,
    "evidence-manifest.json",
    "attestations/local-operator.json",
    "attestations/remote-observer.json",
    "bundle-metadata.json",
    "bundle-manifest.json",
    "bundle-manifest.sig",
    "independent-review.json"
  ]
  const edges: Array<readonly [string, string]> = []
  for (const member of EVIDENCE_MEMBER_PATHS.slice(1)) edges.push([member, "collection.json"])
  for (const member of EVIDENCE_MEMBER_PATHS) edges.push([member, "evidence-manifest.json"])
  edges.push(
    ["evidence-manifest.json", "attestations/local-operator.json"],
    ["evidence-manifest.json", "attestations/remote-observer.json"],
    ["evidence-manifest.json", "bundle-metadata.json"],
    ["attestations/local-operator.json", "bundle-metadata.json"],
    ["attestations/remote-observer.json", "bundle-metadata.json"]
  )
  for (const member of BUNDLE_MEMBER_PATHS) edges.push([member, "bundle-manifest.json"])
  edges.push(
    ["bundle-manifest.json", "bundle-manifest.sig"],
    ["bundle-manifest.json", "independent-review.json"]
  )
  const outgoing = new Map(nodes.map((node) => [node, [] as string[]]))
  const indegree = new Map(nodes.map((node) => [node, 0]))
  for (const [from, to] of edges) {
    outgoing.get(from)?.push(to)
    indegree.set(to, (indegree.get(to) ?? 0) + 1)
  }
  const queue = nodes.filter((node) => indegree.get(node) === 0).sort()
  const order: string[] = []
  while (queue.length) {
    const node = queue.shift()!
    order.push(node)
    for (const target of outgoing.get(node) ?? []) {
      indegree.set(target, (indegree.get(target) ?? 1) - 1)
      if (indegree.get(target) === 0) {
        queue.push(target)
        queue.sort()
      }
    }
  }
  if (order.length !== nodes.length) throw new Error("Qualification evidence graph is cyclic")
  if (!includeBundleSignature) {
    return { nodes, edges, topologicalOrder: order }
  }
  return { nodes, edges, topologicalOrder: order }
}

export interface ManifestEntry {
  readonly path: string
  readonly bytes: string
  readonly sha256: string
}

export function validateManifest(
  value: unknown,
  kind: "evidence" | "bundle",
  expectedPaths: readonly string[],
  members: ReadonlyMap<string, Buffer>
): void {
  requireClosedObject(value, ["schemaVersion", "kind", "algorithm", "entries"], `${kind} manifest`)
  if (value.schemaVersion !== 1 || value.kind !== kind || value.algorithm !== "sha256" || !Array.isArray(value.entries)) {
    throw new Error(`${kind} manifest constants are invalid`)
  }
  const entries = value.entries as ManifestEntry[]
  if (JSON.stringify(entries.map((entry) => entry.path)) !== JSON.stringify(expectedPaths)) {
    throw new Error(`${kind} manifest membership or order is invalid`)
  }
  for (const entry of entries) {
    requireClosedObject(entry, ["path", "bytes", "sha256"], `${kind} manifest entry`)
    if (!UINT64_PATTERN.test(entry.bytes) || BigInt(entry.bytes) === 0n || !SHA256_PATTERN.test(entry.sha256)) {
      throw new Error(`${kind} manifest entry identity is invalid`)
    }
    const bytes = members.get(entry.path)
    if (!bytes || BigInt(bytes.length) !== BigInt(entry.bytes) || sha256(bytes) !== entry.sha256) {
      throw new Error(`${kind} manifest member bytes do not match`)
    }
  }
}
