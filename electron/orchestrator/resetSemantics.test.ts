import type { ProviderSession } from "../providers"
import type { ProviderSelection } from "../../src/shared/provider"
import type { StartSnapshot } from "../../src/shared/interview"
import type { ProviderConversationFactory } from "./InterviewOrchestrator"
import { InterviewCaptureController, ScreenshotQueue } from "./captureIntegration"
import {
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
        const event = {
          type: "text-delta" as const,
          sequence: 1,
          text: "must not survive reset"
        }
        await onEvent?.(event)
        await new Promise<void>((resolve) => {
          if (signal?.aborted) {
            resolve()
            return
          }
          signal?.addEventListener("abort", () => resolve(), { once: true })
        })
        return { selection, events: [event] }
      }
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
        return "/tmp/capture-001.png"
      },
      getImagePreview: async () => "data:image/png;base64,capture",
      getScreenshotQueue: () => ["/tmp/capture-001.png"],
      deleteScreenshot: async (filePath) => {
        deleted.push(filePath)
        return { success: true }
      },
      clearQueues: () => {
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
      id: "screenshot:capture-001",
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
    expect(deleted).toEqual([])
  })

  it("serializes reset after provider cancellation before archiving", async () => {
    const { orchestrator, records } = createTestOrchestratorWithFactory(
      new ResetBlockingFactory()
    )
    await orchestrator.command({ type: "start", snapshot: TEST_SNAPSHOT })
    const submission = orchestrator.command({
      type: "submit",
      route: "mode-action",
      input: "blocking turn",
      sectionIds: ["answer"]
    })
    await vi.waitFor(() => {
      expect(currentActive(orchestrator.current()).requests).toHaveLength(1)
    })
    const reset = orchestrator.command({ type: "reset" })

    expect(await submission).toMatchObject({ ok: true })
    expect(await reset).toMatchObject({ ok: true })
    expect(orchestrator.current()).toMatchObject({
      lifecycle: "idle",
      lastArchive: {
        session: {
          lifecycle: "active",
          captureActive: false
        }
      }
    })
    expect(records.values.has("active-interview-session")).toBe(false)
  })
})
