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
  applyCaptureProtection,
  applyPointerRouting,
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
import { ProfileRepository } from "./profile/ProfileRepository"
import type { ProfileBundle } from "../src/features/profile/types"
import type {
  M04ActiveSnapshot
} from "./orchestrator"
import type { ResetArchive } from "../src/shared/interview"
import { INTERVIEW_STATE_EVENT } from "../src/shared/interview"
import {
  AUDIO_STATE_EVENT,
  createInitialAudioSessionState
} from "../src/shared/audio"
import { createWindowOpenHandler } from "./windowOpenPolicy"
import { ScreenshotHelper } from "./ScreenshotHelper"
import { ShortcutsHelper } from "./shortcuts"
import { clampWindowBounds } from "./window/displayGeometry"
import { DisplayGeometryStore } from "./window/displayGeometry"
import { ComposerVisibilityController } from "./window/composerVisibility"
import type {
  ProviderDiagnostics,
  ProviderId,
  ResponseMode
} from "../src/shared/provider"
import {
  DEFAULT_SHORTCUT_BINDINGS,
  DEFAULT_LIVE_SHELL_PREFERENCES,
  type HudState,
  type ShortcutAction,
  type ShortcutBindings
} from "../src/shared/shell"
import {
  AudioPreferencesRepository,
  AudioSessionController,
  type M07AudioPreferencesRecord
} from "./audio/session"
import { NativeAudioCaptureRuntime } from "./audio/native/NativeAudioCaptureRuntime"
import { LocalWhisperTranscriber } from "./audio/transcription/LocalWhisperTranscriber"

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

let currentHudState: HudState = "compact-bar"
let geometryStore = new DisplayGeometryStore()
const composerVisibility = new ComposerVisibilityController()
let geometryPersistTimer: NodeJS.Timeout | undefined

function availableDisplayGeometry() {
  return screen.getAllDisplays().map((display) => ({
    id: String(display.id),
    workArea: display.workArea
  }))
}

function defaultBoundsFor(stateName: HudState) {
  const config = configHelper.loadConfig()
  const comfortable = config.shell?.density === "comfortable"
  const height = comfortable ? 52 : 44
  if (stateName === "compact-bar") {
    return { x: state.currentX, y: state.currentY, width: 520, height }
  }
  if (stateName === "compact-answer") {
    return { x: state.currentX, y: state.currentY, width: 520, height: 480 }
  }
  return { x: state.currentX, y: state.currentY, width: 760, height: 600 }
}

function rememberCurrentGeometry(): void {
  const mainWindow = state.mainWindow
  if (!mainWindow || mainWindow.isDestroyed()) return
  const bounds = mainWindow.getBounds()
  const displayId = String(screen.getDisplayMatching(bounds).id)
  geometryStore.remember(displayId, currentHudState, bounds)
}

function persistGeometry(): void {
  rememberCurrentGeometry()
  const config = configHelper.loadConfig()
  configHelper.updateConfig({
    shell: {
      ...(config.shell ?? DEFAULT_LIVE_SHELL_PREFERENCES),
      geometry: geometryStore.snapshot()
    }
  })
}

function scheduleGeometryPersistence(): void {
  if (geometryPersistTimer) clearTimeout(geometryPersistTimer)
  geometryPersistTimer = setTimeout(() => {
    geometryPersistTimer = undefined
    persistGeometry()
  }, 200)
}

function setHudState(nextState: HudState): void {
  const mainWindow = state.mainWindow
  if (!mainWindow || mainWindow.isDestroyed()) return
  rememberCurrentGeometry()
  currentHudState = nextState
  const currentBounds = mainWindow.getBounds()
  const currentDisplay = screen.getDisplayMatching(currentBounds)
  const restored = geometryStore.resolve(
    String(currentDisplay.id),
    nextState,
    defaultBoundsFor(nextState),
    availableDisplayGeometry()
  )
  applyCaptureProtection(mainWindow)
  mainWindow.setResizable(nextState === "expanded")
  mainWindow.setMinimumSize(320, nextState === "compact-bar" ? 44 : 80)
  mainWindow.setBounds(restored)
  persistGeometry()
}

