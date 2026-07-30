import path from "node:path"
import { EventEmitter } from "node:events"
import { app } from "electron"
import {
  SubscriptionConfig,
  migrateLegacyConfig,
  writeSubscriptionConfig
} from "./config"

export class ConfigHelper extends EventEmitter {
  private readonly configPath: string

  constructor(configPath?: string) {
    super()
    this.configPath =
      configPath ?? path.join(app.getPath("userData"), "config.json")
  }

  loadConfig(): SubscriptionConfig {
    return migrateLegacyConfig(this.configPath).config
  }

  updateConfig(updates: Partial<SubscriptionConfig>): SubscriptionConfig {
    const current = this.loadConfig()
    const updated = writeSubscriptionConfig(this.configPath, {
      ...current,
      ...updates,
      schemaVersion: 1,
      migration: current.migration
    })
    this.emit("config-updated", updated)
    return updated
  }

  saveConfig(config: SubscriptionConfig): void {
    writeSubscriptionConfig(this.configPath, config)
  }

  getOpacity(): number {
    return this.loadConfig().opacity
  }

  setOpacity(opacity: number): void {
    this.updateConfig({ opacity: Math.min(1, Math.max(0.1, opacity)) })
  }

  getLanguage(): string {
    return this.loadConfig().language
  }

  setLanguage(language: string): void {
    this.updateConfig({ language })
  }
}

export const configHelper = new ConfigHelper()
