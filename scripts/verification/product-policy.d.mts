export function validateIdentity(
  packageJson: Record<string, unknown>,
  visibleFiles: Record<string, string>
): string[]
export function scanDependencyNames(
  packageJson: Record<string, unknown>
): string[]
export function scanSourceText(relativePath: string, source: string): string[]
export function scanProductPolicy(root?: string): string[]
