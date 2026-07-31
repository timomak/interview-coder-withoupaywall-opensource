import { describe, expect, it } from "vitest"
import { validateQualificationBundle } from "../../electron/qualification/artifactValidator"
import { createValidBundle } from "../../tests/qualification/testSupport"

describe("Google Meet qualification artifact validator", () => {
  it("rejects incomplete cyclic final-byte-mutated untrusted or local-only evidence", () => {
    const valid = createValidBundle()
    expect(
      validateQualificationBundle(
        valid.files,
        valid.review,
        valid.matrix,
        valid.identity
      )
    ).toEqual({ bundleManifestSha256: valid.bundleManifestSha256 })

    const missing = new Map(valid.files)
    missing.delete("raw/remote-observer.mov")
    expect(() =>
      validateQualificationBundle(missing, valid.review, valid.matrix, valid.identity)
    ).toThrow("Missing qualification member")

    const mutated = new Map(valid.files)
    mutated.set("raw/remote-observer.mov", Buffer.from("changed"))
    expect(() =>
      validateQualificationBundle(mutated, valid.review, valid.matrix, valid.identity)
    ).toThrow("manifest member bytes do not match")

    const localOnly = new Map(valid.files)
    localOnly.delete("attestations/remote-observer.json")
    expect(() =>
      validateQualificationBundle(localOnly, valid.review, valid.matrix, valid.identity)
    ).toThrow("Missing qualification member")

    const optional = createValidBundle(true)
    expect(() =>
      validateQualificationBundle(optional.files, optional.review, optional.matrix, optional.identity)
    ).not.toThrow()
    const badSignature = new Map(optional.files)
    const parsed = JSON.parse(badSignature.get("bundle-manifest.sig")!.toString("utf8"))
    parsed.signature.value = "A".repeat(86)
    badSignature.set("bundle-manifest.sig", Buffer.from(JSON.stringify(parsed)))
    expect(() =>
      validateQualificationBundle(badSignature, optional.review, optional.matrix, optional.identity)
    ).toThrow()
  })
})
