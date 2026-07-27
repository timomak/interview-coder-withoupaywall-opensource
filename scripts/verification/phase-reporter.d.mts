export interface PlanEntry {
  label: string
  argv: string[]
  classification: "command" | "test"
  expectedExit: number
  minimumPassed?: number
}

export interface EntryResult {
  label: string
  rawExit: number | null
  signal: string | null
  counts: { passed: number; failed: number; skipped: number } | null
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
export function testCommandBinding(
  entry: PlanEntry,
  root?: string
): {
  bindingHash: string
  failures: string[]
  runnerName: "vitest" | "repository-test-script" | null
  scriptName: string | null
}
export function validateTestResultRecord(options: {
  record: unknown
  entry: PlanEntry
  nonce: string
  binding: ReturnType<typeof testCommandBinding>
  root?: string
}): {
  counts: { passed: number; failed: number; skipped: number } | null
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
