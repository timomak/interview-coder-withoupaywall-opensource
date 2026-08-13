import { useEffect, useState } from "react"
import {
  PROVIDER_CAPABILITIES,
  ProviderId,
  ResponseMode
} from "../../shared/provider"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "../ui/dialog"
import { Button } from "../ui/button"
import { useToast } from "../../contexts/toast"
import type { LiveShellPreferences } from "../../shared/shell"
import { ProfileSettings } from "../../features/profile"
import { AudioSettings } from "../../features/audio"
import { PromptStudio } from "../../features/prompts"
import { HistorySettings } from "../../features/history"
import { MeetVerification } from "../../features/privacy"

interface SettingsDialogProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

const SETTINGS_SECTIONS = [
  ["general", "General"],
  ["profile", "Profile"],
  ["audio", "Audio"],
  ["advanced", "Advanced"]
] as const

type SettingsSection = (typeof SETTINGS_SECTIONS)[number][0]

interface ProviderConfigBridge {
  getConfig(): Promise<{
    provider?: ProviderId
    model?: string
    responseMode?: ResponseMode
    opacity: number
    shell?: LiveShellPreferences
  }>
  configureProvider(config: {
    provider: ProviderId
    model: string
    responseMode: ResponseMode
  }): Promise<unknown>
  updateConfig(config: {
    opacity?: number
    shell?: LiveShellPreferences
  }): Promise<unknown>
}

const percent = (value: number) => Math.round(value * 100)

