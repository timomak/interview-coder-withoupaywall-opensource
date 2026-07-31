import type { ProviderSession } from "../providers"
import type {
  ProviderEvent,
  ProviderSelection
} from "../../src/shared/provider"
import { reduceInterviewSession } from "../../src/domain/interview"
import type { StartSnapshot } from "../../src/shared/interview"
import type { ProviderConversationFactory } from "./InterviewOrchestrator"
import {
  TEST_SNAPSHOT,
  createTestOrchestrator,
  createTestOrchestratorWithFactory,
  currentActive,
  reduceAccepted,
  startedSession
} from "./testSupport"

const selection: ProviderSelection = {
  provider: "codex",
  model: "gpt-5.4",
  responseMode: "fast",
  effort: "low"
}

class BlockingStreamingFactory implements ProviderConversationFactory {
  create(
    _snapshot: StartSnapshot,
    requestedConversationId: string
  ): ProviderSession {
    return this.session(requestedConversationId)
  }

  resume(_snapshot: StartSnapshot, conversationId: string): ProviderSession {
    return this.session(conversationId)
  }

  private session(conversationId: string): ProviderSession {
    return {
      selection,
      conversationId: () => conversationId,
      runTurn: async (_prompt, signal, onEvent) => {
        const partial: ProviderEvent = {
          type: "typed-payload",
          sequence: 1,
          payload: {
            kind: "structured",
            sections: [{ id: "answer", body: "persisted partial", complete: false }]
          }
        }
        await onEvent?.(partial)
        await new Promise<void>((resolve) => {
          if (signal?.aborted) {
            resolve()
            return
          }
          signal?.addEventListener("abort", () => resolve(), { once: true })
        })
        return { selection, events: [partial] }
      }
    }
  }
}

describe("progressive response sections", () => {
  it("accepts independently final Coding sections across typed payloads", async () => {
    const fixture = createTestOrchestrator()
    await fixture.orchestrator.command({
      type: "start",
      snapshot: { ...TEST_SNAPSHOT, mode: "coding" }
    })
    fixture.providerFactory.queued.push({
      selection,
      events: [
        {
          type: "typed-payload",
          sequence: 1,
          payload: {
            kind: "structured",
            sections: [
              { id: "answer", body: "Use a hash map.", complete: true },
              {
                id: "plan",
                body:
                  "- Index values in one pass.\n" +
                  "- Return the complement match.\n" +
                  "Trade-off: O(n) space avoids O(n²) time.\n" +
                  "Time O(n). Space O(n).",
                complete: true
              }
            ]
          }
        },
        {
          type: "typed-payload",
          sequence: 2,
          payload: {
            kind: "structured",
            sections: [
              {
                id: "code",
                body:
                  "function solve(values: number[]): number[] { return values }",
                complete: true
              },
              {
                id: "explain",
                body: "The map resolves each complement once.",
                complete: true
              }
            ]
          }
        },
        { type: "completed", sequence: 3 }
      ]
    })

    const result = await fixture.orchestrator.command({
      type: "submit",
      route: "mode-action",
      input: "Solve the array problem",
      codingIntent: "generate-code"
    })
    expect(result.ok).toBe(true)
    expect(
      currentActive(result.state).sections.map(({ id, state }) => ({
        id,
        state
      }))
    ).toEqual([
      { id: "answer", state: "complete" },
      { id: "plan", state: "complete" },
      { id: "code", state: "complete" },
      { id: "explain", state: "complete" }
    ])
  })

  it("streams stable independently final sections", () => {
    let state = startedSession()
    state = reduceAccepted(state, {
      type: "request-started",
      requestId: "request-1",
      sectionIds: ["summary", "code"]
    })
    state = reduceAccepted(state, {
      type: "section-delta",
      requestId: "request-1",
      sectionId: "code",
      delta: "const answer = 42",
      complete: true
    })
    state = reduceAccepted(state, {
      type: "section-delta",
      requestId: "request-1",
      sectionId: "summary",
      delta: "Approach",
      complete: false
    })
    expect(state.sections.map((section) => section.id)).toEqual([
      "summary",
      "code"
    ])
    const replacement = reduceInterviewSession(state, {
      type: "section-delta",
      requestId: "request-1",
      sectionId: "code",
      delta: "replacement",
      complete: true,
      eventId: "replacement",
      sessionId: state.sessionId,
      sequence: state.sequence + 1,
      at: "now"
    })
    expect(replacement.accepted).toBe(false)
    expect(state.sections[1].body).toBe("const answer = 42")
  })

  it("persists a streamed partial section before cancellation settles", async () => {
    const fixture = createTestOrchestratorWithFactory(
      new BlockingStreamingFactory()
    )
    expect(
      await fixture.orchestrator.command({
        type: "start",
        snapshot: TEST_SNAPSHOT
      })
    ).toMatchObject({ ok: true })
    const submission = fixture.orchestrator.command({
      type: "submit",
      route: "mode-action",
      input: "solve progressively",
      sectionIds: ["answer"]
    })

    await vi.waitFor(() => {
      expect(
        currentActive(fixture.orchestrator.current()).sections[0]
      ).toMatchObject({
        body: "persisted partial",
        state: "partial"
      })
    })
    const requestId = currentActive(
      fixture.orchestrator.current()
    ).requests[0].id
    const cancelled = fixture.orchestrator.command({
      type: "cancel",
      requestId
    })

    expect(await submission).toMatchObject({ ok: true })
    expect(await cancelled).toMatchObject({ ok: true })
    expect(
      currentActive(fixture.orchestrator.current()).sections[0]
    ).toMatchObject({
      body: "persisted partial",
      state: "partial"
    })
    expect(
      fixture.records.values.get("active-interview-session")?.session
        .sections[0]
    ).toMatchObject({
      body: "persisted partial",
      state: "partial"
    })
  })
})
