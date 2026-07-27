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
  logPath: string
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

export interface TestEvidenceTrustAnchor {
  schemaVersion: 1
  contract: "p01-test-evidence-v1"
  files: Record<string, string>
  plans: Record<string, string>
  packageScripts: Record<string, string>
  testOuterArguments: Record<string, string[]>
  forbiddenLifecycleHooks: string[]
  vitest: {
    version: string
    resolved: string
    integrity: string
    installedFiles: Record<string, string>
  }
}

export interface TrustContext {
  root: string
  anchor: TestEvidenceTrustAnchor
  anchorDigest: string
  manifestSha256: string
  planHashes: Record<string, string>
  plans: Record<string, { entries: PlanEntry[] }>
  revalidate(options?: { requireInstalled?: boolean }): string[]
}

export function validatePlan(plan: unknown): string[]
export function validateTrustedTestRuntime(
  root?: string,
  trustContext?: TrustContext
): string[]
export function testCommandBinding(
  entry: PlanEntry,
  root?: string,
  trustContext?: TrustContext
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
  trustContext?: TrustContext
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
  trustContext?: TrustContext
}): Promise<{
  report: {
    aggregateExit: number
    entries: EntryResult[]
  }
  jsonPath: string
  textPath: string
  runDirectory: string
}>
export function runVerifiedPhase(options: {
  argv: string[]
  trustContext: TrustContext
}): ReturnType<typeof runEntries>
