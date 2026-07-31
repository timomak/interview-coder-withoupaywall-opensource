import { describe, expect, it } from "vitest"
import { buildBehavioralRequest } from "./behavioralPolicy"
import {
  createTestOrchestrator,
  currentActive,
  startedSession
} from "./testSupport"
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

  it("admits one fact object and rejects independent prose sections", async () => {
    const fixture = createTestOrchestrator()
    await fixture.orchestrator.command({
      type: "start",
      snapshot: {
        mode: "behavioral",
        provider: "codex",
        model: "gpt-5.4",
        responseMode: "fast",
        language: "typescript",
        context: [
          {
            id: "candidate-dossier:1",
            category: "profile",
            revision: 1,
            content: JSON.stringify({
              markdown: "# Candidate",
              claims: [
                {
                  id: "claim-1",
                  text: "Made the rollout reversible.",
                  provenance: "verified",
                  sourceRevision: 1
                }
              ]
            })
          }
        ]
      }
    })
    const bypass = createTestOrchestrator()
    await bypass.orchestrator.command({
      type: "start",
      snapshot: {
        mode: "behavioral",
        provider: "codex",
        model: "gpt-5.4",
        responseMode: "fast",
        language: "typescript",
        context: []
      }
    })
    fixture.providerFactory.queued.push({
      selection: { provider: "codex", model: "gpt-5.4", responseMode: "fast", effort: "low" },
      events: [
        {
          type: "typed-payload",
          sequence: 1,
          payload: {
            kind: "behavioral",
            story: {
              id: "story-1",
              title: "Migration",
              status: "verified",
              claims: [
                {
                  id: "claim-1",
                  text: "Made the rollout reversible.",
                  provenance: "verified",
                  sourceRevision: 1
                }
              ]
            }
          }
        },
        { type: "completed", sequence: 2 }
      ]
    })
    const accepted = await fixture.orchestrator.command({
      type: "submit",
      route: "mode-action",
      input: "Tell me about a rollout"
    })
    expect(accepted.ok).toBe(true)
    const bodies = currentActive(accepted.state).sections.map(
      (section) => section.body
    )
    expect(new Set(bodies)).toHaveLength(1)
    expect(bodies[0]).toContain("behavioral-fact-view-v1")

    bypass.providerFactory.queued.push({
      selection: { provider: "codex", model: "gpt-5.4", responseMode: "fast", effort: "low" },
      events: [
        {
          type: "typed-payload",
          sequence: 1,
          payload: {
            kind: "structured",
            sections: [
              { id: "answer", body: "Invented answer" },
              { id: "star", body: "Invented STAR" },
              { id: "evidence", body: "42%" },
              { id: "follow-ups", body: "Why?" }
            ]
          }
        },
        { type: "completed", sequence: 2 }
      ]
    })
    const rejected = await bypass.orchestrator.command({
      type: "submit",
      route: "mode-action",
      input: "Try another"
    })
    expect(rejected.ok).toBe(false)
    expect(rejected.error).toContain("one fact object")
  })
})
