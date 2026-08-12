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
        valid.identity,
        valid.releaseBinding
      )
    ).toEqual({
      bundleManifestSha256: valid.bundleManifestSha256,
      evidenceManifestSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      reviewedAt: "2026-07-31T12:06:00.000Z"
    })

    const missing = new Map(valid.files)
    missing.delete("raw/remote-observer.mov")
    expect(() =>
      validateQualificationBundle(missing, valid.review, valid.matrix, valid.identity, valid.releaseBinding)
    ).toThrow("Missing qualification member")

    const mutated = new Map(valid.files)
    mutated.set("raw/remote-observer.mov", Buffer.from("changed"))
    expect(() =>
      validateQualificationBundle(mutated, valid.review, valid.matrix, valid.identity, valid.releaseBinding)
    ).toThrow()

    const localOnly = new Map(valid.files)
    localOnly.delete("attestations/remote-observer.json")
    expect(() =>
      validateQualificationBundle(localOnly, valid.review, valid.matrix, valid.identity, valid.releaseBinding)
    ).toThrow("Missing qualification member")

    const oneFrameClaims120Seconds = new Map(valid.files)
    oneFrameClaims120Seconds.set(
      "derived/frame-analysis.ndjson",
      Buffer.from(valid.files.get("derived/frame-analysis.ndjson")!.toString("utf8").split("\n")[0] + "\n")
    )
    expect(() => validateQualificationBundle(
      oneFrameClaims120Seconds, valid.review, valid.matrix, valid.identity, valid.releaseBinding
    )).toThrow()

    const falseAnalysis = new Map(valid.files)
    falseAnalysis.set(
      "derived/frame-analysis.ndjson",
      Buffer.from(valid.files.get("derived/frame-analysis.ndjson")!.toString("utf8").replace('"controlRecognized":true', '"controlRecognized":false'))
    )
    expect(() => validateQualificationBundle(
      falseAnalysis, valid.review, valid.matrix, valid.identity, valid.releaseBinding
    )).toThrow()

    const unrelatedRecording = new Map(valid.files)
    unrelatedRecording.set("raw/remote-observer.mov", Buffer.from("different remote recording"))
    expect(() => validateQualificationBundle(
      unrelatedRecording, valid.review, valid.matrix, valid.identity, valid.releaseBinding
    )).toThrow()

    const copiedRole = new Map(valid.files)
    copiedRole.set(
      "attestations/remote-observer.json",
      valid.files.get("attestations/local-operator.json")!
    )
    expect(() => validateQualificationBundle(
      copiedRole, valid.review, valid.matrix, valid.identity, valid.releaseBinding
    )).toThrow()

    const optional = createValidBundle(true)
    expect(() =>
      validateQualificationBundle(optional.files, optional.review, optional.matrix, optional.identity, optional.releaseBinding)
    ).not.toThrow()
    const badSignature = new Map(optional.files)
    const parsed = JSON.parse(badSignature.get("bundle-manifest.sig")!.toString("utf8"))
    parsed.signature.value = "A".repeat(86)
    badSignature.set("bundle-manifest.sig", Buffer.from(JSON.stringify(parsed)))
    expect(() =>
      validateQualificationBundle(badSignature, optional.review, optional.matrix, optional.identity, optional.releaseBinding)
    ).toThrow()
  })
})