function focusMainWindow(mainWindow: BrowserWindow): void {
  revealCaptureProtectedWindow(mainWindow, (protectedWindow) => {
    if (protectedWindow.isMinimized()) protectedWindow.restore()
    if (!protectedWindow.isVisible()) protectedWindow.showInactive()
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
    width: 520,
    height: 44,
    minWidth: 320,
    minHeight: 44,
    x: 0,
    y: 50,
    alwaysOnTop: true,
    show: false,
    frame: false,
    transparent: true,
    fullscreenable: false,
    resizable: false,
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
    rememberCurrentGeometry()
    scheduleGeometryPersistence()
  })
  mainWindow.on("resize", () => {
    const [width, height] = mainWindow.getSize()
    state.windowWidth = width
    state.windowHeight = height
    rememberCurrentGeometry()
    scheduleGeometryPersistence()
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
  if (currentHudState === "expanded") return
  const bounds = mainWindow.getBounds()
  const workArea = screen.getDisplayMatching(bounds).workArea
  mainWindow.setBounds(
    clampWindowBounds(
      {
        ...bounds,
        width: Math.ceil(width),
        height: Math.min(
          Math.ceil(height),
          currentHudState === "compact-bar" ? 52 : workArea.height * 0.75
        )
      },
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
  repository: ActiveSessionRepository,
  profiles: ProfileRepository
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
    saveSyntheticStory: async (story) => {
      const bundle = await profiles.load()
      const syntheticStories = [
        ...(bundle.syntheticStories ?? []).filter(
          (candidate) => candidate.id !== story.id
        ),
        {
          ...story,
          status: "synthetic-draft" as const
        }
      ]
      await profiles.save({ ...bundle, syntheticStories })
    },
    onState: (session) => {
      state.mainWindow?.webContents.send(INTERVIEW_STATE_EVENT, session)
      state.mainWindow?.webContents.send(
        AUDIO_STATE_EVENT,
        session.lifecycle === "active"
          ? session.audio
          : createInitialAudioSessionState()
      )
    }
  })
}

async function initializeApplication(): Promise<void> {
  const userData = path.join(app.getPath("appData"), "InterviewCopilot")
  app.setPath("userData", userData)
  const executables = providerExecutables()
  const initialConfig = configHelper.loadConfig()
  geometryStore = new DisplayGeometryStore(
    initialConfig.shell?.geometry ?? {}
  )
  const storagePaths = new StoragePaths(path.join(userData, "encrypted"))
  const keyService = new InstallationKeyService(
    storagePaths,
    new ElectronSafeStorageKeyProtector(safeStorage)
  )
  const records = new EncryptedRecordRepository<
    M04ActiveSnapshot | ResetArchive
  >(storagePaths, keyService)
  const profiles = new ProfileRepository(
    new EncryptedRecordRepository<ProfileBundle>(
      storagePaths,
      keyService,
      undefined,
      "profiles"
    )
  )
  const audioPreferences = new AudioPreferencesRepository(
    new EncryptedRecordRepository<M07AudioPreferencesRecord>(
      storagePaths,
      keyService,
      undefined,
      "audio"
    )
  )
  const orchestrator = createOrchestrator(
    executables,
    new ActiveSessionRepository(
      records,
      () =>
        audioPreferences
          .load()
          .then((preferences) => preferences.transcriptRetention)
    ),
    profiles
  )
  const audioResourceRoot = app.isPackaged
    ? path.join(process.resourcesPath, "audio")
    : path.join(app.getAppPath(), "resources", "audio")
  const architecture = process.arch === "x64" ? "x64" : "arm64"
  const nativeHelperExecutable = app.isPackaged
    ? path.join(
        audioResourceRoot,
        "native",
        architecture,
        "interviewcopilot-audio-helper"
      )
    : path.join(
        app.getAppPath(),
        "native",
        "audio",
        ".build",
        `${architecture}-apple-macosx`,
        "release",
        "interviewcopilot-audio-helper"
      )
  const audioRuntime = new NativeAudioCaptureRuntime({
    helperExecutable: nativeHelperExecutable,
    temporaryRoot: path.join(userData, "audio-temporary"),
    localTranscriber: new LocalWhisperTranscriber({
      executable: path.join(
        audioResourceRoot,
        "whisper",
        architecture,
        "whisper-cli"
      ),
      model: path.join(audioResourceRoot, "models", "ggml-base.en.bin"),
      manifest: path.join(audioResourceRoot, "audio-artifacts-v1.json"),
      architecture
    })
  })
  const audio = new AudioSessionController(
    orchestrator,
    audioPreferences,
    audioRuntime
  )
  audioRuntime.setTranscriptSink((segment) => audio.ingestTranscript(segment))
  audioRuntime.setStatusSink((status) => audio.updateStatus(status))
  audioRuntime.setFailureSink((source, error) =>
    audio.handleRuntimeFailure(source, error)
  )
  audioRuntime.setElapsedSink((source, elapsedMs) =>
    audio.updateElapsed(source, elapsedMs)
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
  const invokeShellAction = (action: ShortcutAction): void => {
    switch (action) {
      case "visibility":
        toggleMainWindow()
        return
      case "screenshot":
        void capture.capture()
        return
      case "debug":
        void capture.debugCurrentCode()
        return
      case "submit":
        state.mainWindow?.webContents.send("shell:shortcut", action)
        return
      case "reset":
        void audio.reset(() => capture.reset())
        return
      case "record":
        void audio.command({ type: "master-toggle" })
        return
      case "move-left":
        moveWindowHorizontal(-state.step)
        return
      case "move-right":
        moveWindowHorizontal(state.step)
        return
      case "move-up":
        moveWindowVertical(-state.step)
        return
      case "move-down":
        moveWindowVertical(state.step)
        return
      default:
        if (action === "composer") {
          const transition = composerVisibility.open(state.visible)
          if (transition.reveal) showMainWindow()
        }
        state.mainWindow?.webContents.send("shell:shortcut", action)
    }
  }
  const configuredShortcuts =
    configHelper.loadConfig().shell?.shortcuts ?? DEFAULT_SHORTCUT_BINDINGS
  const shortcuts = new ShortcutsHelper({
    invoke: invokeShellAction
  }, configuredShortcuts)
  const initialShortcutRegistration = shortcuts.registerGlobalShortcuts()
  if (!initialShortcutRegistration.ok) {
    state.mainWindow?.once("ready-to-show", () => {
      showMainWindow()
      state.mainWindow?.webContents.send(
        "shell:startup-warning",
        `Global shortcut unavailable: ${initialShortcutRegistration.rejectedAccelerator ?? "unknown"}. Every action remains available in HotKeys.`
      )
    })
  }
  const applyShortcutBindings = (bindings: ShortcutBindings) => {
    const previous = shortcuts.currentBindings()
    const result = shortcuts.applyBindings(bindings)
    if (result.ok) {
      try {
        const config = configHelper.loadConfig()
        configHelper.updateConfig({
          shell: {
            ...(config.shell ?? DEFAULT_LIVE_SHELL_PREFERENCES),
            shortcuts: result.bindings
          }
        })
      } catch (error) {
        const rollback = shortcuts.applyBindings(previous)
        if (!rollback.ok) {
          throw new Error("Shortcut persistence failed and rollback was unavailable")
        }
        throw error
      }
    }
    return result
  }
  initializeIpcHandlers({
    orchestrator,
    setWindowDimensions,
    toggleMainWindow,
    captureScreenshot: () => capture.capture(),
    debugCurrentCode: () => capture.debugCurrentCode(),
    getProfileContext: async () => {
      const bundle = await profiles.load()
      const context = []
      if (bundle.dossier?.status === "reviewed") {
        context.push({
          id: `candidate-dossier:${bundle.dossier.revision}`,
          category: "profile" as const,
          revision: bundle.dossier.revision,
          content: JSON.stringify({
            markdown: bundle.dossier.markdown,
            claims: bundle.dossier.claims
          })
        })
      }
      const opportunity = bundle.opportunities.find(
        (candidate) => candidate.id === bundle.activeOpportunityId
      )
      if (opportunity) {
        context.push({
          id: `opportunity:${opportunity.id}`,
          category: "opportunity" as const,
          revision: opportunity.revision,
          content: opportunity.markdown
        })
      }
      if (bundle.syntheticEnabled) {
        context.push({
          id: "synthetic-story-policy",
          category: "instructions" as const,
          revision: 1,
          content: "Synthetic Behavioral drafts are enabled and must be labeled synthetic-draft."
        })
      }
      return context
    },
    getProfileBundle: () => profiles.load(),
    saveProfileBundle: (bundle) => profiles.save(bundle),
    importProfileMarkdown: (source) => profiles.importMarkdown(source),
    exportDossier: (destination) => profiles.exportDossier(destination),
    getAudioSessionState: () => audio.current(),
    dispatchAudioCommand: (command) => audio.command(command),
    getAudioPreferences: () => audioPreferences.load(),
    updateAudioPreferences: (preferences) =>
      audioPreferences.save(preferences),
    openAudioSystemSettings: (source) =>
      shell.openExternal(
        source === "microphone"
          ? "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone"
          : "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture"
      ),
    setWindowPointerEvents: (ignore, forward) => {
      if (state.mainWindow) {
        applyPointerRouting(state.mainWindow, ignore, forward)
      }
    },
    setHudState,
    closeComposer: () => {
      if (composerVisibility.close().hide) hideMainWindow()
    },
    getShortcutBindings: () => shortcuts.currentBindings(),
    updateShortcutBindings: applyShortcutBindings,
    resetShortcutBindings: () =>
      applyShortcutBindings(DEFAULT_SHORTCUT_BINDINGS),
    invokeShellAction,
    diagnoseProviders: () => providerDiagnostics(executables),
    resetInterview: () => audio.reset(() => capture.reset()),
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
  await audio.cleanupStartup()
  await orchestrator.inspectRecovery()
  screen.on("display-removed", () => setHudState(currentHudState))
  screen.on("display-metrics-changed", () => setHudState(currentHudState))
  let shutdownStarted = false
  let shutdownComplete = false
  app.on("before-quit", (event) => {
    persistGeometry()
    if (shutdownComplete) return
    event.preventDefault()
    if (shutdownStarted) return
    shutdownStarted = true
    void audio.shutdown().finally(() => {
      shutdownComplete = true
      app.quit()
    })
  })
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
