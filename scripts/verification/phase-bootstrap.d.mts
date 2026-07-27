import type {
  TestEvidenceTrustAnchor,
  TrustContext
} from "./phase-reporter.mjs"

export interface TrustRoot {
  bootstrapSha256: string
  manifestSha256: string
}

export interface RootInputs extends TrustRoot {
  root?: string
  manifestBytes: Buffer
}

export function sha256(bytes: NodeJS.ArrayBufferView | string): string
export function expectedVerifyPhaseScript(root: TrustRoot): string
export function readPackageTrustRoot(root?: string): TrustRoot
export function validateTrustBoundary(
  inputs: RootInputs & { requireInstalled?: boolean }
): {
  failures: string[]
  value:
    | {
        root: string
        anchor: TestEvidenceTrustAnchor
        anchorDigest: string
        manifestSha256: string
        planHashes: Record<string, string>
        plans: Record<string, { entries: import("./phase-reporter.mjs").PlanEntry[] }>
      }
    | null
}
export function createTrustContext(inputs: RootInputs): TrustContext
export function main(
  argv: string[],
  rootInputs: Omit<RootInputs, "root">
): Promise<void>
