import {
  app,
  BrowserWindow,
  safeStorage,
  screen,
  shell,
  type BrowserWindowConstructorOptions
} from "electron"
import fs from "node:fs"
import path from "node:path"
import { initAutoUpdater } from "./autoUpdater"
import {
  createCaptureProtectedWindow,
  revealCaptureProtectedWindow
} from "./captureProtection"
import { configHelper } from "./ConfigHelper"
import { initializeIpcHandlers } from "./ipcHandlers"
import {
  ActiveSessionRepository,
  InterviewOrchestrator
} from "./orchestrator"
import { ProviderRuntime } from "./providers"
import {
  ElectronSafeStorageKeyProtector,
  EncryptedRecordRepository,
  InstallationKeyService,
  StoragePaths
} from "./storage"
import type {
  M04ActiveSnapshot
} from "./orchestrator"
import type { ResetArchive } from "../src/shared/interview"
import { INTERVIEW_STATE_EVENT } from "../src/shared/interview"
import { createWindowOpenHandler } from "./windowOpenPolicy"

const isDevelopment = process.env.NODE_ENV === "development"

const state = {
  mainWindow: null as BrowserWindow | null,
  visible: false,
  screenWidth: 0,
  screenHeight: 0
}

export interface IShortcutsHelperDeps {
  getMainWindow: () => BrowserWindow | null
  takeScreenshot: () => Promise<string>
  getImagePreview: (filePath: string) => Promise<string>
  processingHelper: {
    processScreenshots(): Promise<void>
    cancelOngoingRequests(): void
  } | null
  clearQueues: () => void
  setView: (view: "queue" | "solutions" | "debug") => void
  isVisible: () => boolean
  toggleMainWindow: () => void
  moveWindowLeft: () => void
  moveWindowRight: () => void
  moveWindowUp: () => void
  moveWindowDown: () => void
}

function focusMainWindow(mainWindow: BrowserWindow): void {
  revealCaptureProtectedWindow(mainWindow, (protectedWindow) => {
    if (protectedWindow.isMinimized()) protectedWindow.restore()
    protectedWindow.focus()
  })
}

function showMainWindowInactive(mainWindow: BrowserWindow): void {
  revealCaptureProtectedWindow(mainWindow, (protectedWindow) => {
    protectedWindow.showInactive()
  })
}

function createWindow(): void {
  if (state.mainWindow) {
    focusMainWindow(state.mainWindow)
    return
  }
  const workArea = screen.getPrimaryDisplay().workAreaSize
  state.screenWidth = workArea.width
  state.screenHeight = workArea.height
  const options: BrowserWindowConstructorOptions = {
    width: 800,
    height: 600,
    minWidth: 750,
    minHeight: 550,
    x: 0,
    y: 50,
    alwaysOnTop: true,
    show: false,
    frame: false,
    transparent: true,
    fullscreenable: false,
    hasShadow: false,
    skipTaskbar: true,
    type: "panel",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: isDevelopment
        ? path.join(__dirname, "../dist-electron/preload.js")
        : path.join(__dirname, "preload.js")
    }
  }
  const mainWindow = createCaptureProtectedWindow(
    () => new BrowserWindow(options)
  )
  mainWindow.webContents.setWindowOpenHandler(
    createWindowOpenHandler((url) => shell.openExternal(url))
  )
  state.mainWindow = mainWindow
  mainWindow.once("ready-to-show", () => {
    showMainWindowInactive(mainWindow)
    state.visible = true
  })
  mainWindow.on("closed", () => {
    state.mainWindow = null
    state.visible = false
  })
  if (isDevelopment) {
    void mainWindow.loadURL("http://localhost:54321")
  } else {
    const indexPath = path.join(__dirname, "../dist/index.html")
    if (!fs.existsSync(indexPath)) {
      throw new Error("Production renderer is missing")
    }
    void mainWindow.loadFile(indexPath)
  }
}

function toggleMainWindow(): void {
  const mainWindow = state.mainWindow
  if (!mainWindow) return
  if (state.visible) {
    mainWindow.hide()
    state.visible = false
  } else {
    focusMainWindow(mainWindow)
    state.visible = true
  }
}

function setWindowDimensions(width: number, height: number): void {
  const mainWindow = state.mainWindow
  if (
    !mainWindow ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return
  }
  mainWindow.setBounds({
    width: Math.min(Math.ceil(width), state.screenWidth),
    height: Math.min(Math.ceil(height), state.screenHeight)
  })
}

function executableFromEnvironment(
  name: "CLAUDE_CODE_EXECUTABLE" | "CODEX_EXECUTABLE",
  fallback: string
): string {
  const configured = process.env[name]
  const executable = configured ?? fallback
  if (!path.isAbsolute(executable)) {
    throw new Error(`${name} must be an absolute executable path`)
  }
  return executable
}

function createOrchestrator(): InterviewOrchestrator {
  const storagePaths = new StoragePaths(
    path.join(app.getPath("userData"), "encrypted")
  )
  const keyService = new InstallationKeyService(
    storagePaths,
    new ElectronSafeStorageKeyProtector(safeStorage)
  )
  const records = new EncryptedRecordRepository<
    M04ActiveSnapshot | ResetArchive
  >(storagePaths, keyService)
  const providerRuntime = new ProviderRuntime({
    executables: {
      "claude-code": executableFromEnvironment(
        "CLAUDE_CODE_EXECUTABLE",
        "/opt/homebrew/bin/claude"
      ),
      codex: executableFromEnvironment(
        "CODEX_EXECUTABLE",
        "/opt/homebrew/bin/codex"
      )
    }
  })
  return new InterviewOrchestrator({
    repository: new ActiveSessionRepository(records),
    providerFactory: {
      create: (snapshot, opaqueProviderConversationId) =>
        providerRuntime.startSession({
          provider: snapshot.provider,
          model: snapshot.model,
          responseMode: snapshot.responseMode,
          conversationId: opaqueProviderConversationId
        })
    },
    onState: (session) => {
      state.mainWindow?.webContents.send(INTERVIEW_STATE_EVENT, session)
    }
  })
}

async function initializeApplication(): Promise<void> {
  const userData = path.join(app.getPath("appData"), "InterviewCopilot")
  app.setPath("userData", userData)
  const orchestrator = createOrchestrator()
  createWindow()
  initializeIpcHandlers({
    orchestrator,
    setWindowDimensions,
    toggleMainWindow,
    showSettings: () =>
      state.mainWindow?.webContents.send("settings:show")
  })
  await orchestrator.inspectRecovery()
  initAutoUpdater()
  configHelper.loadConfig()
}

const singleInstance = app.requestSingleInstanceLock()
if (!singleInstance) {
  app.quit()
} else {
  app.on("second-instance", () => {
    if (state.mainWindow) focusMainWindow(state.mainWindow)
  })
  app.on("activate", createWindow)
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit()
  })
  void app.whenReady().then(initializeApplication)
}
