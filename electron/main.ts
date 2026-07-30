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
  InterviewCaptureController,
  InterviewOrchestrator
} from "./orchestrator"
import { ProviderRuntime, diagnoseProvider } from "./providers"
import {
  ElectronSafeStorageKeyProtector,
  EncryptedBlobRepository,
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
import { ScreenshotHelper } from "./ScreenshotHelper"
import { ShortcutsHelper } from "./shortcuts"
import { clampWindowBounds } from "./window/displayGeometry"
import type {
  ProviderDiagnostics,
  ProviderId,
  ResponseMode
} from "../src/shared/provider"

const isDevelopment = process.env.NODE_ENV === "development"

const state = {
  mainWindow: null as BrowserWindow | null,
  visible: false,
  screenWidth: 0,
  screenHeight: 0,
  currentX: 0,
  currentY: 50,
  windowWidth: 800,
  windowHeight: 600,
  step: 60
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
    state.visible = false
  })
  mainWindow.on("closed", () => {
    state.mainWindow = null
    state.visible = false
  })
  mainWindow.on("move", () => {
    const [x, y] = mainWindow.getPosition()
    state.currentX = x
    state.currentY = y
  })
  mainWindow.on("resize", () => {
    const [width, height] = mainWindow.getSize()
    state.windowWidth = width
    state.windowHeight = height
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

function hideMainWindow(): void {
  const mainWindow = state.mainWindow
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.hide()
  state.visible = false
}

function showMainWindow(): void {
  const mainWindow = state.mainWindow
  if (!mainWindow || mainWindow.isDestroyed()) return
  showMainWindowInactive(mainWindow)
  state.visible = true
}

function moveWindowHorizontal(delta: number): void {
  const mainWindow = state.mainWindow
  if (!mainWindow) return
  const bounds = mainWindow.getBounds()
  const workArea = screen.getDisplayMatching(bounds).workArea
  const next = clampWindowBounds(
    { ...bounds, x: bounds.x + delta },
    workArea
  )
  state.currentX = next.x
  state.currentY = next.y
  mainWindow.setBounds(next)
}

function moveWindowVertical(delta: number): void {
  const mainWindow = state.mainWindow
  if (!mainWindow) return
  const bounds = mainWindow.getBounds()
  const workArea = screen.getDisplayMatching(bounds).workArea
  const next = clampWindowBounds(
    { ...bounds, y: bounds.y + delta },
    workArea
  )
  state.currentX = next.x
  state.currentY = next.y
  mainWindow.setBounds(next)
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
  const bounds = mainWindow.getBounds()
  const workArea = screen.getDisplayMatching(bounds).workArea
  mainWindow.setBounds(
    clampWindowBounds(
      { ...bounds, width: Math.ceil(width), height: Math.ceil(height) },
      workArea
    )
  )
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

type ProviderExecutables = Readonly<Record<ProviderId, string>>

function providerExecutables(): ProviderExecutables {
  return {
    "claude-code": executableFromEnvironment(
      "CLAUDE_CODE_EXECUTABLE",
      "/opt/homebrew/bin/claude"
    ),
    codex: executableFromEnvironment(
      "CODEX_EXECUTABLE",
      "/opt/homebrew/bin/codex"
    )
  }
}

async function providerDiagnostics(
  executables: ProviderExecutables
): Promise<readonly ProviderDiagnostics[]> {
  return Promise.all(
    (["claude-code", "codex"] as const).map((provider) =>
      diagnoseProvider(provider, executables[provider])
    )
  )
}

function createOrchestrator(
  executables: ProviderExecutables,
  repository: ActiveSessionRepository
): InterviewOrchestrator {
  const providerRuntime = new ProviderRuntime({
    executables
  })
  return new InterviewOrchestrator({
    repository,
    providerFactory: {
      create: (snapshot, requestedConversationId) =>
        providerRuntime.startSession({
          mode: "create",
          provider: snapshot.provider,
          model: snapshot.model,
          responseMode: snapshot.responseMode,
          requestedConversationId
        }),
      resume: (snapshot, conversationId) =>
        providerRuntime.startSession({
          mode: "resume",
          provider: snapshot.provider,
          model: snapshot.model,
          responseMode: snapshot.responseMode,
          conversationId
        })
    },
    authorizeStart: async (snapshot) => {
      const config = configHelper.loadConfig()
      if (
        config.provider !== snapshot.provider ||
        config.model !== snapshot.model
      ) {
        return false
      }
      const diagnostics = await diagnoseProvider(
        snapshot.provider,
        executables[snapshot.provider]
      )
      return (
        diagnostics.installed &&
        diagnostics.authenticated &&
        diagnostics.supported
      )
    },
    onState: (session) => {
      state.mainWindow?.webContents.send(INTERVIEW_STATE_EVENT, session)
    }
  })
}

async function initializeApplication(): Promise<void> {
  const userData = path.join(app.getPath("appData"), "InterviewCopilot")
  app.setPath("userData", userData)
  const executables = providerExecutables()
  const storagePaths = new StoragePaths(path.join(userData, "encrypted"))
  const keyService = new InstallationKeyService(
    storagePaths,
    new ElectronSafeStorageKeyProtector(safeStorage)
  )
  const records = new EncryptedRecordRepository<
    M04ActiveSnapshot | ResetArchive
  >(storagePaths, keyService)
  const orchestrator = createOrchestrator(
    executables,
    new ActiveSessionRepository(records)
  )
  createWindow()
  const screenshots = new ScreenshotHelper(
    new EncryptedBlobRepository(
      storagePaths,
      keyService,
      undefined,
      "screenshots"
    ),
    {
      primaryDisplayId: () => screen.getPrimaryDisplay().id
    }
  )
  const capture = new InterviewCaptureController(
    orchestrator,
    screenshots,
    hideMainWindow,
    showMainWindow,
    undefined,
    () => state.visible
  )
  const shortcuts = new ShortcutsHelper({
    getMainWindow: () => state.mainWindow,
    captureScreenshot: () => capture.capture(),
    submitSelectedEvidence: () => capture.submitSelectedEvidence(),
    resetInterview: async () => {
      await capture.reset()
    },
    excludeLastScreenshot: () => capture.excludeLastScreenshot(),
    isVisible: () => state.visible,
    toggleMainWindow,
    moveWindowLeft: () => moveWindowHorizontal(-state.step),
    moveWindowRight: () => moveWindowHorizontal(state.step),
    moveWindowUp: () => moveWindowVertical(-state.step),
    moveWindowDown: () => moveWindowVertical(state.step)
  })
  shortcuts.registerGlobalShortcuts()
  initializeIpcHandlers({
    orchestrator,
    setWindowDimensions,
    toggleMainWindow,
    captureScreenshot: () => capture.capture(),
    setWindowPointerEvents: (ignore, forward) =>
      state.mainWindow?.setIgnoreMouseEvents(ignore, { forward }),
    diagnoseProviders: () => providerDiagnostics(executables),
    resetInterview: () => capture.reset(),
    configureProvider: async (
      provider: ProviderId,
      model: string,
      responseMode: ResponseMode
    ) => {
      const diagnostics = await diagnoseProvider(
        provider,
        executables[provider]
      )
      if (
        !diagnostics.installed ||
        !diagnostics.authenticated ||
        !diagnostics.supported
      ) {
        throw new Error("Selected provider subscription is not ready")
      }
      return configHelper.updateConfig({ provider, model, responseMode })
    },
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
