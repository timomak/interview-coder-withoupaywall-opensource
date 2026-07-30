import { useCallback, useEffect, useState } from "react"
import SubscribedApp from "./_pages/SubscribedApp"
import { SettingsDialog } from "./components/Settings/SettingsDialog"
import { UpdateNotification } from "./components/UpdateNotification"
import { WelcomeScreen } from "./components/WelcomeScreen"
import {
  Toast,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport
} from "./components/ui/toast"
import { ToastContext } from "./contexts/toast"
import type { SubscriptionConfig } from "../electron/config"

export default function App() {
  const [config, setConfig] = useState<SubscriptionConfig | null>(null)
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
    void window.electronAPI
      .getConfig()
      .then(setConfig)
      .catch((error: unknown) => {
        showToast(
          "Configuration issue",
          error instanceof Error ? error.message : "Configuration could not be read",
          "error"
        )
      })
    return window.electronAPI.onShowSettings(() => setSettingsOpen(true))
  }, [showToast])

  return (
    <ToastProvider>
      <ToastContext.Provider value={{ showToast }}>
        <main className="min-h-screen bg-black text-white">
          {config?.provider && config.model ? (
            <SubscribedApp config={config} />
          ) : (
            <WelcomeScreen onOpenSettings={() => setSettingsOpen(true)} />
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
