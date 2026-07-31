import {
  AUDIO_SCHEMA_VERSION,
  DEFAULT_AUDIO_PREFERENCES,
  validateAudioPreferences,
  type AudioPreferencesV1
} from "../../../src/shared/audio"
import type { RecordRepository } from "../../storage"

const PREFERENCES_RECORD_ID = "audio-preferences"
const PREFERENCES_RECORD_TYPE =
  "application/vnd.interviewcopilot.m07-audio-preferences+json"

export interface M07AudioPreferencesRecord {
  readonly schemaVersion: typeof AUDIO_SCHEMA_VERSION
  readonly migration: "M-07"
  readonly completedAt: string
  readonly preferences: AudioPreferencesV1
}

function validateM07(value: unknown): M07AudioPreferencesRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("M-07 audio preferences are malformed")
  }
  const candidate = value as Record<string, unknown>
  if (
    Object.keys(candidate).some(
      (key) =>
        !["schemaVersion", "migration", "completedAt", "preferences"].includes(
          key
        )
    ) ||
    candidate.schemaVersion !== AUDIO_SCHEMA_VERSION ||
    candidate.migration !== "M-07" ||
    typeof candidate.completedAt !== "string"
  ) {
    throw new Error("M-07 audio preferences are malformed")
  }
  return {
    schemaVersion: AUDIO_SCHEMA_VERSION,
    migration: "M-07",
    completedAt: candidate.completedAt,
    preferences: validateAudioPreferences(candidate.preferences)
  }
}

export class AudioPreferencesRepository {
  constructor(
    private readonly records: RecordRepository<M07AudioPreferencesRecord>,
    private readonly now: () => string = () => new Date().toISOString()
  ) {}

  async load(): Promise<AudioPreferencesV1> {
    try {
      const stored = await this.records.get(
        PREFERENCES_RECORD_ID,
        PREFERENCES_RECORD_TYPE
      )
      return stored
        ? validateM07(stored).preferences
        : structuredClone(DEFAULT_AUDIO_PREFERENCES)
    } catch {
      // Unsupported/corrupt preferences are preserved in place. Safe defaults
      // prevent both capture and Apple Speech from being enabled implicitly.
      return structuredClone(DEFAULT_AUDIO_PREFERENCES)
    }
  }

  async save(value: unknown): Promise<AudioPreferencesV1> {
    const preferences = validateAudioPreferences(value)
    await this.records.put(
      PREFERENCES_RECORD_ID,
      {
        schemaVersion: AUDIO_SCHEMA_VERSION,
        migration: "M-07",
        completedAt: this.now(),
        preferences
      },
      PREFERENCES_RECORD_TYPE
    )
    return structuredClone(preferences)
  }
}
