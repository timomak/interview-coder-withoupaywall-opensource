import type { SubscriptionConfig } from "../../electron/config"
import type {
  CommandResult,
  InterviewCommand,
  InterviewSession,
  RecoveryChoice
} from "../shared/interview"

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
