import { describe, expect, it } from "vitest"
import {
  trustKey,
  validateMatrix,
  validateTrustRegistry
} from "../../electron/qualification/protocol"
import { createTestTrust } from "../../tests/qualification/testSupport"

describe("qualification trust registry", () => {
  it("rejects unknown revoked wrong-purpose duplicate and reused trust", () => {
    const { matrix } = createTestTrust()
    expect(validateMatrix(matrix)).toBe(matrix)
    expect(
      trustKey(matrix, "local-operator-key-01", "qualification-role-attestation", "local-operator")
    ).toMatchObject({ status: "active" })
    expect(() =>
      trustKey(matrix, "unknown-reviewer-01", "qualification-independent-review", "independent-reviewer")
    ).toThrow()
    expect(() =>
      trustKey(matrix, "local-operator-key-01", "qualification-independent-review", "independent-reviewer")
    ).toThrow()
    const duplicate = [...matrix.trustRegistry, matrix.trustRegistry[0]]
    expect(() => validateTrustRegistry(duplicate)).toThrow()
    const revoked = matrix.trustRegistry.map((entry) =>
      entry.role === "remote-observer" ? { ...entry, status: "revoked" as const } : entry
    )
    expect(() => validateTrustRegistry(revoked)).toThrow("Missing active trust purpose")
    const reused = matrix.trustRegistry.map((entry, index) =>
      index === 1 ? { ...entry, publicKeyBase64Url: matrix.trustRegistry[0].publicKeyBase64Url } : entry
    )
    expect(() => validateTrustRegistry(reused)).toThrow("globally unique")
  })
})
