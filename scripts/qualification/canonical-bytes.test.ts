import { describe, expect, it } from "vitest"
import {
  INDEPENDENT_REVIEW_DOMAIN,
  RELEASE_BUNDLE_DOMAIN,
  RELEASE_STATEMENT_DOMAIN,
  ROLE_ATTESTATION_DOMAIN,
  canonicalJson,
  parseCanonicalJson,
  sha256
} from "../../electron/qualification/protocol"

describe("qualification canonical bytes", () => {
  it("reproduces JCS bytes digests and exact signature domains", () => {
    const value = { z: ["é", "0"], a: { b: true, a: "1" } }
    const nodeBytes = canonicalJson(value)
    const independentSerializerBytes = "{\"a\":{\"a\":\"1\",\"b\":true},\"z\":[\"é\",\"0\"]}"
    expect(nodeBytes).toBe(independentSerializerBytes)
    expect(sha256(nodeBytes)).toBe(sha256(independentSerializerBytes))
    expect(parseCanonicalJson(nodeBytes)).toEqual(value)
    expect(canonicalJson({ "\uE000": 1, "😀": 2 })).toBe("{\"😀\":2,\"\":1}")
    expect(() => parseCanonicalJson(Buffer.from([0x7b, 0x22, 0xff, 0x22, 0x3a, 0x31, 0x7d])))
      .toThrow()
    for (const invalid of [
      "{ \"a\":1}",
      "{\"a\":1.0}",
      "{\"a\":1e0}",
      "{\"a\":1,\"a\":1}",
      "{\"é\":\"é\"}",
      "{\"a\":1}\n"
    ]) expect(() => parseCanonicalJson(invalid)).toThrow()
    expect([
      ROLE_ATTESTATION_DOMAIN,
      RELEASE_BUNDLE_DOMAIN,
      INDEPENDENT_REVIEW_DOMAIN,
      RELEASE_STATEMENT_DOMAIN
    ]).toEqual([
      "InterviewCopilot qualification role attestation v1\n",
      "InterviewCopilot qualification release bundle v1\n",
      "InterviewCopilot qualification independent review v1\n",
      "InterviewCopilot qualification release statement v1\n"
    ])
  })
})
