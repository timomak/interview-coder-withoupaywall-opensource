import fs from "node:fs"
import path from "node:path"
import {
  CONFIG_SCHEMA_VERSION,
  SubscriptionConfig,
  validateSubscriptionConfig,
  withM05aDefaults
} from "./schema"

export interface MigrationResult {
  config: SubscriptionConfig
  migrated: boolean
  backupPath?: string
}

const LEGACY_FIELDS = new Set([
  "apiKey",
  "apiProvider",
  "extractionModel",
  "solutionModel",
  "debuggingModel",
  "credits",
  "plan",
  "quota",
  "entitlement"
])

function atomicOwnerOnlyWrite(target: string, contents: string): void {
  const directory = path.dirname(target)
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 })
  const temporary = path.join(
    directory,
    `.${path.basename(target)}.m01-${process.pid}-${Date.now()}`
  )
  const descriptor = fs.openSync(
    temporary,
    fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY,
    0o600
  )
  try {
    fs.writeFileSync(descriptor, contents, "utf8")
    fs.fsyncSync(descriptor)
  } catch (error) {
    fs.closeSync(descriptor)
    fs.rmSync(temporary, { force: true })
    throw error
  }
  try {
    fs.closeSync(descriptor)
  } catch {
    fs.rmSync(temporary, { force: true })
    throw new Error("Could not close atomic configuration file")
  }
  try {
    fs.renameSync(temporary, target)
  } catch (error) {
    fs.rmSync(temporary, { force: true })
    throw error
  }
  fs.chmodSync(target, 0o600)
  const directoryDescriptor = fs.openSync(directory, fs.constants.O_RDONLY)
  try {
    fs.fsyncSync(directoryDescriptor)
  } finally {
    fs.closeSync(directoryDescriptor)
  }
}

function safeLanguage(value: unknown): string {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : "python"
}

function safeOpacity(value: unknown): number {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0.1 &&
    value <= 1
    ? value
    : 1
}

export function migrateLegacyConfig(
  configPath: string,
  now: () => Date = () => new Date()
): MigrationResult {
  if (!path.isAbsolute(configPath)) {
    throw new Error("Configuration path must be absolute")
  }
  if (!fs.existsSync(configPath)) {
    const config = withM05aDefaults({
      schemaVersion: CONFIG_SCHEMA_VERSION,
      responseMode: "fast",
      language: "python3",
      opacity: 1,
      migration: { id: "M-01", completedAt: "fresh-install" }
    }, "fresh-install")
    atomicOwnerOnlyWrite(configPath, `${JSON.stringify(config, null, 2)}\n`)
    return { config, migrated: false }
  }

  const sourceMetadata = fs.lstatSync(configPath)
  if (sourceMetadata.isSymbolicLink() || !sourceMetadata.isFile()) {
    throw new Error("Configuration must be an owner-controlled regular file")
  }
  if (
    typeof process.getuid === "function" &&
    sourceMetadata.uid !== process.getuid()
  ) {
    throw new Error("Configuration is owned by another user")
  }
  const raw = fs.readFileSync(configPath, "utf8")
  const parsed = JSON.parse(raw) as Record<string, unknown>
  if (parsed.schemaVersion === CONFIG_SCHEMA_VERSION) {
    let current: SubscriptionConfig
    try {
      current = validateSubscriptionConfig(parsed)
    } catch (error) {
      const message = error instanceof Error ? error.message : ""
      if (
        !message.startsWith("Live-shell") &&
        !message.startsWith("M-05a") &&
        !message.startsWith("Configuration migration")
      ) {
        throw error
      }
      current = validateSubscriptionConfig({
        ...parsed,
        shell: undefined,
        migrations: undefined
      })
    }
    const config = withM05aDefaults(current, now().toISOString())
    const changed = JSON.stringify(config) !== JSON.stringify(current)
    if (changed) {
      atomicOwnerOnlyWrite(configPath, `${JSON.stringify(config, null, 2)}\n`)
    }
    fs.chmodSync(configPath, 0o600)
    return { config, migrated: changed }
  }

  const backupPath = `${configPath}.m01-redacted-backup`
  const removedFields = Object.keys(parsed)
    .filter((field) => LEGACY_FIELDS.has(field))
    .sort()
  const backup = {
    migration: "M-01",
    sourceFormat: "legacy-config.json",
    preserved: {
      language: safeLanguage(parsed.language),
      opacity: safeOpacity(parsed.opacity)
    },
    removedFields
  }
  if (!fs.existsSync(backupPath)) {
    atomicOwnerOnlyWrite(backupPath, `${JSON.stringify(backup, null, 2)}\n`)
  } else {
    const backupMetadata = fs.lstatSync(backupPath)
    if (backupMetadata.isSymbolicLink() || !backupMetadata.isFile()) {
      throw new Error("M-01 backup must be an owner-controlled regular file")
    }
    if (
      typeof process.getuid === "function" &&
      backupMetadata.uid !== process.getuid()
    ) {
      throw new Error("M-01 backup is owned by another user")
    }
    fs.chmodSync(backupPath, 0o600)
  }

  const config = withM05aDefaults({
    schemaVersion: CONFIG_SCHEMA_VERSION,
    responseMode: "fast",
    language: safeLanguage(parsed.language),
    opacity: safeOpacity(parsed.opacity),
    migration: {
      id: "M-01",
      completedAt: now().toISOString(),
      legacyBackup: path.basename(backupPath)
    }
  }, now().toISOString())
  atomicOwnerOnlyWrite(configPath, `${JSON.stringify(config, null, 2)}\n`)
  return { config, migrated: true, backupPath }
}

export function writeSubscriptionConfig(
  configPath: string,
  value: SubscriptionConfig
): SubscriptionConfig {
  const config = validateSubscriptionConfig(value)
  atomicOwnerOnlyWrite(configPath, `${JSON.stringify(config, null, 2)}\n`)
  return config
}
