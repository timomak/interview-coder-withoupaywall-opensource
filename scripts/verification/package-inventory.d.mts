export function validatePackagedInventory(options: {
  asarEntries: string[]
  bundleFiles: string[]
}): string[]
export function inspectPackagedApplication(appPath: string): {
  schemaVersion: number
  appPath: string
  asarPath: string
  asarSha256: string
  asarEntries: string[]
  bundleFiles: string[]
  errors: string[]
}
