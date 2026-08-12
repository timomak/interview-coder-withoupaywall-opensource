import { describe, expect, it } from "vitest"
import { validateReleaseStatement } from "../../electron/qualification/releaseStatement"
import { validatePackageInspection } from "../../electron/qualification/packageInspection"
import { createReleaseStatement } from "../../tests/qualification/testSupport"
import { canonicalJson, parseCanonicalJson, sha256 } from "../../electron/qualification/protocol"

describe("detached release statement", () => {
  it("binds a post-build statement without changing pre-commit matrix identity", () => {
    const fixture = createReleaseStatement()
    const envelope = parseCanonicalJson(fixture.bytes) as { payload: Record<string, unknown>; signature: { keyId: string } }
    expect(envelope.payload).not.toHaveProperty("keyId")
    expect(envelope.payload.releaseKeyId).toBe(envelope.signature.keyId)
    expect(
      validateReleaseStatement(fixture.bytes, fixture.matrix, fixture.context)
    ).toMatchObject({
      expectedRcSha: fixture.context.expectedRcSha,
      matrixBlobSha256: fixture.context.matrixBlobSha256,
      appSemver: fixture.context.appSemver
    })
    const wrongCommit = {
      ...fixture.context,
      expectedRcSha: "f".repeat(40)
    }
    expect(() =>
      validateReleaseStatement(fixture.bytes, fixture.matrix, wrongCommit)
    ).toThrow("binding is invalid")
    const wrongPackage = {
      ...fixture.context,
      packageSha256: { arm64: "0".repeat(64) }
    }
    expect(() =>
      validateReleaseStatement(fixture.bytes, fixture.matrix, wrongPackage)
    ).toThrow("package identity is invalid")

    const dmg = Buffer.from("sealed signed notarized package fixture")
    const expected = {
      rcSha: fixture.context.expectedRcSha,
      releaseStatement: fixture.bytes,
      packages: {
        arm64: {
          bytes: dmg,
          signingTeamId: "ABCDEFGHIJ",
          signingCertificateSha256: "d".repeat(64),
          notarizationTicketId: "notary-ticket-001"
        }
      }
    }
    const inspection = Buffer.from(canonicalJson({
      schemaVersion: 1,
      kind: "qualification-package-inspection",
      rcSha: fixture.context.expectedRcSha,
      inspections: [{
        architecture: "arm64",
        appAsarSha256: "a".repeat(64),
        packageSha256: sha256(dmg),
        releaseStatementSha256: sha256(fixture.bytes),
        signingTeamId: "ABCDEFGHIJ",
        signingCertificateSha256: "d".repeat(64),
        notarizationTicketId: "notary-ticket-001"
      }]
    }))
    expect(validatePackageInspection(inspection, expected)).toHaveLength(1)
    const shallow = Buffer.from(canonicalJson({
      schemaVersion: 1,
      kind: "qualification-package-inspection",
      rcSha: fixture.context.expectedRcSha,
      inspections: [{ architecture: "arm64", appAsarSha256: "a".repeat(64) }]
    }))
    expect(() => validatePackageInspection(shallow, expected)).toThrow()
  })
})
