import {
  ProviderId,
  ResponseMode,
  createSelection,
  isProviderId
} from "../../src/shared/provider"
import {
  DEFAULT_SHORTCUT_BINDINGS,
  DEFAULT_LIVE_SHELL_PREFERENCES,
  SHORTCUT_ACTIONS,
  isControlShiftShortcut,
  shortcutConflicts,
  type HudState,
  type LiveShellPreferences,
  type PersistedWindowBounds,
  type ShortcutAction,
  type ShortcutBindings
} from "../../src/shared/shell"

export const CONFIG_SCHEMA_VERSION = 1 as const

export interface SubscriptionConfig {
  schemaVersion: typeof CONFIG_SCHEMA_VERSION
  provider?: ProviderId
  model?: string
  responseMode: ResponseMode
  language: string
  opacity: number
  shell?: LiveShellPreferences
  migrations?: {
    readonly m05a?: {
      readonly completedAt: string
    }
    readonly m05b?: {
      readonly completedAt: string
    }
    readonly m06?: {
      readonly completedAt: string
    }
  }
  migration: {
    id: "M-01"
    completedAt: string
    legacyBackup?: string
  }
}

export const DEFAULT_SUBSCRIPTION_CONFIG: SubscriptionConfig = {
  schemaVersion: CONFIG_SCHEMA_VERSION,
  responseMode: "fast",
  language: "python3",
  opacity: 1,
  shell: DEFAULT_LIVE_SHELL_PREFERENCES,
  migrations: {
    m05a: {
      completedAt: "fresh-install"
    },
    m05b: {
      completedAt: "fresh-install"
    },
    m06: {
      completedAt: "fresh-install"
    }
  },
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
    "shell",
    "migrations",
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

  if (candidate.shell !== undefined) {
    validateLiveShellPreferences(candidate.shell)
  }
  if (candidate.migrations !== undefined) {
    if (
      typeof candidate.migrations !== "object" ||
      candidate.migrations === null
    ) {
      throw new Error("Configuration migrations are malformed")
    }
    const migrations = candidate.migrations as Record<string, unknown>
    if (
      Object.keys(migrations).some(
        (key) => key !== "m05a" && key !== "m05b" && key !== "m06"
      )
    ) {
      throw new Error("Configuration migration is unsupported")
    }
    if (migrations.m05a !== undefined) {
      if (
        typeof migrations.m05a !== "object" ||
        migrations.m05a === null ||
        Object.keys(migrations.m05a).some((key) => key !== "completedAt") ||
        typeof (migrations.m05a as Record<string, unknown>).completedAt !==
          "string"
      ) {
        throw new Error("M-05a migration marker is malformed")
      }
    }
    if (migrations.m05b !== undefined) {
      if (
        typeof migrations.m05b !== "object" ||
        migrations.m05b === null ||
        Object.keys(migrations.m05b).some((key) => key !== "completedAt") ||
        typeof (migrations.m05b as Record<string, unknown>).completedAt !==
          "string"
      ) {
        throw new Error("M-05b migration marker is malformed")
      }
    }
    if (migrations.m06 !== undefined) {
      if (
        typeof migrations.m06 !== "object" ||
        migrations.m06 === null ||
        Object.keys(migrations.m06).some((key) => key !== "completedAt") ||
        typeof (migrations.m06 as Record<string, unknown>).completedAt !==
          "string"
      ) {
        throw new Error("M-06 migration marker is malformed")
      }
    }
  }

  return candidate as unknown as SubscriptionConfig
}

function isWindowBounds(value: unknown): value is PersistedWindowBounds {
  if (typeof value !== "object" || value === null) return false
  const candidate = value as Record<string, unknown>
  return (
    Object.keys(candidate).every((key) =>
      ["x", "y", "width", "height"].includes(key)
    ) &&
    ["x", "y", "width", "height"].every(
      (key) =>
        typeof candidate[key] === "number" &&
        Number.isFinite(candidate[key]) &&
        (key === "x" || key === "y" || Number(candidate[key]) > 0)
    )
  )
}

