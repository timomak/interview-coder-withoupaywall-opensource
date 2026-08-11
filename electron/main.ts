import {
  app,
  BrowserWindow,
  dialog,
  safeStorage,
  screen,
  shell,
  type BrowserWindowConstructorOptions
} from "electron"
import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import { execFileSync } from "node:child_process"
import { initAutoUpdater } from "./autoUpdater"
import {
  applyCaptureProtection,
  applyPointerRouting,
  createCaptureProtectedWindow,
  revealCaptureProtectedWindow,
  setCaptureProtectedBounds
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
import { PromptTemplateRepository } from "./prompts"
import type { PromptStoredRecord } from "../src/features/prompts/types"
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
  deriveStartupHudState,
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
import { AppleSpeechTranscriber } from "./audio/transcription/AppleSpeechTranscriber"
import { LocalWhisperTranscriber } from "./audio/transcription/LocalWhisperTranscriber"
import { loadAudioArtifactManifest } from "./audio/transcription/artifactManifest"
import {
  HistoryDeletionJournal,
  HistoryExportService,
  HistoryRepository,
  HistoryService,
  type HistoryExportJournalV1
} from "./history"
import type { HistoryArchiveV1 } from "../src/features/history/types"
import type { RecordRepository } from "./storage"
import { DiagnosticService } from "./diagnostics/DiagnosticService"
import {
  CaptureVerificationRepository,
  captureVerificationState,
  validateCaptureVerificationRecord,
  type CaptureTupleV1,
  type CaptureVerificationRecordV1
} from "./privacy/verificationRecord"
import { LiveQualificationProcedure } from "./qualification/liveProcedure"
import { parseCanonicalJson, validateMatrix } from "./qualification/protocol"

const isDevelopment = process.env.NODE_ENV === "development"
let observedMeetBuildId: string | undefined

function sha256File(file: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex")
}

function releaseCommitSha(): string | undefined {
  try {
    const metadata = JSON.parse(fs.readFileSync(path.join(app.getAppPath(), "package.json"), "utf8"))
    return /^[0-9a-f]{40}$/.test(metadata.releaseCommitSha) ? metadata.releaseCommitSha : undefined
  } catch { return undefined }
}

function observedCaptureTuple(): CaptureTupleV1 | undefined {
  try {
    const commit = releaseCommitSha()
    const asar = path.join(process.resourcesPath, "app.asar")
    const primary = screen.getPrimaryDisplay()
    const product = execFileSync("/usr/bin/sw_vers", ["-productVersion"], { encoding: "utf8" }).trim()
    const build = execFileSync("/usr/bin/sw_vers", ["-buildVersion"], { encoding: "utf8" }).trim()
    const chrome = execFileSync(
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      ["--version"],
      { encoding: "utf8" }
    ).match(/([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)/)?.[1]
    if (!commit || !fs.existsSync(asar) || !chrome) return undefined
    return {
      appSemver: app.getVersion(),
      appCommitSha: commit,
      appBundleSha256: sha256File(asar),
      macOSProductVersion: product,
      macOSBuildVersion: build,
      architecture: process.arch === "arm64" ? "arm64" : "x64",
      chromeVersion: chrome,
      // A historical receipt cannot establish the currently served Meet web
      // build. Outside an active signed observer session this remains unknown,
      // which deliberately forces Retest required instead of copying history.
      meetBuildId: observedMeetBuildId ?? "unobserved-current-meet-build",
      display: {
        displayId: String(primary.id),
        type: primary.internal ? "internal" : "external",
        pixelWidth: Math.round(primary.size.width * primary.scaleFactor),
        pixelHeight: Math.round(primary.size.height * primary.scaleFactor),
        scaleFactor: String(primary.scaleFactor)
      }
    }
  } catch { return undefined }
}

async function importRootQualificationReceipt(
  repository: CaptureVerificationRepository
): Promise<void> {
  const commit = releaseCommitSha()
  if (!commit) return
  const receipt = path.join(
    "/Users/Shared/InterviewCopilot/qualification-receipts",
    commit
  )
  if (!fs.existsSync(receipt)) return
  for (const entry of fs.readdirSync(receipt).filter((name) => /^capture-verification-[A-Za-z0-9._-]+\.json$/.test(name))) {
    const candidate = path.join(receipt, entry)
    const stat = fs.lstatSync(candidate)
    if (!stat.isFile() || stat.isSymbolicLink() || stat.uid !== 0 || (stat.mode & 0o022) !== 0) {
      throw new Error("Capture verification receipt ownership is invalid")
    }
    const record = JSON.parse(fs.readFileSync(candidate, "utf8")) as CaptureVerificationRecordV1
    validateCaptureVerificationRecord(record)
    if (record.tuple.appCommitSha !== commit) throw new Error("Capture receipt commit does not match packaged app")
    const current = observedCaptureTuple()
    if (current && captureVerificationState(record, current) === "Verified") {
      await repository.save(record)
      return
    }
  }
}

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
  setCaptureProtectedBounds(mainWindow, restored)
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
  const startupHudState = deriveStartupHudState(configHelper.loadConfig())
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
    if (startupHudState === "expanded") {
      setHudState(startupHudState)
      showMainWindow()
    }
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
  setCaptureProtectedBounds(mainWindow, next)
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
  setCaptureProtectedBounds(mainWindow, next)
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
  setCaptureProtectedBounds(
    mainWindow,
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
  profiles: ProfileRepository,
  prompts: PromptTemplateRepository
): InterviewOrchestrator {
  const providerRuntime = new ProviderRuntime({
    executables
  })
  return new InterviewOrchestrator({
    repository,
    snapshotTemplate: (mode) => prompts.snapshot(mode),
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
  if (process.platform === "darwin") {
    app.setActivationPolicy("accessory")
    app.dock.hide()
  }
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
  const prompts = new PromptTemplateRepository(
    new EncryptedRecordRepository<PromptStoredRecord | object>(
      storagePaths,
      keyService,
      undefined,
      "templates"
    )
  )
  const captureVerification = new CaptureVerificationRepository(
    new EncryptedRecordRepository<CaptureVerificationRecordV1>(
      storagePaths,
      keyService,
      undefined,
      "capture-verification"
    )
  )
  const diagnosticService = new DiagnosticService()
  let liveQualification: LiveQualificationProcedure | undefined
  const historyRepository = new HistoryRepository(
    records as unknown as RecordRepository<object>,
    new EncryptedRecordRepository<HistoryArchiveV1 | object>(
      storagePaths,
      keyService,
      undefined,
      "history"
    )
  )
  const history = new HistoryService(
    historyRepository,
    new HistoryDeletionJournal(
      new EncryptedRecordRepository(
        storagePaths,
        keyService,
        undefined,
        "history-journals"
      ),
      historyRepository
    ),
    new HistoryExportService(
      new EncryptedRecordRepository<HistoryExportJournalV1>(
        storagePaths,
        keyService,
        undefined,
        "history-journals"
      )
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
    profiles,
    prompts
  )
  const audioResourceRoot = app.isPackaged
    ? path.join(process.resourcesPath, "audio")
    : path.join(app.getAppPath(), "resources", "audio")
  const architecture =
    process.arch === "x64"
      ? "x64"
      : process.arch === "arm64"
        ? "arm64"
        : undefined
  if (!architecture) {
    throw new Error("Native audio is unsupported on this macOS architecture")
  }
  const audioManifestPath = path.join(
    audioResourceRoot,
    "audio-artifacts-v1.json"
  )
  const audioManifest = await loadAudioArtifactManifest(audioManifestPath)
  const nativeArtifacts = audioManifest.binaries[architecture]
  const nativeHelperExecutable = path.join(
    audioResourceRoot,
    "native",
    architecture,
    "interviewcopilot-audio-helper"
  )
  const audioRuntime = new NativeAudioCaptureRuntime({
    helperExecutable: nativeHelperExecutable,
    helperExpectedSha256: nativeArtifacts.nativeHelperSha256,
    temporaryRoot: path.join(userData, "audio-temporary"),
    localTranscriber: new LocalWhisperTranscriber({
      executable: path.join(
        audioResourceRoot,
        "whisper",
        architecture,
        "whisper-cli"
      ),
      model: path.join(audioResourceRoot, "models", "ggml-base.en.bin"),
      manifest: audioManifestPath,
      architecture
    }),
    remoteTranscriber: new AppleSpeechTranscriber({
      executable: path.join(
        audioResourceRoot,
        "speech",
        architecture,
        "interviewcopilot-apple-speech"
      ),
      expectedSha256: nativeArtifacts.appleSpeechAdapterSha256
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
  if (process.argv.includes("--qualification-collect") && state.mainWindow) {
    state.mainWindow.webContents.once("did-finish-load", () => {
      showMainWindow()
      state.mainWindow?.webContents.send("settings:show")
    })
  }
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
    getPromptCatalog: () => prompts.catalog(),
    reviewPromptChange: (draft) => prompts.review(draft),
    savePromptChange: (reviewed) => prompts.apply(reviewed),
    deletePromptTemplate: (id, confirmedName) =>
      prompts.delete(id, confirmedName),
    selectPromptTemplate: (mode, id) => prompts.select(mode, id),
    restoreBuiltInPrompt: (mode) => prompts.restoreBuiltIn(mode),
    listHistory: () => history.list(),
    searchHistory: (query) => history.search(query),
    openHistory: (sessionId) => history.open(sessionId),
    deleteHistory: (request) => history.delete(request),
    exportHistory: (request) => history.export(request),
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
    getCaptureVerificationState: async () => {
      await importRootQualificationReceipt(captureVerification)
      const record = await captureVerification.load()
      if (!record) return "Not verified"
      const current = observedCaptureTuple()
      return current ? captureVerificationState(record, current) : "Retest required"
    },
    beginMeetQualification: (scope) => {
      if (!process.argv.includes("--qualification-collect")) {
        throw new Error("Meet qualification must be launched by the pinned release command")
      }
      const root = process.env.INTERVIEWCOPILOT_QUALIFICATION_ROOT
      const matrixRevision = process.env.INTERVIEWCOPILOT_QUALIFICATION_MATRIX
      const tupleId = process.env.INTERVIEWCOPILOT_QUALIFICATION_TUPLE
      const expectedScope = process.env.INTERVIEWCOPILOT_QUALIFICATION_SCOPE
      const matrixJson = process.env.INTERVIEWCOPILOT_QUALIFICATION_MATRIX_JSON
      if (!root || !matrixRevision || !tupleId || !matrixJson || expectedScope !== scope) {
        throw new Error("Pinned qualification identity is missing or disagrees")
      }
      const procedure = scope === "entire-display" ? "M01" : "M02"
      liveQualification = new LiveQualificationProcedure(
        path.join(root, matrixRevision, tupleId, procedure),
        validateMatrix(parseCanonicalJson(matrixJson))
      )
      return liveQualification.begin(scope, matrixRevision, tupleId)
    },
    sampleMeetQualification: (markerFrame, controlFrame) => {
      if (!liveQualification) throw new Error("Meet qualification is not active")
      liveQualification.sample(markerFrame, controlFrame)
    },
    acknowledgeMeetObserver: (value) => {
      if (!liveQualification || !value || typeof value !== "object") {
        throw new Error("Meet qualification is not active")
      }
      const observed = liveQualification.acknowledgeObserver(value as { payload: unknown; signature: unknown })
      observedMeetBuildId = observed.meetBuildId
    },
    completeMeetQualification: (value) => {
      if (!liveQualification) throw new Error("Meet qualification is not active")
      if (!value || typeof value !== "object") throw new Error("Remote stop receipt is malformed")
      const input = value as Record<string, unknown>
      const recordingPath = path.resolve(String(input.recordingPath ?? ""))
      const root = path.resolve(String(process.env.INTERVIEWCOPILOT_QUALIFICATION_ROOT ?? ""))
      const inbox = path.join(root, "remote-inbox")
      if (!recordingPath.startsWith(`${inbox}${path.sep}`)) throw new Error("Remote recording must come from the fixed inbox")
      const stat = fs.lstatSync(recordingPath)
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw new Error("Remote recording input is unsafe")
      const result = liveQualification.finishRaw(
        input.stopReceipt as { payload: unknown; signature: unknown },
        fs.readFileSync(recordingPath)
      )
      liveQualification = undefined
      return result
    },
    previewDiagnostics: async () =>
      diagnosticService.preview({
        appVersion: app.getVersion(),
        packaged: app.isPackaged,
        platform: process.platform,
        architecture,
        providerConfigured: Boolean(configHelper.loadConfig().provider),
        captureVerification: await captureVerification.load()
          .then((record) => record ? "record-present" : "record-absent")
      }),
    exportDiagnostics: async (preview) => {
      const selection = await dialog.showSaveDialog({
        title: "Export redacted diagnostics",
        defaultPath: "InterviewCopilot-diagnostics.json",
        filters: [{ name: "JSON", extensions: ["json"] }]
      })
      if (selection.canceled || !selection.filePath) return false
      await diagnosticService.export(selection.filePath, preview)
      return true
    },
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
  await history.recover()
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
