import type { RecordRepository } from "../storage"

export type CaptureScope = "entire-display" | "specific-window"
export type CaptureVerificationState =
  | "Not verified"
  | "Verified"
  | "Failed"
  | "Retest required"

export interface CaptureTupleV1 {
  readonly appSemver: string
  readonly appCommitSha: string
  readonly appBundleSha256: string
  readonly macOSProductVersion: string
  readonly macOSBuildVersion: string
  readonly architecture: "arm64" | "x64"
  readonly chromeVersion: string
  readonly meetBuildId: string
  readonly display: {
    readonly displayId: string
    readonly type: "internal" | "external"
    readonly pixelWidth: number
    readonly pixelHeight: number
    readonly scaleFactor: string
  }
}

export interface CaptureVerificationRecordV1 {
  readonly schemaVersion: 1
  readonly kind: "capture-verification"
  readonly tuple: CaptureTupleV1
  readonly scopes: readonly [
    {
      readonly scope: "entire-display"
      readonly procedureId: "P12-M01"
      readonly result: "pass" | "fail"
      readonly evidenceManifestSha256: string
      readonly bundleManifestSha256: string
    },
    {
      readonly scope: "specific-window"
      readonly procedureId: "P12-M02"
      readonly result: "pass" | "fail"
      readonly evidenceManifestSha256: string
      readonly bundleManifestSha256: string
    }
  ]
  readonly qualifiedAt: string
}

const RECORD_ID = "capture-verification-v1"
const RECORD_TYPE = "application/vnd.interviewcopilot.capture-verification+json"
const SHA256 = /^[0-9a-f]{64}$/
const RC_SHA = /^[0-9a-f]{40}$/

function tupleIdentity(tuple: CaptureTupleV1): string {
  return JSON.stringify(tuple)
}

export function validateCaptureVerificationRecord(
  record: CaptureVerificationRecordV1
): void {
  if (
    record.schemaVersion !== 1 ||
    record.kind !== "capture-verification" ||
    !RC_SHA.test(record.tuple.appCommitSha) ||
    !SHA256.test(record.tuple.appBundleSha256) ||
    !/^\d+\.\d+\.\d+/.test(record.tuple.appSemver) ||
    !/^\d+\.\d+\.\d+$/.test(record.tuple.macOSProductVersion) ||
    !/^\d+\.\d+\.\d+\.\d+$/.test(record.tuple.chromeVersion) ||
    !["arm64", "x64"].includes(record.tuple.architecture) ||
    record.scopes.length !== 2 ||
    record.scopes[0].scope !== "entire-display" ||
    record.scopes[0].procedureId !== "P12-M01" ||
    record.scopes[1].scope !== "specific-window" ||
    record.scopes[1].procedureId !== "P12-M02" ||
    Number.isNaN(Date.parse(record.qualifiedAt))
  ) {
    throw new Error("Capture verification record is malformed")
  }
  for (const scope of record.scopes) {
    if (
      !["pass", "fail"].includes(scope.result) ||
      !SHA256.test(scope.evidenceManifestSha256) ||
      !SHA256.test(scope.bundleManifestSha256)
    ) {
      throw new Error("Capture verification scope is malformed")
    }
  }
}

export function captureVerificationState(
  record: CaptureVerificationRecordV1 | undefined,
  current: CaptureTupleV1
): CaptureVerificationState {
  if (!record) return "Not verified"
  validateCaptureVerificationRecord(record)
  if (tupleIdentity(record.tuple) !== tupleIdentity(current)) {
    return "Retest required"
  }
  return record.scopes.every((scope) => scope.result === "pass")
    ? "Verified"
    : "Failed"
}

export class CaptureVerificationRepository {
  constructor(
    private readonly records: RecordRepository<CaptureVerificationRecordV1>
  ) {}

  async load(): Promise<CaptureVerificationRecordV1 | undefined> {
    const record = await this.records.get(RECORD_ID, RECORD_TYPE)
    if (record) validateCaptureVerificationRecord(record)
    return record
  }

  async state(current: CaptureTupleV1): Promise<CaptureVerificationState> {
    return captureVerificationState(await this.load(), current)
  }

  async save(record: CaptureVerificationRecordV1): Promise<void> {
    validateCaptureVerificationRecord(record)
    await this.records.put(RECORD_ID, record, RECORD_TYPE)
  }

  async invalidate(): Promise<void> {
    await this.records.remove(RECORD_ID)
  }
}
