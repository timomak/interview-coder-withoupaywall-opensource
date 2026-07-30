import type { ProviderSession } from "../providers"
import type { ProviderSelection } from "../../src/shared/provider"
import type { StartSnapshot } from "../../src/shared/interview"
import type { ProviderConversationFactory } from "./InterviewOrchestrator"
import { InterviewCaptureController, ScreenshotQueue } from "./captureIntegration"
import type { M04ActiveSnapshot } from "./sessionRepository"
import {
  FakeProviderFactory,
  MemoryRecordRepository,
  TEST_SNAPSHOT,
  createTestOrchestrator,
  createTestOrchestratorWithFactory,
  currentActive
} from "./testSupport"

const selection: ProviderSelection = {
  provider: "codex",
  model: "gpt-5.4",
  responseMode: "fast",
  effort: "low"
}

class ResetBlockingFactory implements ProviderConversationFactory {
  private startedResolve!: () => void
  readonly started = new Promise<void>((resolve) => {
    this.startedResolve = resolve
  })

  constructor(readonly trace: string[] = []) {}

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
        const started = {
          type: "started" as const,
          sequence: 1,
        }
        await onEvent?.(started)
        this.trace.push("provider-started")
        this.startedResolve()
        await new Promise<void>((resolve) => {
          if (signal?.aborted) {
            resolve()
            return
          }
          signal?.addEventListener(
            "abort",
            () => {
              this.trace.push("abort-observed")
              resolve()
            },
            { once: true }
          )
        })
        const stale = {
          type: "text-delta" as const,
          sequence: 2,
          text: "must not survive reset"
        }
        await onEvent?.(stale)
        await new Promise((resolve) => setTimeout(resolve, 5))
        this.trace.push("provider-settled")
        return {
          selection,
          events: [
            started,
            stale,
            { type: "completed" as const, sequence: 3 }
          ]
        }
      }
    }
  }
}

class HostileDelayedRepository extends MemoryRecordRepository<M04ActiveSnapshot> {
  readonly completionSequences: number[] = []
  readonly trace: string[]
  maxConcurrentWrites = 0
  private concurrentWrites = 0

  constructor(trace: string[] = []) {
    super()
    this.trace = trace
  }

  override async put(id: string, record: M04ActiveSnapshot): Promise<void> {
    this.concurrentWrites += 1
    this.maxConcurrentWrites = Math.max(
      this.maxConcurrentWrites,
      this.concurrentWrites
    )
    const sequence =
      record.schemaVersion === 1 ? record.session.sequence : undefined
    try {
      await new Promise((resolve) =>
        setTimeout(
          resolve,
          sequence === undefined ? 1 : Math.max(1, 30 - sequence)
        )
      )
      await super.put(id, record)
      if (sequence !== undefined) {
        this.completionSequences.push(sequence)
        this.trace.push(`active-write:${sequence}`)
      } else if (id.startsWith("archive:")) {
        this.trace.push("archive-write")
      }
    } finally {
      this.concurrentWrites -= 1
    }
  }
}

