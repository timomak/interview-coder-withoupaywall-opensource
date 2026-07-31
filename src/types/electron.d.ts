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
  dispatchInterviewCommand: (
    command: InterviewCommand
  ) => Promise<CommandResult>
  onInterviewState: (
    callback: (state: InterviewSession) => void
  ) => () => void
  openSettings: () => Promise<{ success: boolean }>
  onShowSettings: (callback: () => void) => () => void
  updateContentDimensions: (dimensions: {
    width: number
    height: number
  }) => Promise<void>
  setWindowPointerEvents: (
    ignore: boolean,
    forward: boolean
  ) => Promise<{ success: boolean }>
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
