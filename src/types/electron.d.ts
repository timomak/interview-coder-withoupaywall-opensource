import type { SubscriptionConfig } from "../../electron/config"
import type {
  CommandResult,
  InterviewCommand,
  InterviewSession,
  RecoveryChoice
} from "../shared/interview"
import type {
  ProviderDiagnostics,
  ProviderId,
  ResponseMode
} from "../shared/provider"
import type {
  ShortcutAction,
  ShortcutBindings,
  HudState
} from "../shared/shell"
import type { ShortcutRegistrationResult } from "../../electron/shortcuts"
import type {
  AudioCommand,
  AudioCommandResult,
  AudioPreferences,
  AudioSessionState,
  AudioSource
} from "../features/audio/contracts"

export interface UpdateInfo {
  version?: string
  releaseName?: string
  releaseNotes?: string
  [key: string]: unknown
}

export interface ElectronAPI {
  getConfig: () => Promise<SubscriptionConfig>
  updateConfig: (
    updates: Partial<SubscriptionConfig>
  ) => Promise<SubscriptionConfig>
  getProviderDiagnostics: () => Promise<readonly ProviderDiagnostics[]>
  configureProvider: (selection: {
    provider: ProviderId
    model: string
    responseMode: ResponseMode
  }) => Promise<SubscriptionConfig>
  getInterviewState: () => Promise<InterviewSession>
  getInterviewRecovery: () => Promise<RecoveryChoice>
  getProfileContext: () => Promise<
    readonly import("../shared/interview").ContextItem[]
  >
  getProfileBundle: () => Promise<
    import("../features/profile/types").ProfileBundle
  >
  saveProfileBundle: (
    bundle: import("../features/profile/types").ProfileBundle
  ) => Promise<{ success: boolean }>
  importProfileMarkdown: (source: string) => Promise<string>
  exportDossier: (destination: string) => Promise<{ success: boolean }>
  getPromptCatalog: () => Promise<
    import("../features/prompts/types").PromptCatalog
  >
  reviewPromptChange: (
    draft: import("../features/prompts/types").PromptTemplateDraft
  ) => Promise<import("../features/prompts/types").ReviewedPromptChange>
  savePromptChange: (
    reviewed: import("../features/prompts/types").ReviewedPromptChange
  ) => Promise<import("../features/prompts/types").PromptCatalog>
  deletePromptTemplate: (
    id: string,
    confirmedName: string
  ) => Promise<import("../features/prompts/types").PromptCatalog>
  selectPromptTemplate: (
    mode: import("../shared/interview").InterviewMode,
    id: string
  ) => Promise<import("../features/prompts/types").PromptCatalog>
  restoreBuiltInPrompt: (
    mode: import("../shared/interview").InterviewMode
  ) => Promise<import("../features/prompts/types").PromptCatalog>
  listHistory: () => Promise<import("../features/history/types").HistoryCatalog>
  searchHistory: (
    query: string
  ) => Promise<import("../features/history/types").HistoryCatalog>
  openHistory: (
    sessionId: string
  ) => Promise<import("../features/history/types").HistoryArchiveV1>
  continueHistory: (sessionId: string) => Promise<CommandResult>
  deleteHistory: (
    request: import("../features/history/types").HistoryDeleteRequest
  ) => Promise<import("../features/history/types").HistoryCatalog>
  exportHistory: (
    request: import("../features/history/types").HistoryExportRequest
  ) => Promise<import("../features/history/types").HistoryExportReceipt>
  dispatchInterviewCommand: (
    command: InterviewCommand
  ) => Promise<CommandResult>
  onInterviewState: (
    callback: (state: InterviewSession) => void
  ) => () => void
  openSettings: () => Promise<{ success: boolean }>
  quitApplication: () => Promise<{ success: boolean }>
  onShowSettings: (callback: () => void) => () => void
  updateContentDimensions: (dimensions: {
    width: number
    height: number
  }) => Promise<void>
  setWindowPointerEvents: (
    ignore: boolean,
    forward: boolean
  ) => Promise<{ success: boolean }>
  setWindowOpacity: (opacity: number) => Promise<{ success: boolean }>
  setHudState: (state: HudState) => Promise<{ success: boolean }>
  captureScreenshot: () => Promise<{ success: boolean }>
  debugCurrentCode: () => Promise<{ success: boolean }>
  getShortcutBindings: () => Promise<ShortcutBindings>
  updateShortcutBindings: (
    bindings: ShortcutBindings
  ) => Promise<ShortcutRegistrationResult>
  resetShortcutBindings: () => Promise<ShortcutRegistrationResult>
  invokeShellAction: (
    action: ShortcutAction
  ) => Promise<{ success: boolean }>
  closeComposer: () => Promise<{ success: boolean }>
  onShellShortcut: (
    callback: (action: ShortcutAction) => void
  ) => () => void
  onShellStartupWarning: (
    callback: (message: string) => void
  ) => () => void
  getAudioSessionState: () => Promise<AudioSessionState>
  dispatchAudioCommand: (
    command: AudioCommand
  ) => Promise<AudioCommandResult>
  onAudioSessionState: (
    callback: (state: AudioSessionState) => void
  ) => () => void
  getAudioPreferences: () => Promise<AudioPreferences>
  updateAudioPreferences: (
    preferences: AudioPreferences
  ) => Promise<AudioPreferences>
  openAudioSystemSettings?: (
    source: AudioSource
  ) => Promise<{ success: boolean }>
  getCaptureVerificationState: () => Promise<
    import("../../electron/privacy/verificationRecord").CaptureVerificationState
  >
  beginMeetQualification: (
    scope: import("../../electron/privacy/verificationRecord").CaptureScope
  ) => Promise<import("../../electron/qualification/liveProcedure").LiveProcedureSession>
  sampleMeetQualification: (markerFrame: number, controlFrame: number) => Promise<void>
  acknowledgeMeetObserver: (receipt: import("../../electron/qualification/liveProcedure").RemoteObserverReceipt) => Promise<void>
  completeMeetQualification: (value: {
    stopReceipt: import("../../electron/qualification/liveProcedure").RemoteObserverReceipt
    recordingPath: string
  }) => Promise<{ runId: string; rawRoot: string; state: "awaiting-analysis-and-attestations" }>
  previewDiagnostics: () => Promise<
    import("../../electron/diagnostics/DiagnosticService").DiagnosticPreview
  >
  exportDiagnostics: (
    preview: import("../../electron/diagnostics/DiagnosticService").DiagnosticPreview
  ) => Promise<boolean>
  toggleMainWindow: () => Promise<{ success: boolean }>
  getPlatform: () => NodeJS.Platform
  startUpdate: () => Promise<{ success: boolean; error?: string }>
  installUpdate: () => Promise<void>
  onUpdateAvailable: (callback: (info: UpdateInfo) => void) => () => void
  onUpdateDownloaded: (callback: (info: UpdateInfo) => void) => () => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
