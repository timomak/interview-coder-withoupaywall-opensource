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
import type {
  DensityPreference,
  LiveShellPreferences,
  TextSizePreference
} from "../../shared/shell"
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
  ["contexts", "Contexts"],
  ["prompts", "Prompts"],
  ["history", "History"],
  ["audio-privacy", "Audio & Privacy"]
] as const

type SettingsSection = (typeof SETTINGS_SECTIONS)[number][0]

interface ProviderConfigBridge {
  getConfig(): Promise<{
    provider?: ProviderId
    model?: string
    responseMode?: ResponseMode
    shell?: LiveShellPreferences
  }>
  configureProvider(config: {
    provider: ProviderId
    model: string
    responseMode: ResponseMode
  }): Promise<unknown>
  updateConfig(config: {
    shell: LiveShellPreferences
  }): Promise<unknown>
}

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
  const [density, setDensity] = useState<DensityPreference>("compact")
  const [textSize, setTextSize] = useState<TextSizePreference>("default")
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
        setProvider(nextProvider)
        setModel(
          config.model && capabilities.models.includes(config.model)
            ? config.model
            : capabilities.models[0]
        )
        setResponseMode(config.responseMode ?? "fast")
        if (config.shell) {
          setShellPreferences(config.shell)
          setDensity(config.shell.density)
          setTextSize(config.shell.textSize)
        }
      })
      .catch(() =>
        showToast("Settings unavailable", "Could not load provider settings", "error")
      )
      .finally(() => setIsLoading(false))
  }, [bridge, open, showToast])

  const changeProvider = (next: ProviderId) => {
    setProvider(next)
    setModel(PROVIDER_CAPABILITIES[next].models[0])
  }

  const changeOpen = (next: boolean) => {
    setOpen(next)
    onOpenChange?.(next)
  }

  const save = async () => {
    setIsLoading(true)
    try {
      await bridge.configureProvider({ provider, model, responseMode })
      if (shellPreferences) {
        await bridge.updateConfig({
          shell: { ...shellPreferences, density, textSize }
        })
      }
      showToast("Saved", "Provider settings apply to the next interview", "success")
      changeOpen(false)
    } catch {
      showToast("Save failed", "Provider settings were not changed", "error")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent className="settings-dialog bg-black text-white sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>InterviewCopilot settings</DialogTitle>
          <DialogDescription className="text-white/70">
            Configure providers, reusable context, prompts, past sessions,
            audio, and privacy in one place.
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
          className="settings-body space-y-4 py-4"
          role="tabpanel"
          aria-label={`${SETTINGS_SECTIONS.find(([id]) => id === section)?.[1]} settings`}
        >
          {section === "general" ? (
            <>
              <p className="text-xs text-white/60">
                Choose the signed-in CLI subscription used by the next
                interview. Active interviews keep their original snapshot.
              </p>
              <fieldset>
                <legend className="mb-2 text-sm font-medium">Provider</legend>
                {(["claude-code", "codex"] as const).map((candidate) => (
                  <label key={candidate} className="mr-4 inline-flex gap-2">
                    <input
                      type="radio"
                      checked={provider === candidate}
                      onChange={() => changeProvider(candidate)}
                    />
                    {candidate === "claude-code" ? "Claude Code" : "Codex"}
                  </label>
                ))}
              </fieldset>
          <fieldset>
            <legend className="mb-2 text-sm font-medium">HUD density</legend>
            {(["compact", "comfortable"] as const).map((value) => (
              <label key={value} className="mr-4 inline-flex gap-2">
                <input
                  type="radio"
                  checked={density === value}
                  onChange={() => setDensity(value)}
                />
                {value === "compact" ? "Compact" : "Comfortable"}
              </label>
            ))}
          </fieldset>
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Text size</legend>
            {(["small", "default", "large"] as const).map((value) => (
              <label key={value} className="mr-4 inline-flex gap-2">
                <input
                  type="radio"
                  checked={textSize === value}
                  onChange={() => setTextSize(value)}
                />
                {value === "default"
                  ? "Default"
                  : value === "small"
                    ? "Small"
                    : "Large"}
              </label>
            ))}
          </fieldset>
          <label className="block text-sm">
            Model
            <select
              value={model}
              onChange={(event) => setModel(event.target.value)}
              className="mt-1 block w-full rounded bg-black p-2"
            >
              {PROVIDER_CAPABILITIES[provider].models.map((candidate) => (
                <option key={candidate}>{candidate}</option>
              ))}
            </select>
          </label>
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Response style</legend>
            {(["fast", "reasoning"] as const).map((mode) => (
              <label key={mode} className="mr-4 inline-flex gap-2">
                <input
                  type="radio"
                  checked={responseMode === mode}
                  onChange={() => setResponseMode(mode)}
                />
                {mode === "fast" ? "Fast" : "Reasoning"}
              </label>
            ))}
          </fieldset>
          <p className="text-xs text-white/50">
            Provider failures stop explicitly. InterviewCopilot never switches
            providers automatically.
          </p>
            </>
          ) : null}
          {section === "contexts" ? <ProfileSettings /> : null}
          {section === "prompts" ? <PromptStudio /> : null}
          {section === "history" ? (
            <HistorySettings onContinued={() => changeOpen(false)} />
          ) : null}
          {section === "audio-privacy" ? (
            <>
              <AudioSettings disabled={isLoading} />
              <MeetVerification />
            </>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => changeOpen(false)}>
            Close
          </Button>
          {section === "general" ? (
            <Button disabled={isLoading} onClick={save}>
              {isLoading ? "Saving…" : "Save general settings"}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
