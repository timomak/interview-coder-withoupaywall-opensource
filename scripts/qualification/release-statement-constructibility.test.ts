import { describe, expect, it } from "vitest"
import { validateReleaseStatement } from "../../electron/qualification/releaseStatement"
import { createReleaseStatement } from "../../tests/qualification/testSupport"
import { parseCanonicalJson } from "../../electron/qualification/protocol"

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
  })
})
