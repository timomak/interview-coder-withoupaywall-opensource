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
    private readonly now: () => string = () => new Date().toISOString()
  ) {}

  async capture(): Promise<void> {
    const screenshotId = await this.screenshots.takeScreenshot(
      this.hideMainWindow,
      this.showMainWindow
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

  async reset(): Promise<void> {
    const result = await this.orchestrator.command({ type: "reset" })
    if (!result.ok) throw new Error(result.error ?? "Interview reset failed")
    await this.screenshots.clearQueues()
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
