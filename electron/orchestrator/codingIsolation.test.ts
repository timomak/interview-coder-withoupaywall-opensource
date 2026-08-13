import { describe, expect, it } from "vitest"
import { startedSession } from "./testSupport"
import {
  buildCodingProviderRequest,
  validateCodingSections
} from "./codingPolicy"

describe("Coding provider isolation", () => {
  it("excludes personal context and execution tools", () => {
    const session = startedSession({
      mode: "coding",
      provider: "codex",
      model: "gpt-5.4",
      responseMode: "fast",
      language: "typescript",
      context: [
        { id: "instructions", category: "instructions", revision: 1, content: "Staff answer" },
        { id: "profile", category: "profile", revision: 1, content: "PROFILE_SECRET" },
        { id: "opportunity", category: "opportunity", revision: 1, content: "OPPORTUNITY_SECRET" }
      ]
    })
    const request = buildCodingProviderRequest({
      session,
      intent: "generate-code",
      requestId: "request-1",
      input: "two sum"
    })
    const bytes = JSON.stringify(request)
    expect(bytes).not.toMatch(/PROFILE_SECRET|OPPORTUNITY_SECRET/)
    expect(request.tools).toEqual([])
    expect(bytes).not.toMatch(/terminal|execute|writeFile|test runner/i)
  })

  it("sends only the evidence selected by the delivery packet", () => {
    const session = startedSession({
      mode: "coding",
      provider: "codex",
      model: "gpt-5.4",
      responseMode: "fast",
      language: "typescript",
      context: []
    })
    const withEvidence = {
      ...session,
      artifacts: [
        {
          id: "screenshot:delivered-before",
          kind: "screenshot" as const,
          finalizedAt: "earlier",
          content: "old pixels",
          selected: true,
          submitted: true
        },
        {
          id: "screenshot:current-packet",
          kind: "screenshot" as const,
          finalizedAt: "now",
          content: "current pixels",
          selected: true,
          submitted: true
        }
      ]
    }
    const request = buildCodingProviderRequest({
      session: withEvidence,
      intent: "analyze",
      requestId: "request-current-packet",
      input: "analyze",
      evidenceArtifactIds: [
        "screenshot:delivered-before",
        "screenshot:current-packet"
      ]
    })

    expect(request.evidence.map((artifact) => artifact.id)).toEqual([
      "screenshot:current-packet"
    ])
  })

  it("accepts the quality contract across the rendered Coding sections", () => {
    expect(
      validateCodingSections("analyze", "python3", [
        {
          id: "answer-17",
          body:
            "- Track the active window.\n- Move left past duplicates.\n- Record the maximum.\n```python\n# * not a prose bullet\n```"
        },
        {
          id: "plan-17",
          body: "Maintain the invariant that the active window is unique."
        },
        {
          id: "explain-17",
          body:
            "Time: O(n). Space: O(k). Trade-off: last-seen indices use memory to skip repeated scans."
        }
      ])
    ).toEqual([])
  })
})
