import { globalShortcut, app, type BrowserWindow } from "electron"
import { configHelper } from "./ConfigHelper"

export interface ShortcutsHelperDependencies {
  readonly getMainWindow: () => BrowserWindow | null
  readonly captureScreenshot: () => Promise<void>
  readonly submitSelectedEvidence: () => Promise<void>
  readonly resetInterview: () => Promise<void>
  readonly excludeLastScreenshot: () => Promise<void>
  readonly isVisible: () => boolean
  readonly toggleMainWindow: () => void
  readonly moveWindowLeft: () => void
  readonly moveWindowRight: () => void
  readonly moveWindowUp: () => void
  readonly moveWindowDown: () => void
}

export class ShortcutsHelper {
  constructor(private readonly deps: ShortcutsHelperDependencies) {}

  private adjustOpacity(delta: number): void {
    const mainWindow = this.deps.getMainWindow()
    if (!mainWindow) return
    const newOpacity = Math.max(
      0.1,
      Math.min(1, mainWindow.getOpacity() + delta)
    )
    mainWindow.setOpacity(newOpacity)
    configHelper.setOpacity(newOpacity)
    if (newOpacity > 0.1 && !this.deps.isVisible()) {
      this.deps.toggleMainWindow()
    }
  }

  registerGlobalShortcuts(): void {
    globalShortcut.register("CommandOrControl+H", () => {
      void this.deps.captureScreenshot()
    })
    globalShortcut.register("CommandOrControl+Enter", () => {
      void this.deps.submitSelectedEvidence()
    })
    globalShortcut.register("CommandOrControl+R", () => {
      void this.deps.resetInterview()
    })
    globalShortcut.register("CommandOrControl+Left", this.deps.moveWindowLeft)
    globalShortcut.register("CommandOrControl+Right", this.deps.moveWindowRight)
    globalShortcut.register("CommandOrControl+Down", this.deps.moveWindowDown)
    globalShortcut.register("CommandOrControl+Up", this.deps.moveWindowUp)
    globalShortcut.register("CommandOrControl+B", this.deps.toggleMainWindow)
    globalShortcut.register("CommandOrControl+Q", () => app.quit())
    globalShortcut.register("CommandOrControl+[", () =>
      this.adjustOpacity(-0.1)
    )
    globalShortcut.register("CommandOrControl+]", () =>
      this.adjustOpacity(0.1)
    )
    globalShortcut.register("CommandOrControl+-", () => {
      const mainWindow = this.deps.getMainWindow()
      if (mainWindow) {
        mainWindow.webContents.setZoomLevel(
          mainWindow.webContents.getZoomLevel() - 0.5
        )
      }
    })
    globalShortcut.register("CommandOrControl+0", () => {
      this.deps.getMainWindow()?.webContents.setZoomLevel(0)
    })
    globalShortcut.register("CommandOrControl+=", () => {
      const mainWindow = this.deps.getMainWindow()
      if (mainWindow) {
        mainWindow.webContents.setZoomLevel(
          mainWindow.webContents.getZoomLevel() + 0.5
        )
      }
    })
    globalShortcut.register("CommandOrControl+L", () => {
      void this.deps.excludeLastScreenshot()
    })
    app.on("will-quit", () => globalShortcut.unregisterAll())
  }
}
