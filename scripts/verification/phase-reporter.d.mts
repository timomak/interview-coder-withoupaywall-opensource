export interface PlanEntry {
  label: string
  argv: string[]
  classification: "command" | "test"
  expectedExit: number
  minimumPassed?: number
}

export interface EntryResult {
  rawExit: number | null
  signal: string | null
  counts: { passed: number; failed: number; skipped: number } | null
  failures: string[]
}

export const CONTROLLER_RESULT_PREFIX: string
export const HOSTILE_CASE_NAMES: readonly string[]
export const FORBIDDEN_LIFECYCLE_HOOKS: readonly string[]
export function canonicalJson(value: unknown): string
export function sha256(bytes: NodeJS.ArrayBufferView | string): string
export function acceptControllerBootstrap(record: unknown): {
  schemaVersion: 1
  protocol: "interviewcopilot-controller-bootstrap-ready-v1"
  phase: "P01"
  role: "local"
  anchorSha256: string
  runBindingSha256: string
  status: "ready"
}
export function forbiddenLifecycleHooks(
  scripts: Record<string, string>
): string[]
export function validateControllerEnvironment(
  environment: Record<string, string>
): string[]
export function validatePlan(plan: unknown): string[]
export function entryFailures(
  entry: PlanEntry,
  result: Pick<EntryResult, "rawExit" | "signal" | "counts">
): string[]
export function aggregateExit(
  results: Array<Pick<EntryResult, "failures">>
): number
export function validateBrokerRecord(record: unknown): string[]
export function validateFilesystemIdentity(record: unknown): string[]
export function validateTerminalRecord(record: unknown): string[]
export function parseCoordinatorResult(options: {
  stdout: string
  authenticationKey: string
  nonce: string
  entryLabel: string
  bindingHash: string
}): { record: unknown; failures: string[] }
