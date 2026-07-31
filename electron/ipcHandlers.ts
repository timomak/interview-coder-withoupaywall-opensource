import { ipcMain } from "electron"
import { configHelper } from "./ConfigHelper"
import {
  INTERVIEW_COMMAND_CHANNEL,
  INTERVIEW_RECOVERY_CHANNEL,
  INTERVIEW_STATE_CHANNEL,
  parseInterviewCommand,
  type CommandResult
} from "../src/shared/interview"
import type { InterviewOrchestrator } from "./orchestrator"
import {
  PROVIDER_CONFIGURE_CHANNEL,
  PROVIDER_DIAGNOSTICS_CHANNEL,
  createSelection,
  isProviderId,
  type ProviderDiagnostics,
  type ProviderId,
  type ResponseMode
} from "../src/shared/provider"
import type { SubscriptionConfig } from "./config"
import {
  isShortcutAction,
  isShortcutBindings,
  type ShortcutAction,
  type ShortcutBindings
} from "../src/shared/shell"
import type { ShortcutRegistrationResult } from "./shortcuts"
import type { HudState } from "../src/shared/shell"
import type { ContextItem } from "../src/shared/interview"
import {
  isProfileBundle,
  type ProfileBundle
} from "../src/features/profile/types"
import {
  AUDIO_COMMAND_CHANNEL,
  AUDIO_OPEN_SYSTEM_SETTINGS_CHANNEL,
  AUDIO_PREFERENCES_CHANNEL,
  AUDIO_PREFERENCES_UPDATE_CHANNEL,
  AUDIO_STATE_CHANNEL,
  parseAudioCommand,
  validateAudioPreferences,
  type AudioCommandResult,
  type AudioPreferencesV1,
  type AudioSessionState,
  AUDIO_SOURCES,
  type AudioSource
} from "../src/shared/audio"
import type {
  PromptCatalog,
  PromptTemplateDraft,
  ReviewedPromptChange
} from "../src/features/prompts/types"
import { INTERVIEW_MODES, type InterviewMode } from "../src/shared/interview"
import type {
  HistoryArchiveV1,
  HistoryCatalog,
  HistoryDeleteRequest,
  HistoryExportReceipt,
  HistoryExportRequest
} from "../src/features/history/types"
import type { DiagnosticPreview } from "./diagnostics/DiagnosticService"
import type { CaptureVerificationState } from "./privacy/verificationRecord"
import type { LiveProcedureSession } from "./qualification/liveProcedure"

export interface IpcHandlerDependencies {
  readonly orchestrator: InterviewOrchestrator
  readonly setWindowDimensions: (width: number, height: number) => void
  readonly toggleMainWindow: () => void
  readonly showSettings: () => void
  readonly diagnoseProviders: () => Promise<readonly ProviderDiagnostics[]>
  readonly configureProvider: (
    provider: ProviderId,
    model: string,
    responseMode: ResponseMode
  ) => Promise<SubscriptionConfig>
  readonly resetInterview: () => Promise<CommandResult>
  readonly captureScreenshot: () => Promise<void>
  readonly debugCurrentCode: () => Promise<void>
  readonly setWindowPointerEvents: (
    ignore: boolean,
    forward: boolean
  ) => void
  readonly getShortcutBindings: () => ShortcutBindings
  readonly updateShortcutBindings: (
    bindings: ShortcutBindings
  ) => ShortcutRegistrationResult
  readonly resetShortcutBindings: () => ShortcutRegistrationResult
  readonly invokeShellAction: (action: ShortcutAction) => void
  readonly setHudState: (state: HudState) => void
  readonly closeComposer: () => void
  readonly getProfileContext: () => Promise<readonly ContextItem[]>
  readonly getProfileBundle: () => Promise<ProfileBundle>
  readonly saveProfileBundle: (bundle: ProfileBundle) => Promise<void>
  readonly importProfileMarkdown: (source: string) => Promise<string>
  readonly exportDossier: (destination: string) => Promise<void>
  readonly getPromptCatalog: () => Promise<PromptCatalog>
  readonly reviewPromptChange: (
    draft: PromptTemplateDraft
  ) => Promise<ReviewedPromptChange>
  readonly savePromptChange: (
    reviewed: ReviewedPromptChange
  ) => Promise<PromptCatalog>
  readonly deletePromptTemplate: (
    id: string,
    confirmedName: string
  ) => Promise<PromptCatalog>
  readonly selectPromptTemplate: (
    mode: InterviewMode,
    id: string
  ) => Promise<PromptCatalog>
  readonly restoreBuiltInPrompt: (
    mode: InterviewMode
  ) => Promise<PromptCatalog>
  readonly listHistory: () => Promise<HistoryCatalog>
  readonly searchHistory: (query: string) => Promise<HistoryCatalog>
  readonly openHistory: (sessionId: string) => Promise<HistoryArchiveV1>
  readonly deleteHistory: (request: HistoryDeleteRequest) => Promise<HistoryCatalog>
  readonly exportHistory: (
    request: HistoryExportRequest
  ) => Promise<HistoryExportReceipt>
  readonly getAudioSessionState: () => AudioSessionState
  readonly dispatchAudioCommand: (
    command: unknown
  ) => Promise<AudioCommandResult>
  readonly getAudioPreferences: () => Promise<AudioPreferencesV1>
  readonly updateAudioPreferences: (
    preferences: AudioPreferencesV1
  ) => Promise<AudioPreferencesV1>
  readonly openAudioSystemSettings: (source: AudioSource) => Promise<void>
  readonly previewDiagnostics: () => Promise<DiagnosticPreview>
  readonly exportDiagnostics: (preview: DiagnosticPreview) => Promise<boolean>
  readonly getCaptureVerificationState: () => Promise<CaptureVerificationState>
  readonly beginMeetQualification: (scope: "entire-display" | "specific-window") => LiveProcedureSession
  readonly sampleMeetQualification: (markerFrame: number, controlFrame: number) => void
  readonly acknowledgeMeetObserver: (receipt: unknown) => void
  readonly completeMeetQualification: () => { readonly runId: string; readonly rawRoot: string }
}

