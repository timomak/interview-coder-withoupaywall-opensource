import { useMemo, useState } from "react"
import {
  PROVIDER_CAPABILITIES,
  ProviderDiagnostics,
  ProviderId,
  ProviderSelection,
  ResponseMode,
  createSelection
} from "../../shared/provider"

interface ProviderSetupProps {
  diagnostics: readonly ProviderDiagnostics[]
  onComplete: (selection: Readonly<ProviderSelection>) => void
}

const LABELS: Readonly<Record<ProviderId, string>> = {
  "claude-code": "Claude Code",
  codex: "Codex"
}

export function ProviderSetup({
  diagnostics,
  onComplete
}: ProviderSetupProps) {
  const available = useMemo(
    () =>
      diagnostics.filter(
        (item) => item.installed && item.authenticated && item.supported
      ),
    [diagnostics]
  )
  const [provider, setProvider] = useState<ProviderId | null>(null)
  const [responseMode, setResponseMode] = useState<ResponseMode>("fast")
  const capabilities = provider ? PROVIDER_CAPABILITIES[provider] : null
  const [modelByProvider, setModelByProvider] = useState<
    Partial<Record<ProviderId, string>>
  >({})
  const model = provider
    ? modelByProvider[provider] ?? capabilities?.models[0]
    : undefined

  const finish = () => {
    if (provider && model) onComplete(createSelection(provider, model, responseMode))
  }

  return (
    <section aria-labelledby="provider-setup-title" className="space-y-5">
      <div>
        <h1 id="provider-setup-title" className="text-xl font-semibold text-white">
          Connect a provider
        </h1>
        <p className="mt-1 text-sm text-white/60">
          Use an existing Claude Code or Codex subscription. No key is stored.
        </p>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-white">
          Installed and signed-in provider
        </legend>
        {diagnostics.map((item) => {
          const enabled =
            item.installed && item.authenticated && item.supported
          return (
            <label
              key={item.provider}
              className="flex items-center justify-between rounded-lg border border-white/10 p-3"
            >
              <span>
                <span className="block text-sm text-white">
                  {LABELS[item.provider]}
                </span>
                <span className="block text-xs text-white/50">
                  {enabled ? `Ready${item.version ? ` · ${item.version}` : ""}` : item.reason}
                </span>
              </span>
              <input
                type="radio"
                name="provider"
                value={item.provider}
                checked={provider === item.provider}
                disabled={!enabled}
                onChange={() => setProvider(item.provider)}
                aria-label={`Use ${LABELS[item.provider]}`}
              />
            </label>
          )
        })}
      </fieldset>

      {capabilities && provider && (
        <>
          <label className="block text-sm text-white">
            Model
            <select
              className="mt-1 block w-full rounded-md bg-black p-2 text-white"
              value={model}
              onChange={(event) =>
                setModelByProvider((current) => ({
                  ...current,
                  [provider]: event.target.value
                }))
              }
            >
              {capabilities.models.map((candidate) => (
                <option key={candidate} value={candidate}>
                  {candidate}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="text-sm text-white">
            <legend>Response style</legend>
            {(["fast", "reasoning"] as const).map((mode) => (
              <label key={mode} className="mr-4 inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="response-mode"
                  checked={responseMode === mode}
                  onChange={() => setResponseMode(mode)}
                />
                {mode === "fast" ? "Fast" : "Reasoning"}
              </label>
            ))}
          </fieldset>
        </>
      )}

      {available.length === 0 && (
        <p role="status" className="text-sm text-amber-300">
          Install and sign in to one supported provider, then retry.
        </p>
      )}
      <button
        type="button"
        disabled={!provider}
        onClick={finish}
        className="w-full rounded-xl bg-white px-4 py-3 font-medium text-black disabled:opacity-40"
      >
        Start Interview
      </button>
    </section>
  )
}