function validateLiveShellPreferences(value: unknown): LiveShellPreferences {
  if (typeof value !== "object" || value === null) {
    throw new Error("Live-shell preferences are malformed")
  }
  const candidate = value as Record<string, unknown>
  if (
    Object.keys(candidate).some(
      (key) => !["density", "textSize", "shortcuts", "geometry"].includes(key)
    ) ||
    (candidate.density !== "compact" &&
      candidate.density !== "comfortable") ||
    (candidate.textSize !== "small" &&
      candidate.textSize !== "default" &&
      candidate.textSize !== "large") ||
    typeof candidate.shortcuts !== "object" ||
    candidate.shortcuts === null ||
    typeof candidate.geometry !== "object" ||
    candidate.geometry === null
  ) {
    throw new Error("Live-shell preferences are malformed")
  }
  const shortcuts = candidate.shortcuts as Record<string, unknown>
  if (
    Object.keys(shortcuts).length !== SHORTCUT_ACTIONS.length ||
    SHORTCUT_ACTIONS.some(
      (action) =>
        typeof shortcuts[action] !== "string" ||
        !isControlShiftShortcut(String(shortcuts[action]))
    )
  ) {
    throw new Error("Live-shell shortcut preferences are malformed")
  }
  if (
    Object.keys(shortcutConflicts(shortcuts as unknown as ShortcutBindings))
      .length > 0
  ) {
    throw new Error("Live-shell shortcut preferences conflict")
  }

  const states: readonly HudState[] = [
    "compact-bar",
    "compact-answer",
    "expanded"
  ]
  for (const display of Object.values(
    candidate.geometry as Record<string, unknown>
  )) {
    if (typeof display !== "object" || display === null) {
      throw new Error("Live-shell display geometry is malformed")
    }
    const geometry = display as Record<string, unknown>
    if (
      Object.keys(geometry).some(
        (state) => !states.includes(state as HudState)
      ) ||
      Object.values(geometry).some((bounds) => !isWindowBounds(bounds))
    ) {
      throw new Error("Live-shell display geometry is malformed")
    }
  }
  return candidate as unknown as LiveShellPreferences
}

export function withM05aDefaults(
  config: SubscriptionConfig,
  completedAt: string
): SubscriptionConfig {
  try {
    if (config.shell) validateLiveShellPreferences(config.shell)
  } catch {
    // Invalid pre-M-05a values deliberately fall back to safe defaults.
  }
  const validatedShell = (() => {
    try {
      return config.shell
        ? validateLiveShellPreferences(config.shell)
        : DEFAULT_LIVE_SHELL_PREFERENCES
    } catch {
      return DEFAULT_LIVE_SHELL_PREFERENCES
    }
  })()
  const legacyNavigationBindings: Readonly<Partial<ShortcutBindings>> = {
    "section-previous": "Control+Option+Left",
    "section-next": "Control+Option+Right",
    "section-scroll-up": "Control+Option+Up",
    "section-scroll-down": "Control+Option+Down"
  }
  const shell = {
    ...validatedShell,
    shortcuts: Object.freeze({
      ...validatedShell.shortcuts,
      ...Object.fromEntries(
        Object.entries(legacyNavigationBindings)
          .filter(
            ([action, legacy]) =>
              validatedShell.shortcuts[action as ShortcutAction] === legacy
          )
          .map(([action]) => [
            action,
            DEFAULT_SHORTCUT_BINDINGS[action as ShortcutAction]
          ])
      )
    }) as ShortcutBindings
  }
  return {
    ...config,
    language:
      config.language.trim().toLowerCase() === "python"
        ? "python3"
        : ["go", "golang"].includes(config.language.trim().toLowerCase())
          ? "go"
          : config.language,
    shell,
    migrations: {
      ...config.migrations,
      m05a: config.migrations?.m05a ?? { completedAt },
      m05b: config.migrations?.m05b ?? { completedAt },
      m06: config.migrations?.m06 ?? { completedAt }
    }
  }
}
