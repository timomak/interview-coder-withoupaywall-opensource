import { useCallback, useEffect, useState } from "react"
import SubscribedApp from "./_pages/SubscribedApp"
import { SettingsDialog } from "./components/Settings/SettingsDialog"
import { UpdateNotification } from "./components/UpdateNotification"
import { ProviderSetup } from "./features/onboarding"
import {
  Toast,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport
} from "./components/ui/toast"
import { ToastContext } from "./contexts/toast"
import type { SubscriptionConfig } from "../electron/config"
import type {
  ProviderDiagnostics,
  ProviderSelection
} from "./shared/provider"

export default function App() {
  const [config, setConfig] = useState<SubscriptionConfig | null>(null)
  const [diagnostics, setDiagnostics] = useState<
    readonly ProviderDiagnostics[]
  >([])
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [toast, setToast] = useState({
    open: false,
    title: "",
    description: "",
    variant: "neutral" as "neutral" | "success" | "error"
  })

  const showToast = useCallback(
    (
      title: string,
      description: string,
      variant: "neutral" | "success" | "error"
    ) => setToast({ open: true, title, description, variant }),
    []
  )

  useEffect(() => {
    void Promise.all([
      window.electronAPI.getConfig(),
      window.electronAPI.getProviderDiagnostics()
    ])
      .then(([nextConfig, nextDiagnostics]) => {
        setConfig(nextConfig)
        setDiagnostics(nextDiagnostics)
      })
      .catch((error: unknown) => {
        showToast(
          "Configuration issue",
          error instanceof Error ? error.message : "Configuration could not be read",
          "error"
        )
      })
    return window.electronAPI.onShowSettings(() => setSettingsOpen(true))
  }, [showToast])

  const completeProviderSetup = async (
    selection: Readonly<ProviderSelection>
  ) => {
    try {
      const next = await window.electronAPI.configureProvider({
        provider: selection.provider,
        model: selection.model,
        responseMode: selection.responseMode
      })
      setConfig(next)
    } catch (error) {
      setDiagnostics(await window.electronAPI.getProviderDiagnostics())
      showToast(
        "Provider unavailable",
        error instanceof Error
          ? error.message
          : "Provider subscription could not be verified",
        "error"
      )
    }
  }

  return (
    <ToastProvider>
      <ToastContext.Provider value={{ showToast }}>
        <main
          className={
            config?.provider && config.model
              ? "min-h-screen bg-transparent text-white"
              : "min-h-screen bg-black text-white"
          }
        >
          {config?.provider && config.model ? (
            <SubscribedApp config={config} settingsOpen={settingsOpen} />
          ) : (
            <div className="mx-auto max-w-xl p-6">
              <ProviderSetup
                diagnostics={diagnostics}
                onComplete={(selection) =>
                  void completeProviderSetup(selection)
                }
                onRetry={() =>
                  void window.electronAPI
                    .getProviderDiagnostics()
                    .then(setDiagnostics)
                }
              />
            </div>
          )}
          <UpdateNotification />
        </main>
        <SettingsDialog
          open={settingsOpen}
          onOpenChange={(open) => {
            setSettingsOpen(open)
            if (!open) void window.electronAPI.getConfig().then(setConfig)
          }}
        />
        <Toast
          open={toast.open}
          onOpenChange={(open) =>
            setToast((current) => ({ ...current, open }))
          }
          variant={toast.variant}
          duration={2500}
        >
          <ToastTitle>{toast.title}</ToastTitle>
          <ToastDescription>{toast.description}</ToastDescription>
        </Toast>
        <ToastViewport />
      </ToastContext.Provider>
    </ToastProvider>
  )
}
