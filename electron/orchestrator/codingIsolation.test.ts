import { describe, expect, it } from "vitest"
import { startedSession } from "./testSupport"
import { buildCodingProviderRequest } from "./codingPolicy"

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
})
