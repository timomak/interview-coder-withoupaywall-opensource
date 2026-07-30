import { ipcMain } from "electron"
import { configHelper } from "./ConfigHelper"
import {
  INTERVIEW_COMMAND_CHANNEL,
  INTERVIEW_RECOVERY_CHANNEL,
  INTERVIEW_STATE_CHANNEL,
  parseInterviewCommand
} from "../src/shared/interview"
import type { InterviewOrchestrator } from "./orchestrator"

export interface IpcHandlerDependencies {
  readonly orchestrator: InterviewOrchestrator
  readonly setWindowDimensions: (width: number, height: number) => void
  readonly toggleMainWindow: () => void
  readonly showSettings: () => void
}

export function initializeIpcHandlers(
  dependencies: IpcHandlerDependencies
): void {
  ipcMain.handle("config:get", () => configHelper.loadConfig())
  ipcMain.handle("config:update", (_event, updates: unknown) => {
    if (typeof updates !== "object" || updates === null) {
      throw new Error("Configuration update is malformed")
    }
    return configHelper.updateConfig(updates)
  })

  ipcMain.handle(INTERVIEW_STATE_CHANNEL, () =>
    dependencies.orchestrator.current()
  )
  ipcMain.handle(INTERVIEW_RECOVERY_CHANNEL, () =>
    dependencies.orchestrator.inspectRecovery()
  )
  ipcMain.handle(INTERVIEW_COMMAND_CHANNEL, (_event, command: unknown) =>
    dependencies.orchestrator.command(parseInterviewCommand(command))
  )

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
  ipcMain.handle("settings:show", () => {
    dependencies.showSettings()
    return { success: true }
  })
}
