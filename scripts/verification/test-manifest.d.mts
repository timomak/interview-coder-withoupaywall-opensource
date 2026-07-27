export interface TestManifestEntry {
  path: string
  name: string
  sha256: string
}

export interface TestExecution {
  entryLabel: string
  includeFiles: string[]
  counts: { passed: number; failed: number; skipped: number }
  tests: Array<{
    file: string
    name: string
    state: "pass" | "fail" | "skip"
    fileSha256?: string
  }>
}

export function validateTestManifest(options: {
  root: string
  manifest: { schemaVersion: number; tests: TestManifestEntry[] }
  executions: TestExecution[]
}): string[]
