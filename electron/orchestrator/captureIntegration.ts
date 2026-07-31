import type { InterviewOrchestrator } from "./InterviewOrchestrator"

export interface ScreenshotQueue {
  takeScreenshot(
    hideMainWindow: () => void,
    showMainWindow: () => void
  ): Promise<string>
  getImagePreview(screenshotId: string): Promise<string>
  getScreenshotQueue(): string[]
  deleteScreenshot(
    screenshotId: string
  ): Promise<{ success: boolean; error?: string }>
  clearQueues(): Promise<void>
}

export class InterviewCaptureController {
  constructor(
    private readonly orchestrator: InterviewOrchestrator,
    private readonly screenshots: ScreenshotQueue,
    private readonly hideMainWindow: () => void,
    private readonly showMainWindow: () => void,
    private readonly now: () => string = () => new Date().toISOString(),
    private readonly isMainWindowVisible: () => boolean = () => true
  ) {}

  async capture(): Promise<void> {
    const restoreVisibility = this.isMainWindowVisible()
    const screenshotId = await this.screenshots.takeScreenshot(
      this.hideMainWindow,
      restoreVisibility ? this.showMainWindow : () => undefined
    )
    const content = await this.screenshots.getImagePreview(screenshotId)
    if (content.length === 0) {
      await this.screenshots.deleteScreenshot(screenshotId)
      throw new Error("Screenshot could not be decrypted for submission")
    }
    const result = await this.orchestrator.command({
      type: "stage-artifact",
      artifact: {
        id: this.artifactId(screenshotId),
        kind: "screenshot",
        finalizedAt: this.now(),
        content
      }
    })
    if (!result.ok) {
      await this.screenshots.deleteScreenshot(screenshotId)
      throw new Error(result.error ?? "Screenshot could not be staged")
    }
  }

  async submitSelectedEvidence(): Promise<void> {
    const result = await this.orchestrator.command({
      type: "submit",
      route: "mode-action",
      input: "Use the selected evidence",
      sectionIds: ["answer"]
    })
    if (!result.ok) throw new Error(result.error ?? "Evidence submission failed")
  }

  async debugCurrentCode(): Promise<void> {
    const state = this.orchestrator.current()
    if (state.lifecycle !== "active" || state.snapshot.mode !== "coding") {
      throw new Error("Fix current code requires an active Coding question")
    }
    const restoreVisibility = this.isMainWindowVisible()
    const screenshotId = await this.screenshots.takeScreenshot(
      this.hideMainWindow,
      restoreVisibility ? this.showMainWindow : () => undefined
    )
    const artifactId = this.artifactId(screenshotId)
    const content = await this.screenshots.getImagePreview(screenshotId)
    if (content.length === 0) {
      await this.screenshots.deleteScreenshot(screenshotId)
      throw new Error("Debug screenshot could not be decrypted")
    }
    const staged = await this.orchestrator.command({
      type: "stage-artifact",
      artifact: {
        id: artifactId,
        kind: "screenshot",
        finalizedAt: this.now(),
        content
      }
    })
    if (!staged.ok) {
      await this.screenshots.deleteScreenshot(screenshotId)
      throw new Error(staged.error ?? "Debug screenshot could not be staged")
    }
    const fixVersion =
      state.sections.filter((section) => section.id.startsWith("fix-")).length + 1
    const submitted = await this.orchestrator.command({
      type: "submit",
      route: "mode-action",
      codingIntent: "debug",
      input: "Diagnose only the implementation shown in the new screenshot.",
      sectionIds: [`fix-${fixVersion}`],
      artifactIds: [artifactId]
    })
    if (!submitted.ok) {
      throw new Error(submitted.error ?? "Debug request failed")
    }
  }

  async reset(): Promise<Awaited<ReturnType<InterviewOrchestrator["command"]>>> {
    const result = await this.orchestrator.command({ type: "reset" })
    if (!result.ok) throw new Error(result.error ?? "Interview reset failed")
    await this.screenshots.clearQueues()
    return result
  }

  async excludeLastScreenshot(): Promise<void> {
    const screenshotId = this.screenshots.getScreenshotQueue().at(-1)
    if (!screenshotId) return
    const result = await this.orchestrator.command({
      type: "select-artifact",
      artifactId: this.artifactId(screenshotId),
      selected: false
    })
    if (!result.ok) throw new Error(result.error ?? "Screenshot exclusion failed")
    const deleted = await this.screenshots.deleteScreenshot(screenshotId)
    if (!deleted.success) {
      throw new Error(deleted.error ?? "Screenshot retention cleanup failed")
    }
  }

  private artifactId(screenshotId: string): string {
    return `screenshot:${screenshotId}`
  }
}
