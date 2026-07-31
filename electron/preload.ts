import {
  contextBridge,
  ipcRenderer,
  type IpcRendererEvent
} from "electron"
import {
  INTERVIEW_COMMAND_CHANNEL,
  INTERVIEW_RECOVERY_CHANNEL,
  INTERVIEW_STATE_CHANNEL,
  INTERVIEW_STATE_EVENT
} from "../src/shared/interview"
import type {
  InterviewCommand,
  InterviewSession
} from "../src/shared/interview"
import type { SubscriptionConfig } from "./config"
import type { UpdateInfo } from "../src/types/electron"
import {
  PROVIDER_CONFIGURE_CHANNEL,
  PROVIDER_DIAGNOSTICS_CHANNEL
} from "../src/shared/provider"
import type {
  ShortcutAction,
  ShortcutBindings,
  HudState
} from "../src/shared/shell"
import type { ShortcutRegistrationResult } from "./shortcuts"
import type {
  ProviderDiagnostics,
  ProviderId,
  ResponseMode
} from "../src/shared/provider"

const electronAPI = {
  getConfig: (): Promise<SubscriptionConfig> =>
    ipcRenderer.invoke("config:get"),
  updateConfig: (
    updates: Partial<SubscriptionConfig>
  ): Promise<SubscriptionConfig> =>
    ipcRenderer.invoke("config:update", updates),
  getProviderDiagnostics: (): Promise<readonly ProviderDiagnostics[]> =>
    ipcRenderer.invoke(PROVIDER_DIAGNOSTICS_CHANNEL),
  configureProvider: (selection: {
    provider: ProviderId
    model: string
    responseMode: ResponseMode
  }): Promise<SubscriptionConfig> =>
    ipcRenderer.invoke(PROVIDER_CONFIGURE_CHANNEL, selection),
  getInterviewState: (): Promise<InterviewSession> =>
    ipcRenderer.invoke(INTERVIEW_STATE_CHANNEL),
  getInterviewRecovery: () =>
    ipcRenderer.invoke(INTERVIEW_RECOVERY_CHANNEL),
  dispatchInterviewCommand: (command: InterviewCommand) =>
    ipcRenderer.invoke(INTERVIEW_COMMAND_CHANNEL, command),
  onInterviewState: (callback: (state: InterviewSession) => void) => {
    const listener = (_event: IpcRendererEvent, state: InterviewSession) =>
      callback(state)
    ipcRenderer.on(INTERVIEW_STATE_EVENT, listener)
    return () => ipcRenderer.removeListener(INTERVIEW_STATE_EVENT, listener)
  },
  openSettings: () => ipcRenderer.invoke("settings:show"),
  onShowSettings: (callback: () => void) => {
    const listener = () => callback()
    ipcRenderer.on("settings:show", listener)
    return () => ipcRenderer.removeListener("settings:show", listener)
  },
  updateContentDimensions: (dimensions: { width: number; height: number }) =>
    ipcRenderer.invoke("window:update-content-dimensions", dimensions),
  setWindowPointerEvents: (ignore: boolean, forward: boolean) =>
    ipcRenderer.invoke("window:set-pointer-events", { ignore, forward }),
  setHudState: (state: HudState) =>
    ipcRenderer.invoke("window:set-hud-state", state),
  captureScreenshot: () => ipcRenderer.invoke("capture:screenshot"),
  debugCurrentCode: () => ipcRenderer.invoke("coding:debug-current"),
  getShortcutBindings: (): Promise<ShortcutBindings> =>
    ipcRenderer.invoke("shortcuts:get"),
  updateShortcutBindings: (
    bindings: ShortcutBindings
  ): Promise<ShortcutRegistrationResult> =>
    ipcRenderer.invoke("shortcuts:update", bindings),
  resetShortcutBindings: (): Promise<ShortcutRegistrationResult> =>
    ipcRenderer.invoke("shortcuts:reset"),
  closeComposer: () => ipcRenderer.invoke("shell:composer-closed"),
  onShellShortcut: (callback: (action: ShortcutAction) => void) => {
    const listener = (_event: IpcRendererEvent, action: ShortcutAction) =>
      callback(action)
    ipcRenderer.on("shell:shortcut", listener)
    return () => ipcRenderer.removeListener("shell:shortcut", listener)
  },
  toggleMainWindow: () => ipcRenderer.invoke("window:toggle"),
  getPlatform: () => process.platform,
  startUpdate: () => ipcRenderer.invoke("start-update"),
  installUpdate: () => ipcRenderer.invoke("install-update"),
  onUpdateAvailable: (callback: (info: UpdateInfo) => void) => {
    const listener = (_event: IpcRendererEvent, info: UpdateInfo) =>
      callback(info)
    ipcRenderer.on("update-available", listener)
    return () => ipcRenderer.removeListener("update-available", listener)
  },
  onUpdateDownloaded: (callback: (info: UpdateInfo) => void) => {
    const listener = (_event: IpcRendererEvent, info: UpdateInfo) =>
      callback(info)
    ipcRenderer.on("update-downloaded", listener)
    return () => ipcRenderer.removeListener("update-downloaded", listener)
  }
}

contextBridge.exposeInMainWorld("electronAPI", electronAPI)
