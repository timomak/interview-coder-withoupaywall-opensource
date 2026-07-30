import path from "node:path"
import type { InterviewOrchestrator } from "./InterviewOrchestrator"

export interface ScreenshotQueue {
  takeScreenshot(
    hideMainWindow: () => void,
    showMainWindow: () => void
  ): Promise<string>
  getImagePreview(filePath: string): Promise<string>
  getScreenshotQueue(): string[]
  deleteScreenshot(
    filePath: string
  ): Promise<{ success: boolean; error?: string }>
  clearQueues(): void
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
    const filePath = await this.screenshots.takeScreenshot(
      this.hideMainWindow,
      this.showMainWindow
    )
    const content = await this.screenshots.getImagePreview(filePath)
    const result = await this.orchestrator.command({
      type: "stage-artifact",
      artifact: {
        id: this.artifactId(filePath),
        kind: "screenshot",
        finalizedAt: this.now(),
        content
      }
    })
    if (!result.ok) {
      await this.screenshots.deleteScreenshot(filePath)
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
    this.screenshots.clearQueues()
  }

  async excludeLastScreenshot(): Promise<void> {
    const filePath = this.screenshots.getScreenshotQueue().at(-1)
    if (!filePath) return
    const result = await this.orchestrator.command({
      type: "select-artifact",
      artifactId: this.artifactId(filePath),
      selected: false
    })
    if (!result.ok) throw new Error(result.error ?? "Screenshot exclusion failed")
  }

  private artifactId(filePath: string): string {
    return `screenshot:${path.basename(filePath, path.extname(filePath))}`
  }
}
