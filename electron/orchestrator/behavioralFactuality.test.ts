import { describe, expect, it } from "vitest"
import { buildBehavioralRequest } from "./behavioralPolicy"
import { startedSession } from "./testSupport"
import { validateStoryClaims } from "../../src/features/behavioral/facts"

describe("Behavioral factuality", () => {
  it("refuses unsupported real stories and metrics", () => {
    const request = buildBehavioralRequest(
      startedSession({
        mode: "behavioral",
        provider: "codex",
        model: "gpt-5.4",
        responseMode: "fast",
        language: "typescript",
        context: []
      }),
      "request-1",
      "Tell me about conflict"
    )
    expect(request.synthetic.enabled).toBe(false)
    expect(request.contract.unsupportedRealStory).toBe("honest-absence")
    expect(
      validateStoryClaims(
        {
          id: "story",
          title: "Unsupported",
          status: "verified",
          claims: [
            {
              id: "invented",
              text: "Improved revenue by 42%",
              provenance: "verified",
              sourceRevision: 1,
              metric: "42%"
            }
          ]
        },
        []
      )
    ).toEqual(["Unsupported dossier claim: invented"])
  })
})
