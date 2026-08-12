import {
  ProviderCapabilities,
  ProviderEffort,
  ProviderId,
  ProviderSelection,
  ResponseMode
} from "./types"

export const PROVIDER_CAPABILITIES: Readonly<
  Record<ProviderId, ProviderCapabilities>
> = Object.freeze({
  "claude-code": Object.freeze({
    provider: "claude-code",
    protocol: "claude-stream-json@1",
    minimumCliVersion: "2.1.0",
    maximumCliVersionExclusive: "2.2.0",
    models: Object.freeze(["sonnet", "opus", "haiku"]),
    responseModes: Object.freeze({
      fast: "low",
      reasoning: "high"
    })
  }),
  codex: Object.freeze({
    provider: "codex",
    protocol: "codex-app-server-jsonrpc@2",
    minimumCliVersion: "0.144.0",
    maximumCliVersionExclusive: "0.145.0",
    models: Object.freeze([
      "gpt-5.6-sol",
      "gpt-5.6-terra",
      "gpt-5.6-luna",
      "gpt-5.5",
      "gpt-5.4",
      "gpt-5.4-mini",
      "gpt-5.3-codex-spark",
      "gpt-5.3-codex"
    ]),
    responseModes: Object.freeze({
      fast: "low",
      reasoning: "high"
    })
  })
})

export class UnsupportedProviderSelectionError extends Error {
  readonly code = "UNSUPPORTED_CAPABILITY"

  constructor(message: string) {
    super(message)
    this.name = "UnsupportedProviderSelectionError"
  }
}

export function createSelection(
  provider: ProviderId,
  model: string,
  responseMode: ResponseMode
): Readonly<ProviderSelection> {
  const capabilities = PROVIDER_CAPABILITIES[provider]
  if (!capabilities.models.includes(model)) {
    throw new UnsupportedProviderSelectionError(
      `${provider} does not advertise model ${model}`
    )
  }

  const effort: ProviderEffort | null = capabilities.responseModes[responseMode]
  if (effort === null) {
    throw new UnsupportedProviderSelectionError(
      `${provider} does not support ${responseMode} responses`
    )
  }

  return Object.freeze({ provider, model, responseMode, effort })
}

function parseVersion(version: string): readonly [number, number, number] {
  const match = version.match(/(\d+)\.(\d+)\.(\d+)/)
  if (!match) {
    throw new UnsupportedProviderSelectionError(
      "Provider CLI returned an unrecognized version"
    )
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

function compareVersions(left: string, right: string): number {
  const a = parseVersion(left)
  const b = parseVersion(right)
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index]
  }
  return 0
}

export function assertSupportedCliVersion(
  provider: ProviderId,
  versionOutput: string
): string {
  const capabilities = PROVIDER_CAPABILITIES[provider]
  const match = versionOutput.match(/(\d+\.\d+\.\d+)/)
  if (!match) {
    throw new UnsupportedProviderSelectionError(
      `${provider} did not report a semantic CLI version`
    )
  }
  const version = match[1]
  if (
    compareVersions(version, capabilities.minimumCliVersion) < 0 ||
    compareVersions(version, capabilities.maximumCliVersionExclusive) >= 0
  ) {
    throw new UnsupportedProviderSelectionError(
      `${provider} CLI ${version} is outside supported protocol range ` +
        `${capabilities.minimumCliVersion}..<${capabilities.maximumCliVersionExclusive}`
    )
  }
  return version
}
