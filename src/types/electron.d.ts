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
  captureScreenshot: () => Promise<{ success: boolean }>
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
