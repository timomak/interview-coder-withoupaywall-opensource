import { describe, expect, it, vi } from "vitest"
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

  it("does not publish a synthetic answer until the reusable story is durable", async () => {
    const saveSyntheticStory = vi
      .fn()
      .mockRejectedValue(new Error("profile persistence unavailable"))
    const fixture = createTestOrchestrator(
      undefined,
      undefined,
      { saveSyntheticStory }
    )
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
            id: "synthetic-story-policy",
            category: "instructions",
            revision: 1,
            content: "Synthetic drafts are enabled."
          }
        ]
      }
    })
    fixture.providerFactory.queued.push({
      selection: {
        provider: "codex",
        model: "gpt-5.4",
        responseMode: "fast",
        effort: "low"
      },
      events: [
        {
          type: "typed-payload",
          sequence: 1,
          payload: {
            kind: "behavioral",
            story: {
              id: "synthetic-1",
              title: "Draft",
              status: "synthetic-draft",
              claims: [
                {
                  id: "draft-claim",
                  text: "A clearly labeled practice story.",
                  provenance: "synthetic-draft",
                  sourceRevision: 1
                }
              ]
            }
          }
        },
        { type: "completed", sequence: 2 }
      ]
    })

    const result = await fixture.orchestrator.command({
      type: "submit",
      route: "mode-action",
      input: "Create a practice story"
    })
    expect(result.ok).toBe(false)
    expect(result.error).toContain("profile persistence unavailable")
    expect(saveSyntheticStory).toHaveBeenCalledOnce()
    expect(
      currentActive(result.state).sections.every(
        (section) => section.body.length === 0
      )
    ).toBe(true)
  })
})
