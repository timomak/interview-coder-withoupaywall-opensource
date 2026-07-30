import {
  ProviderId,
  ResponseMode,
  createSelection,
  isProviderId
} from "../../src/shared/provider"

export const CONFIG_SCHEMA_VERSION = 1 as const

export interface SubscriptionConfig {
  schemaVersion: typeof CONFIG_SCHEMA_VERSION
  provider?: ProviderId
  model?: string
  responseMode: ResponseMode
  language: string
  opacity: number
  migration: {
    id: "M-01"
    completedAt: string
    legacyBackup?: string
  }
}

export const DEFAULT_SUBSCRIPTION_CONFIG: SubscriptionConfig = {
  schemaVersion: CONFIG_SCHEMA_VERSION,
  responseMode: "fast",
  language: "python",
  opacity: 1,
  migration: {
    id: "M-01",
    completedAt: "fresh-install"
  }
}

export function validateSubscriptionConfig(value: unknown): SubscriptionConfig {
  if (typeof value !== "object" || value === null) {
    throw new Error("Configuration must be an object")
  }
  const candidate = value as Record<string, unknown>
  const allowedFields = new Set([
    "schemaVersion",
    "provider",
    "model",
    "responseMode",
    "language",
    "opacity",
    "migration"
  ])
  const unknownField = Object.keys(candidate).find(
    (field) => !allowedFields.has(field)
  )
  if (unknownField) {
    throw new Error(`Unsupported configuration field: ${unknownField}`)
  }
  if (candidate.schemaVersion !== CONFIG_SCHEMA_VERSION) {
    throw new Error("Unsupported configuration schema version")
  }
  if (candidate.provider !== undefined && !isProviderId(candidate.provider)) {
    throw new Error("Unsupported provider in configuration")
  }
  if (
    candidate.responseMode !== "fast" &&
    candidate.responseMode !== "reasoning"
  ) {
    throw new Error("Unsupported response mode in configuration")
  }
  if (
    typeof candidate.language !== "string" ||
    candidate.language.trim().length === 0
  ) {
    throw new Error("Configuration language is required")
  }
  if (
    typeof candidate.opacity !== "number" ||
    !Number.isFinite(candidate.opacity) ||
    candidate.opacity < 0.1 ||
    candidate.opacity > 1
  ) {
    throw new Error("Configuration opacity must be between 0.1 and 1")
  }
  if (typeof candidate.migration !== "object" || candidate.migration === null) {
    throw new Error("Configuration migration marker is required")
  }
  const migration = candidate.migration as Record<string, unknown>
  const unknownMigrationField = Object.keys(migration).find(
    (field) =>
      field !== "id" && field !== "completedAt" && field !== "legacyBackup"
  )
  if (unknownMigrationField) {
    throw new Error(
      `Unsupported configuration migration field: ${unknownMigrationField}`
    )
  }
  if (migration.id !== "M-01" || typeof migration.completedAt !== "string") {
    throw new Error("Configuration migration marker is invalid")
  }
  if (
    migration.legacyBackup !== undefined &&
    (typeof migration.legacyBackup !== "string" ||
      migration.legacyBackup.length === 0)
  ) {
    throw new Error("Configuration migration backup marker is invalid")
  }
  if (
    candidate.model !== undefined &&
    (typeof candidate.model !== "string" || candidate.model.length === 0)
  ) {
    throw new Error("Configuration model is invalid")
  }
  if (
    (candidate.provider === undefined) !== (candidate.model === undefined)
  ) {
    throw new Error("Provider and model must be configured together")
  }
  if (
    isProviderId(candidate.provider) &&
    typeof candidate.model === "string" &&
    (candidate.responseMode === "fast" ||
      candidate.responseMode === "reasoning")
  ) {
    createSelection(
      candidate.provider,
      candidate.model,
      candidate.responseMode
    )
  }

  return candidate as unknown as SubscriptionConfig
}