export function SettingsDialog({
  open: externalOpen,
  onOpenChange
}: SettingsDialogProps) {
  const [open, setOpen] = useState(externalOpen ?? false)
  const [provider, setProvider] = useState<ProviderId>("claude-code")
  const [model, setModel] = useState(
    PROVIDER_CAPABILITIES["claude-code"].models[0]
  )
  const [responseMode, setResponseMode] = useState<ResponseMode>("fast")
  const [isLoading, setIsLoading] = useState(false)
  const [overallOpacity, setOverallOpacity] = useState(1)
  const [backgroundOpacity, setBackgroundOpacity] = useState(0.92)
  const [originalOverallOpacity, setOriginalOverallOpacity] = useState(1)
  const [originalBackgroundOpacity, setOriginalBackgroundOpacity] =
    useState(0.92)
  const [shellPreferences, setShellPreferences] =
    useState<LiveShellPreferences | null>(null)
  const [section, setSection] = useState<SettingsSection>("general")
  const { showToast } = useToast()
  const bridge = window.electronAPI as unknown as ProviderConfigBridge

  useEffect(() => {
    if (externalOpen !== undefined) setOpen(externalOpen)
  }, [externalOpen])

  useEffect(() => {
    if (!open) return
    setIsLoading(true)
    bridge
      .getConfig()
      .then((config) => {
        const nextProvider = config.provider ?? "claude-code"
        const capabilities = PROVIDER_CAPABILITIES[nextProvider]
        const nextOverallOpacity = config.opacity ?? 1
        const nextBackgroundOpacity = config.shell?.backgroundOpacity ?? 0.92
        setProvider(nextProvider)
        setModel(
          config.model && capabilities.models.includes(config.model)
            ? config.model
            : capabilities.models[0]
        )
        setResponseMode(config.responseMode ?? "fast")
        setShellPreferences(config.shell ?? null)
        setOverallOpacity(nextOverallOpacity)
        setBackgroundOpacity(nextBackgroundOpacity)
        setOriginalOverallOpacity(nextOverallOpacity)
        setOriginalBackgroundOpacity(nextBackgroundOpacity)
      })
      .catch(() =>
        showToast("Settings unavailable", "Could not load settings", "error")
      )
      .finally(() => setIsLoading(false))
  }, [bridge, open, showToast])

  const previewOverallOpacity = (value: number) => {
    setOverallOpacity(value)
    void window.electronAPI.setWindowOpacity(value)
  }

  const previewBackgroundOpacity = (value: number) => {
    setBackgroundOpacity(value)
    document.documentElement.style.setProperty(
      "--quiet-background-opacity",
      String(value)
    )
  }

  const changeProvider = (next: ProviderId) => {
    setProvider(next)
    setModel(PROVIDER_CAPABILITIES[next].models[0])
  }

  const changeOpen = (next: boolean) => {
    if (!next) {
      void window.electronAPI.setWindowOpacity(originalOverallOpacity)
      document.documentElement.style.setProperty(
        "--quiet-background-opacity",
        String(originalBackgroundOpacity)
      )
    }
    setOpen(next)
    onOpenChange?.(next)
  }

  const save = async () => {
    setIsLoading(true)
    try {
      await bridge.configureProvider({ provider, model, responseMode })
      if (shellPreferences) {
        await bridge.updateConfig({
          opacity: overallOpacity,
          shell: { ...shellPreferences, backgroundOpacity }
        })
      }
      setOriginalOverallOpacity(overallOpacity)
      setOriginalBackgroundOpacity(backgroundOpacity)
      showToast("Saved", "Appearance updates apply immediately", "success")
      setOpen(false)
      onOpenChange?.(false)
    } catch {
      showToast("Save failed", "Settings were not changed", "error")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent className="settings-dialog bg-black text-white sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription className="text-white/70">
            Keep the copilot readable without covering your interview.
          </DialogDescription>
        </DialogHeader>
        <nav
          className="settings-tabs"
          aria-label="Settings sections"
          role="tablist"
        >
          {SETTINGS_SECTIONS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={section === id}
              onClick={() => setSection(id)}
            >
              {label}
            </button>
          ))}
        </nav>
        <div
          className="settings-body"
          role="tabpanel"
          aria-label={`${SETTINGS_SECTIONS.find(([id]) => id === section)?.[1]} settings`}
        >
          {section === "general" ? (
            <div className="settings-stack">
              <section className="settings-group">
                <h3>Appearance</h3>
                <label className="settings-range">
                  <span>
                    Background opacity
                    <output>{percent(backgroundOpacity)}%</output>
                  </span>
                  <input
                    type="range"
                    min="10"
                    max="100"
                    value={percent(backgroundOpacity)}
                    onChange={(event) =>
                      previewBackgroundOpacity(Number(event.target.value) / 100)
                    }
                  />
                </label>
                <label className="settings-range">
                  <span>
                    Overall opacity
                    <output>{percent(overallOpacity)}%</output>
                  </span>
                  <input
                    type="range"
                    min="10"
                    max="100"
                    value={percent(overallOpacity)}
                    onChange={(event) =>
                      previewOverallOpacity(Number(event.target.value) / 100)
                    }
                  />
                </label>
              </section>
              <section className="settings-group">
                <h3>AI</h3>
                <fieldset>
                  <legend>Provider</legend>
                  {(["claude-code", "codex"] as const).map((candidate) => (
                    <label key={candidate} className="settings-choice">
                      <input
                        type="radio"
                        checked={provider === candidate}
                        onChange={() => changeProvider(candidate)}
                      />
                      {candidate === "claude-code" ? "Claude Code" : "Codex"}
                    </label>
                  ))}
                </fieldset>
                <label className="settings-field">
                  Model
                  <select
                    value={model}
                    onChange={(event) => setModel(event.target.value)}
                  >
                    {PROVIDER_CAPABILITIES[provider].models.map((candidate) => (
                      <option key={candidate}>{candidate}</option>
                    ))}
                  </select>
                </label>
              </section>
            </div>
          ) : null}
          {section === "profile" ? <ProfileSettings /> : null}
          {section === "audio" ? <AudioSettings disabled={isLoading} /> : null}
          {section === "advanced" ? (
            <div className="settings-stack">
              <details className="settings-disclosure">
                <summary>Custom prompts</summary>
                <PromptStudio />
              </details>
              <details className="settings-disclosure">
                <summary>Session history</summary>
                <HistorySettings onContinued={() => changeOpen(false)} />
              </details>
              <details className="settings-disclosure">
                <summary>Capture verification</summary>
                <MeetVerification />
              </details>
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => changeOpen(false)}>
            Cancel
          </Button>
          {section === "general" ? (
            <Button disabled={isLoading} onClick={save}>
              {isLoading ? "Saving…" : "Save"}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
