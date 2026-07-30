import type { InterviewOrchestrator } from "./orchestrator"

/**
 * Temporary compatibility facade for inherited shortcut code. Answer
 * generation is owned exclusively by InterviewOrchestrator; this class keeps
 * no provider client, session state, or billing state.
 */
export class ProcessingHelper {
  constructor(private readonly orchestrator: InterviewOrchestrator) {}

  async processScreenshots(): Promise<void> {
    const state = this.orchestrator.current()
    if (state.lifecycle !== "active") {
      throw new Error("Start an interview before submitting evidence")
    }
    await this.orchestrator.command({
      type: "submit",
      route: "mode-action",
      input: "Use the selected evidence",
      sectionIds: ["answer"]
    })
  }

  cancelOngoingRequests(): void {
    const state = this.orchestrator.current()
    if (state.lifecycle !== "active") return
    for (const request of state.requests.filter(
      (candidate) => !candidate.completed && !candidate.cancelled
    )) {
      void this.orchestrator.command({
        type: "cancel",
        requestId: request.id
      })
    }
  }
}