describe("Reset semantics", () => {
  it("performs the sole terminal lifecycle transition", async () => {
    const { orchestrator, records } = createTestOrchestrator()
    await orchestrator.start(TEST_SNAPSHOT)
    await orchestrator.reset()
    expect(orchestrator.current()).toMatchObject({
      lifecycle: "idle",
      lastArchive: {
        session: { lifecycle: "active", captureActive: false }
      }
    })
    expect(records.values.has("active-interview-session")).toBe(false)
    expect(
      [...records.values.keys()].some((id) => id.startsWith("archive:"))
    ).toBe(true)
  })

  it("routes capture queue actions through typed interview commands", async () => {
    const { orchestrator } = createTestOrchestrator()
    await orchestrator.start(TEST_SNAPSHOT)
    const deleted: string[] = []
    let cleared = false
    const screenshots: ScreenshotQueue = {
      takeScreenshot: async (hide, show) => {
        hide()
        show()
        return "opaque-capture-001"
      },
      getImagePreview: async () => "data:image/png;base64,capture",
      getScreenshotQueue: () => ["opaque-capture-001"],
      deleteScreenshot: async (screenshotId) => {
        deleted.push(screenshotId)
        return { success: true }
      },
      clearQueues: async () => {
        cleared = true
      }
    }
    const visibility: string[] = []
    const controller = new InterviewCaptureController(
      orchestrator,
      screenshots,
      () => visibility.push("hidden"),
      () => visibility.push("shown"),
      () => "2026-07-30T12:00:00Z"
    )

    await controller.capture()
    expect(visibility).toEqual(["hidden", "shown"])
    expect(currentActive(orchestrator.current()).artifacts[0]).toMatchObject({
      id: "screenshot:opaque-capture-001",
      selected: true,
      submitted: false
    })
    await controller.excludeLastScreenshot()
    expect(currentActive(orchestrator.current()).artifacts[0].selected).toBe(
      false
    )
    await controller.reset()
    expect(orchestrator.current().lifecycle).toBe("idle")
    expect(cleared).toBe(true)
    expect(deleted).toEqual(["opaque-capture-001"])
  })

  it("serializes reset after compact cancellation before archiving", async () => {
    const trace: string[] = []
    const provider = new ResetBlockingFactory(trace)
    const hostileRecords = new HostileDelayedRepository(trace)
    const { orchestrator, records } = createTestOrchestratorWithFactory(
      provider,
      hostileRecords
    )
    await orchestrator.command({ type: "start", snapshot: TEST_SNAPSHOT })
    const submission = orchestrator.command({
      type: "submit",
      route: "clarification",
      input: "blocking compact turn"
    })
    await provider.started
    const reset = orchestrator.command({ type: "reset" })

    expect(await submission).toMatchObject({ ok: true })
    expect(await reset).toMatchObject({ ok: true })
    expect(trace.indexOf("abort-observed")).toBeGreaterThan(-1)
    expect(trace.indexOf("provider-settled")).toBeLessThan(
      trace.indexOf("archive-write")
    )
    const afterAbort = trace.slice(trace.indexOf("abort-observed") + 1)
    expect(afterAbort.some((item) => item.startsWith("active-write:"))).toBe(
      false
    )
    expect(orchestrator.current()).toMatchObject({
      lifecycle: "idle",
      lastArchive: {
        session: {
          lifecycle: "active",
          captureActive: false,
          compactExchanges: []
        }
      }
    })
    expect(records.values.has("active-interview-session")).toBe(false)
  })

  it("serializes hostile concurrent submissions and delayed saves", async () => {
    const records = new HostileDelayedRepository()
    const provider = new FakeProviderFactory()
    provider.queued.push(
      {
        selection,
        events: [
          {
            type: "typed-payload",
            sequence: 1,
            payload: {
              kind: "structured",
              sections: [{ id: "first", body: "first answer" }]
            }
          },
          { type: "completed", sequence: 2 }
        ]
      },
      {
        selection,
        events: [
          {
            type: "typed-payload",
            sequence: 1,
            payload: {
              kind: "structured",
              sections: [{ id: "second", body: "second answer" }]
            }
          },
          { type: "completed", sequence: 2 }
        ]
      }
    )
    const fixture = createTestOrchestrator(provider, records)
    await fixture.orchestrator.command({
      type: "start",
      snapshot: TEST_SNAPSHOT
    })
    const first = fixture.orchestrator.command({
      type: "submit",
      route: "mode-action",
      input: "first concurrent command",
      sectionIds: ["first"]
    })
    const second = fixture.orchestrator.command({
      type: "submit",
      route: "mode-action",
      input: "second concurrent command",
      sectionIds: ["second"]
    })

    expect(await Promise.all([first, second])).toEqual([
      expect.objectContaining({ ok: true }),
      expect.objectContaining({ ok: true })
    ])
    expect(provider.prompts.map((prompt) => JSON.parse(prompt).input)).toEqual([
      "first concurrent command",
      "second concurrent command"
    ])
    expect(records.maxConcurrentWrites).toBe(1)
    expect(
      records.completionSequences.every(
        (sequence, index, values) =>
          index === 0 || sequence >= values[index - 1]
      )
    ).toBe(true)
    expect(
      currentActive(fixture.orchestrator.current()).sections.map(
        ({ id, body }) => ({ id, body })
      )
    ).toEqual([
      { id: "first", body: "first answer" },
      { id: "second", body: "second answer" }
    ])
  })
})
