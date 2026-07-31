import { describe, expect, it } from "vitest"
import {
  CaptureVerificationRepository,
  captureVerificationState,
  type CaptureTupleV1,
  type CaptureVerificationRecordV1
} from "./verificationRecord"
import type { RecordRepository } from "../storage"

const sha256 = "a".repeat(64)
const tuple: CaptureTupleV1 = {
  appSemver: "1.0.19",
  appCommitSha: "b".repeat(40),
  appBundleSha256: sha256,
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
}
const record: CaptureVerificationRecordV1 = {
  schemaVersion: 1,
  kind: "capture-verification",
  tuple,
  scopes: [
    {
      scope: "entire-display",
      procedureId: "P12-M01",
      result: "pass",
      evidenceManifestSha256: sha256,
      bundleManifestSha256: sha256
    },
    {
      scope: "specific-window",
      procedureId: "P12-M02",
      result: "pass",
      evidenceManifestSha256: sha256,
      bundleManifestSha256: sha256
    }
  ],
  qualifiedAt: "2026-07-31T12:00:00.000Z"
}

describe("M-10 capture verification", () => {
  it("versions verifies fails and stales exact tuples", async () => {
    let stored: CaptureVerificationRecordV1 | undefined
    const repository: RecordRepository<CaptureVerificationRecordV1> = {
      put: async (_id, value) => { stored = value },
      get: async () => stored,
      remove: async () => { stored = undefined },
      all: async () => ({ records: [], issues: [] }),
      search: async () => []
    }
    const encrypted = new CaptureVerificationRepository(repository)
    expect(await encrypted.state(tuple)).toBe("Not verified")
    await encrypted.save(record)
    expect(await encrypted.state(tuple)).toBe("Verified")
    expect(
      captureVerificationState(
        { ...record, scopes: [{ ...record.scopes[0], result: "fail" }, record.scopes[1]] },
        tuple
      )
    ).toBe("Failed")
    expect(
      await encrypted.state({ ...tuple, chromeVersion: "139.0.7258.23" })
    ).toBe("Retest required")
    expect(
      await encrypted.state({ ...tuple, appBundleSha256: "c".repeat(64) })
    ).toBe("Retest required")
    await encrypted.invalidate()
    expect(await encrypted.state(tuple)).toBe("Not verified")
  })
})
