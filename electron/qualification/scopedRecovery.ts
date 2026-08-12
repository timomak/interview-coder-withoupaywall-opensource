export type RecoverableCapability =
  | "provider"
  | "microphone"
  | "system-audio"
  | "screen-capture"

export interface RecoveryState<T> {
  readonly session: T
  readonly failures: Readonly<Partial<Record<RecoverableCapability, string>>>
}

export interface RecoveryAttempt<T> {
  readonly capability: RecoverableCapability
  readonly state: RecoveryState<T>
  readonly retry: () => Promise<void>
  readonly repair: () => Promise<void>
}

export class ScopedRecoveryController<T> {
  private failures: Partial<Record<RecoverableCapability, string>> = {}

  constructor(private readonly session: T) {}

  fail(capability: RecoverableCapability, message: string): RecoveryState<T> {
    this.failures = { ...this.failures, [capability]: message }
    return this.current()
  }

  available(capability: RecoverableCapability): boolean {
    return this.failures[capability] === undefined
  }

  async recover(
    capability: RecoverableCapability,
    repair: () => Promise<void>,
    retry: () => Promise<void>
  ): Promise<RecoveryState<T>> {
    await repair()
    await retry()
    const remaining = { ...this.failures }
    delete remaining[capability]
    this.failures = remaining
    return this.current()
  }

  current(): RecoveryState<T> {
    return { session: this.session, failures: { ...this.failures } }
  }
}
