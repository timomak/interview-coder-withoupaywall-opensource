export interface BundleEntry {
  path: string
  type: "file" | "symlink" | "other"
  size: number
  sha256: string | null
  target?: string
}
export function validatePackagedInventory(options: {
  asarEntries: string[]
  bundleEntries?: BundleEntry[]
  bundleFiles?: string[]
}): string[]
export function inspectPackagedApplication(appPath: string): {
  schemaVersion: 2
  appPath: string
  asarPath: string
  asarSha256: string
  asarEntries: string[]
  bundleEntries: BundleEntry[]
  bundleFiles: string[]
  errors: string[]
}
