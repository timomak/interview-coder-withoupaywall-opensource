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

interface SettingsDialogProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

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
  const [textSize, setTextSize] = useState<TextSizePreference>("standard")
  const [shellPreferences, setShellPreferences] =
    useState<LiveShellPreferences | null>(null)
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
      <DialogContent className="bg-black text-white sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Provider settings</DialogTitle>
          <DialogDescription className="text-white/70">
            Choose the signed-in CLI subscription used by your next interview.
            Active interviews keep their original snapshot.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
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
          <ProfileSettings />
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
            {(["standard", "large"] as const).map((value) => (
              <label key={value} className="mr-4 inline-flex gap-2">
                <input
                  type="radio"
                  checked={textSize === value}
                  onChange={() => setTextSize(value)}
                />
                {value === "standard" ? "Standard" : "Large"}
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
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => changeOpen(false)}>
            Cancel
          </Button>
          <Button disabled={isLoading} onClick={save}>
            {isLoading ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