export function initializeIpcHandlers(
  dependencies: IpcHandlerDependencies
): void {
  ipcMain.handle("config:get", () => configHelper.loadConfig())
  ipcMain.handle("config:update", (_event, updates: unknown) => {
    if (typeof updates !== "object" || updates === null) {
      throw new Error("Configuration update is malformed")
    }
    if ("provider" in updates || "model" in updates) {
      throw new Error("Provider configuration requires verified diagnostics")
    }
    return configHelper.updateConfig(updates)
  })
  ipcMain.handle(PROVIDER_DIAGNOSTICS_CHANNEL, () =>
    dependencies.diagnoseProviders()
  )
  ipcMain.handle("privacy:verification-state", () =>
    dependencies.getCaptureVerificationState()
  )
  ipcMain.handle("privacy:qualification-begin", (_event, scope: unknown) => {
    if (scope !== "entire-display" && scope !== "specific-window") throw new Error("Qualification scope is invalid")
    return dependencies.beginMeetQualification(scope)
  })
  ipcMain.handle("privacy:qualification-sample", (_event, value: unknown) => {
    if (!value || typeof value !== "object") throw new Error("Qualification sample is invalid")
    const sample = value as { markerFrame?: unknown; controlFrame?: unknown }
    if (!Number.isSafeInteger(sample.markerFrame) || !Number.isSafeInteger(sample.controlFrame)) throw new Error("Qualification sample is invalid")
    dependencies.sampleMeetQualification(sample.markerFrame as number, sample.controlFrame as number)
  })
  ipcMain.handle("privacy:qualification-observer", (_event, value: unknown) =>
    dependencies.acknowledgeMeetObserver(value)
  )
  ipcMain.handle("privacy:qualification-complete", () =>
    dependencies.completeMeetQualification()
  )
  ipcMain.handle("privacy:diagnostics-preview", () =>
    dependencies.previewDiagnostics()
  )
  ipcMain.handle("privacy:diagnostics-export", (_event, value: unknown) => {
    if (!value || typeof value !== "object") {
      throw new Error("Diagnostic preview is malformed")
    }
    return dependencies.exportDiagnostics(value as DiagnosticPreview)
  })
  ipcMain.handle(PROVIDER_CONFIGURE_CHANNEL, (_event, value: unknown) => {
    if (
      typeof value !== "object" ||
      value === null ||
      Object.keys(value).some(
        (key) => !["provider", "model", "responseMode"].includes(key)
      )
    ) {
      throw new Error("Provider configuration is malformed")
    }
    const candidate = value as Record<string, unknown>
    if (
      !isProviderId(candidate.provider) ||
      typeof candidate.model !== "string" ||
      (candidate.responseMode !== "fast" &&
        candidate.responseMode !== "reasoning")
    ) {
      throw new Error("Provider configuration is malformed")
    }
    createSelection(
      candidate.provider,
      candidate.model,
      candidate.responseMode
    )
    return dependencies.configureProvider(
      candidate.provider,
      candidate.model,
      candidate.responseMode
    )
  })

  ipcMain.handle(INTERVIEW_STATE_CHANNEL, () =>
    dependencies.orchestrator.current()
  )
  ipcMain.handle(INTERVIEW_RECOVERY_CHANNEL, () =>
    dependencies.orchestrator.inspectRecovery()
  )
  ipcMain.handle(AUDIO_STATE_CHANNEL, () =>
    dependencies.getAudioSessionState()
  )
  ipcMain.handle(AUDIO_COMMAND_CHANNEL, (_event, value: unknown) =>
    dependencies.dispatchAudioCommand(parseAudioCommand(value))
  )
  ipcMain.handle(AUDIO_PREFERENCES_CHANNEL, () =>
    dependencies.getAudioPreferences()
  )
  ipcMain.handle(
    AUDIO_PREFERENCES_UPDATE_CHANNEL,
    (_event, value: unknown) =>
      dependencies.updateAudioPreferences(validateAudioPreferences(value))
  )
  ipcMain.handle(
    AUDIO_OPEN_SYSTEM_SETTINGS_CHANNEL,
    async (_event, value: unknown) => {
      if (!AUDIO_SOURCES.includes(value as AudioSource)) {
        throw new Error("Audio settings source is malformed")
      }
      await dependencies.openAudioSystemSettings(value as AudioSource)
      return { success: true }
    }
  )
  ipcMain.handle("profile:get-context", () =>
    dependencies.getProfileContext()
  )
  ipcMain.handle("profile:get-bundle", () =>
    dependencies.getProfileBundle()
  )
  ipcMain.handle("profile:save-bundle", async (_event, value: unknown) => {
    if (!isProfileBundle(value)) throw new Error("Profile bundle is malformed")
    await dependencies.saveProfileBundle(value)
    return { success: true }
  })
  ipcMain.handle("profile:import-markdown", async (_event, value: unknown) => {
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new Error("Profile import path is malformed")
    }
    return dependencies.importProfileMarkdown(value)
  })
  ipcMain.handle("profile:export-dossier", async (_event, value: unknown) => {
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new Error("Profile export destination is malformed")
    }
    await dependencies.exportDossier(value)
    return { success: true }
  })
  ipcMain.handle("prompts:get-catalog", () => dependencies.getPromptCatalog())
  ipcMain.handle("prompts:review-change", (_event, value: unknown) =>
    dependencies.reviewPromptChange(value as PromptTemplateDraft)
  )
  ipcMain.handle("prompts:save-change", (_event, value: unknown) =>
    dependencies.savePromptChange(value as ReviewedPromptChange)
  )
  ipcMain.handle("prompts:delete", (_event, value: unknown) => {
    if (
      typeof value !== "object" ||
      value === null ||
      typeof (value as { id?: unknown }).id !== "string" ||
      typeof (value as { confirmedName?: unknown }).confirmedName !== "string"
    ) throw new Error("Template deletion is malformed")
    const request = value as { id: string; confirmedName: string }
    return dependencies.deletePromptTemplate(request.id, request.confirmedName)
  })
  ipcMain.handle("prompts:select", (_event, value: unknown) => {
    if (
      typeof value !== "object" ||
      value === null ||
      !INTERVIEW_MODES.includes((value as { mode?: InterviewMode }).mode as InterviewMode) ||
      typeof (value as { id?: unknown }).id !== "string"
    ) throw new Error("Template selection is malformed")
    const request = value as { mode: InterviewMode; id: string }
    return dependencies.selectPromptTemplate(request.mode, request.id)
  })
  ipcMain.handle("prompts:restore-built-in", (_event, value: unknown) => {
    if (!INTERVIEW_MODES.includes(value as InterviewMode)) {
      throw new Error("Template mode is malformed")
    }
    return dependencies.restoreBuiltInPrompt(value as InterviewMode)
  })
  ipcMain.handle("history:list", () => dependencies.listHistory())
  ipcMain.handle("history:search", (_event, value: unknown) => {
    if (typeof value !== "string" || value.length > 512) {
      throw new Error("History search is malformed")
    }
    return dependencies.searchHistory(value)
  })
  ipcMain.handle("history:open", (_event, value: unknown) => {
    if (typeof value !== "string" || value.length === 0 || value.length > 512) {
      throw new Error("History identity is malformed")
    }
    return dependencies.openHistory(value)
  })
  ipcMain.handle("history:delete", (_event, value: unknown) => {
    if (
      typeof value !== "object" ||
      value === null ||
      (value as { confirmed?: unknown }).confirmed !== true ||
      !["selected", "all"].includes(String((value as { scope?: unknown }).scope)) ||
      Object.keys(value).some(
        (key) => !["scope", "sessionIds", "confirmed"].includes(key)
      ) ||
      !Array.isArray((value as { sessionIds?: unknown }).sessionIds) ||
      !(value as { sessionIds: unknown[] }).sessionIds.every(
        (id) => typeof id === "string" && id.length > 0 && id.length <= 512
      )
    ) throw new Error("History deletion is malformed")
    return dependencies.deleteHistory(value as HistoryDeleteRequest)
  })
  ipcMain.handle("history:export", (_event, value: unknown) => {
    if (
      typeof value !== "object" ||
      value === null ||
      Object.keys(value).some(
        (key) =>
          ![
            "sessionId",
            "format",
            "destination",
            "disclosureAccepted",
            "overwriteConfirmed"
          ].includes(key)
      ) ||
      typeof (value as { sessionId?: unknown }).sessionId !== "string" ||
      !["markdown", "json"].includes(
        String((value as { format?: unknown }).format)
      ) ||
      typeof (value as { destination?: unknown }).destination !== "string" ||
      (value as { disclosureAccepted?: unknown }).disclosureAccepted !== true ||
      typeof (value as { overwriteConfirmed?: unknown }).overwriteConfirmed !==
        "boolean"
    ) throw new Error("History export is malformed")
    return dependencies.exportHistory(value as HistoryExportRequest)
  })
  ipcMain.handle(INTERVIEW_COMMAND_CHANNEL, (_event, command: unknown) => {
    const parsed = parseInterviewCommand(command)
    return parsed.type === "reset"
      ? dependencies.resetInterview()
      : dependencies.orchestrator.command(parsed)
  })

  ipcMain.handle(
    "window:update-content-dimensions",
    (_event, value: unknown) => {
      if (
        typeof value !== "object" ||
        value === null ||
        typeof (value as { width?: unknown }).width !== "number" ||
        typeof (value as { height?: unknown }).height !== "number"
      ) {
        throw new Error("Window dimensions are malformed")
      }
      const { width, height } = value as { width: number; height: number }
      dependencies.setWindowDimensions(width, height)
    }
  )
  ipcMain.handle("window:toggle", () => {
    dependencies.toggleMainWindow()
    return { success: true }
  })
  ipcMain.handle("window:set-pointer-events", (_event, value: unknown) => {
    if (
      typeof value !== "object" ||
      value === null ||
      typeof (value as { ignore?: unknown }).ignore !== "boolean" ||
      typeof (value as { forward?: unknown }).forward !== "boolean"
    ) {
      throw new Error("Pointer-event routing is malformed")
    }
    const { ignore, forward } = value as { ignore: boolean; forward: boolean }
    dependencies.setWindowPointerEvents(ignore, forward)
    return { success: true }
  })
  ipcMain.handle("window:set-hud-state", (_event, value: unknown) => {
    if (
      value !== "compact-bar" &&
      value !== "compact-answer" &&
      value !== "expanded"
    ) {
      throw new Error("HUD state is malformed")
    }
    dependencies.setHudState(value)
    return { success: true }
  })
  ipcMain.handle("shell:composer-closed", () => {
    dependencies.closeComposer()
    return { success: true }
  })
  ipcMain.handle("capture:screenshot", async () => {
    await dependencies.captureScreenshot()
    return { success: true }
  })
  ipcMain.handle("coding:debug-current", async () => {
    await dependencies.debugCurrentCode()
    return { success: true }
  })
  ipcMain.handle("shortcuts:get", () => dependencies.getShortcutBindings())
  ipcMain.handle("shortcuts:update", (_event, value: unknown) => {
    if (!isShortcutBindings(value)) {
      throw new Error("Shortcut bindings are malformed")
    }
    return dependencies.updateShortcutBindings(value)
  })
  ipcMain.handle("shortcuts:reset", () =>
    dependencies.resetShortcutBindings()
  )
  ipcMain.handle("shell:invoke-action", (_event, value: unknown) => {
    if (!isShortcutAction(value)) {
      throw new Error("Shell action is malformed")
    }
    dependencies.invokeShellAction(value)
    return { success: true }
  })
  ipcMain.handle("settings:show", () => {
    dependencies.showSettings()
    return { success: true }
  })
}
