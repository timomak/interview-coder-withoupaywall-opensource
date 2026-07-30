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
  readonly setWindowPointerEvents: (
    ignore: boolean,
    forward: boolean
  ) => void
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
  ipcMain.handle("capture:screenshot", async () => {
    await dependencies.captureScreenshot()
    return { success: true }
  })
  ipcMain.handle("settings:show", () => {
    dependencies.showSettings()
    return { success: true }
  })
}
