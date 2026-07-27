export interface PlanEntry {
  label: string
  argv: string[]
  classification: "command" | "test"
  expectedExit: number
  minimumPassed?: number
}

export interface EntryResult {
  label: string
  argv: string[]
  actualSpawnArgv: string[] | null
  spawnFile: string | null
  spawned: boolean
  rawExit: number | null
  signal: string | null
  counts: { passed: number; failed: number; skipped: number } | null
  includeFiles: string[]
  tests: Array<{
    file: string
    name: string
    fullName: string
    state: "pass" | "fail" | "skip"
    fileSha256: string
  }>
  evidenceFailures?: string[]
  failures: string[]
}

export function validatePlan(plan: unknown): string[]
export function validatePlanManifest(options?: {
  root?: string
  expectedManifestHash?: string
}): string[]
export function validateTrustedTestRuntime(root?: string): string[]
export function testCommandBinding(
  entry: PlanEntry,
  root?: string
): {
  bindingHash: string
  failures: string[]
  runnerName: "vitest"
  scriptName: string | null
}
export function parseCoordinatorResult(options: {
  stdout: string
  authenticationKey: string
  entry: PlanEntry
  nonce: string
  binding: ReturnType<typeof testCommandBinding>
}): {
  record: unknown
  failures: string[]
}
export function validateTestResultRecord(options: {
  record: unknown
  entry: PlanEntry
  nonce: string
  binding: ReturnType<typeof testCommandBinding>
  root?: string
}): {
  counts: { passed: number; failed: number; skipped: number } | null
  includeFiles: string[]
  tests: Array<{
    file: string
    name: string
    fullName: string
    state: "pass" | "fail" | "skip"
    fileSha256: string
  }>
  failures: string[]
}
export function entryFailures(
  entry: PlanEntry,
  result: Pick<EntryResult, "rawExit" | "signal" | "counts">
): string[]
export function aggregateExit(
  results: Array<Pick<EntryResult, "failures">>
): number
export function runEntries(options: {
  planId: string
  planSha256?: string
  entries: PlanEntry[]
  artifactsDirectory: string
  cwd?: string
  environment?: NodeJS.ProcessEnv
  quiet?: boolean
}): Promise<{
  report: {
    aggregateExit: number
    entries: EntryResult[]
  }
  jsonPath: string
  textPath: string
  runDirectory: string
}>
