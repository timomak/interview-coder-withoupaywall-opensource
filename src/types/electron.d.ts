export interface ScreenshotPreview {
  path: string
  preview: string
}

export type ScreenshotCollection = ScreenshotPreview[] & {
  previews?: ScreenshotPreview[]
}

export interface ProblemInfo {
  problem_statement?: string
  constraints?: string
  example_input?: string
  example_output?: string
  [key: string]: unknown
}

export interface SolutionResult {
  code: string
  thoughts: string[]
  time_complexity: string
  space_complexity: string
  debug_analysis?: string
}

export interface UpdateInfo {
  version?: string
  releaseName?: string
  releaseNotes?: string
  [key: string]: unknown
}

export interface AppConfig {
  apiKey: string
  apiProvider?: "openai" | "gemini" | "anthropic"
  extractionModel?: string
  solutionModel?: string
  debuggingModel?: string
  model?: string
  language: string
  opacity?: number
}

export interface ElectronAPI {
  openSubscriptionPortal: (authData: {
    id: string
    email: string
  }) => Promise<{ success: boolean; error?: string }>
  openSettingsPortal: () => Promise<void>
  updateContentDimensions: (dimensions: {
    width: number
    height: number
  }) => Promise<void>
  clearStore: () => Promise<{ success: boolean; error?: string }>
  getScreenshots: () => Promise<ScreenshotCollection>
  deleteScreenshot: (
    path: string
  ) => Promise<{ success: boolean; error?: string }>
  onScreenshotTaken: (
    callback: (data: ScreenshotPreview) => void
  ) => () => void
  onResetView: (callback: () => void) => () => void
  onSolutionStart: (callback: () => void) => () => void
  onDebugStart: (callback: () => void) => () => void
  onDebugSuccess: (callback: (data: SolutionResult) => void) => () => void
  onSolutionError: (callback: (error: string) => void) => () => void
  onProcessingNoScreenshots: (callback: () => void) => () => void
  onProblemExtracted: (callback: (data: ProblemInfo) => void) => () => void
  onSolutionSuccess: (callback: (data: SolutionResult) => void) => () => void
  onUnauthorized: (callback: () => void) => () => void
  onDebugError: (callback: (error: string) => void) => () => void
  onOutOfCredits: (callback: () => void) => () => void
  onSubscriptionUpdated: (callback: () => void) => () => void
  onSubscriptionPortalClosed: (callback: () => void) => () => void
  onReset: (callback: () => void) => () => void
  openExternal: (url: string) => Promise<void>
  openLink: (url: string) => Promise<void>
  toggleMainWindow: () => Promise<{ success: boolean; error?: string }>
  triggerScreenshot: () => Promise<{ success: boolean; error?: string }>
  triggerProcessScreenshots: () => Promise<{
    success: boolean
    error?: string
  }>
  triggerReset: () => Promise<{ success: boolean; error?: string }>
  triggerMoveLeft: () => Promise<{ success: boolean; error?: string }>
  triggerMoveRight: () => Promise<{ success: boolean; error?: string }>
  triggerMoveUp: () => Promise<{ success: boolean; error?: string }>
  triggerMoveDown: () => Promise<{ success: boolean; error?: string }>
  startUpdate: () => Promise<{ success: boolean; error?: string }>
  installUpdate: () => Promise<void>
  onUpdateAvailable: (callback: (info: UpdateInfo) => void) => () => void
  onUpdateDownloaded: (callback: (info: UpdateInfo) => void) => () => void
  decrementCredits: () => Promise<void>
  onCreditsUpdated: (callback: (credits: number) => void) => () => void
  getPlatform: () => NodeJS.Platform
  getConfig: () => Promise<AppConfig>
  updateConfig: (config: Partial<AppConfig>) => Promise<AppConfig>
  checkApiKey: () => Promise<boolean>
  validateApiKey: (
    apiKey: string
  ) => Promise<{ valid: boolean; error?: string }>
  onShowSettings: (callback: () => void) => () => void
  onApiKeyInvalid: (callback: () => void) => () => void
  removeListener: (
    eventName: string,
    callback: (...args: unknown[]) => void
  ) => void
  onDeleteLastScreenshot: (callback: () => void) => () => void
  deleteLastScreenshot: () => Promise<{ success: boolean; error?: string }>
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
    __CREDITS__: number
    __LANGUAGE__: string
    __IS_INITIALIZED__: boolean
    __AUTH_TOKEN__: string | null
  }
}
