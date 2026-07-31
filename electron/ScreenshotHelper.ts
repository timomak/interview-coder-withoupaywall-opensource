import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { v4 as uuidv4 } from "uuid"
import type { BlobDescriptor, BlobRepository } from "./storage"
import { errorMessage } from "./errorUtils"
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore -- the strict checkJs inventory validates this exact CJS module.
import captureRuntime from "./capture/inMemoryDesktopCapture.cjs"

const execFileAsync = promisify(execFile)
const PNG_CONTENT_TYPE = "image/png"

const WINDOWS_CAPTURE_SCRIPT = `
Add-Type -AssemblyName System.Windows.Forms,System.Drawing
$screens = [System.Windows.Forms.Screen]::AllScreens
$top = ($screens | ForEach-Object {$_.Bounds.Top} | Measure-Object -Minimum).Minimum
$left = ($screens | ForEach-Object {$_.Bounds.Left} | Measure-Object -Minimum).Minimum
$right = ($screens | ForEach-Object {$_.Bounds.Right} | Measure-Object -Maximum).Maximum
$bottom = ($screens | ForEach-Object {$_.Bounds.Bottom} | Measure-Object -Maximum).Maximum
$bounds = [System.Drawing.Rectangle]::FromLTRB($left, $top, $right, $bottom)
$bitmap = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$stream = New-Object System.IO.MemoryStream
try {
  $graphics.CopyFromScreen($bounds.Left, $bounds.Top, 0, 0, $bounds.Size)
  $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
  [Console]::Out.Write([Convert]::ToBase64String($stream.ToArray()))
} finally {
  $stream.Dispose()
  $graphics.Dispose()
  $bitmap.Dispose()
}
`

export interface ScreenshotHelperOptions {
  readonly platform?: NodeJS.Platform
  readonly capture?: (displayId?: number) => Promise<Buffer>
  readonly captureWindowsFallback?: () => Promise<Buffer>
  readonly primaryDisplayId?: () => number
  readonly id?: () => string
  readonly hideDelayMs?: number
  readonly showDelayMs?: number
  readonly maximumScreenshots?: number
}

async function captureWindowsFallback(): Promise<Buffer> {
  const result = await execFileAsync(
    "powershell",
    [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      WINDOWS_CAPTURE_SCRIPT
    ],
    { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }
  )
  const encoded = String(result.stdout).trim()
  const bytes = Buffer.from(encoded, "base64")
  if (bytes.length === 0) {
    throw new Error("Windows screenshot fallback returned no image bytes")
  }
  return bytes
}

export class ScreenshotHelper {
  private screenshotQueue: string[] = []
  private readonly platform: NodeJS.Platform
  private readonly capture: (displayId?: number) => Promise<Buffer>
  private readonly windowsFallback: () => Promise<Buffer>
  private readonly id: () => string
  private readonly hideDelayMs: number
  private readonly showDelayMs: number
  private readonly maximumScreenshots: number
  private readonly primaryDisplayId?: () => number

  constructor(
    private readonly blobs: BlobRepository,
    options: ScreenshotHelperOptions = {}
  ) {
    this.platform = options.platform ?? process.platform
    this.capture =
      options.capture ??
      (async (displayId) =>
        (await captureRuntime.captureDisplayInMemory(displayId)).bytes)
    this.windowsFallback =
      options.captureWindowsFallback ?? captureWindowsFallback
    this.id = options.id ?? uuidv4
    this.hideDelayMs =
      options.hideDelayMs ?? (this.platform === "win32" ? 500 : 300)
    this.showDelayMs = options.showDelayMs ?? 200
    this.maximumScreenshots = options.maximumScreenshots ?? 5
    this.primaryDisplayId = options.primaryDisplayId
  }

  getScreenshotQueue(): string[] {
    return [...this.screenshotQueue]
  }

  async clearQueues(): Promise<void> {
    await this.blobs.clearAll()
    this.screenshotQueue = []
  }

  async takeScreenshot(
    hideMainWindow: () => void,
    showMainWindow: () => void
  ): Promise<string> {
    hideMainWindow()
    await this.delay(this.hideDelayMs)

    let bytes: Buffer | undefined
    try {
      bytes = await this.captureScreenshot()
      if (bytes.length === 0) {
        throw new Error("Screenshot capture returned empty image bytes")
      }
      const screenshotId = this.id()
      await this.blobs.put(this.descriptor(screenshotId), bytes)
      this.screenshotQueue.push(screenshotId)
      while (this.screenshotQueue.length > this.maximumScreenshots) {
        const expiredId = this.screenshotQueue.shift()
        if (expiredId) await this.blobs.remove(expiredId)
      }
      return screenshotId
    } catch (error) {
      throw new Error(`Failed to capture screenshot: ${errorMessage(error)}`)
    } finally {
      bytes?.fill(0)
      await this.delay(this.showDelayMs)
      showMainWindow()
    }
  }

  async getImagePreview(screenshotId: string): Promise<string> {
    if (!this.screenshotQueue.includes(screenshotId)) return ""
    const bytes = await this.blobs.get(this.descriptor(screenshotId))
    if (!bytes) return ""
    try {
      return `data:${PNG_CONTENT_TYPE};base64,${bytes.toString("base64")}`
    } finally {
      bytes.fill(0)
    }
  }

  async deleteScreenshot(
    screenshotId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      await this.blobs.remove(screenshotId)
      this.screenshotQueue = this.screenshotQueue.filter(
        (candidate) => candidate !== screenshotId
      )
      return { success: true }
    } catch (error) {
      return { success: false, error: errorMessage(error) }
    }
  }

  private async captureScreenshot(): Promise<Buffer> {
    try {
      return await this.capture(this.primaryDisplayId?.())
    } catch (error) {
      if (this.platform !== "win32") throw error
      return this.windowsFallback()
    }
  }

  private descriptor(id: string): BlobDescriptor {
    return {
      id,
      contentType: PNG_CONTENT_TYPE,
      retentionClass: "artifact"
    }
  }

  private async delay(milliseconds: number): Promise<void> {
    if (milliseconds <= 0) return
    await new Promise((resolve) => setTimeout(resolve, milliseconds))
  }
}
