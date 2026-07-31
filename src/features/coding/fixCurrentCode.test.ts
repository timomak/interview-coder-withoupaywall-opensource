import { describe, expect, it } from "vitest"
import {
  InterviewCaptureController,
  type ScreenshotQueue
} from "../../../electron/orchestrator/captureIntegration"
import {
  createTestOrchestrator,
  currentActive
} from "../../../electron/orchestrator/testSupport"

describe("Fix current code", () => {
  it("performs isolated targeted screenshot debug", async () => {
    const fixture = createTestOrchestrator()
    await fixture.orchestrator.command({
      type: "start",
      snapshot: {
        mode: "coding",
        provider: "codex",
        model: "gpt-5.4",
        responseMode: "fast",
        language: "python3",
        context: []
      }
    })
    await fixture.orchestrator.command({
      type: "stage-artifact",
      artifact: {
        id: "screenshot:pending",
        kind: "screenshot",
        finalizedAt: "t0",
        content: "UNRELATED_PENDING"
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
            kind: "structured",
            sections: [
              {
                id: "fix-1",
                body: JSON.stringify({
                  version: 1,
                  supported: true,
                  issue: "off by one",
                  correction: "change <= to <",
                  explanation: "The final index is out of range."
                })
              }
            ]
          }
        },
        { type: "completed", sequence: 2 }
      ]
    })
    const queue: ScreenshotQueue = {
      takeScreenshot: async () => "debug-new",
      getImagePreview: async () => "NEW_DEBUG_IMAGE",
      getScreenshotQueue: () => ["debug-new"],
      deleteScreenshot: async () => ({ success: true }),
      clearQueues: async () => undefined
    }
    const controller = new InterviewCaptureController(
      fixture.orchestrator,
      queue,
      () => undefined,
      () => undefined
    )
    await controller.debugCurrentCode()
    const state = currentActive(fixture.orchestrator.current())
    expect(
      state.artifacts.find((artifact) => artifact.id === "screenshot:pending")
    ).toMatchObject({ selected: true, submitted: false })
    expect(
      state.artifacts.find((artifact) => artifact.id === "screenshot:debug-new")
    ).toMatchObject({ selected: false, submitted: true })
    const prompt = fixture.providerFactory.prompts.at(-1) ?? ""
    expect(prompt).toContain("NEW_DEBUG_IMAGE")
    expect(prompt).not.toContain("UNRELATED_PENDING")
    expect(state.sections.at(-1)?.id).toBe("fix-1")
  })
})
