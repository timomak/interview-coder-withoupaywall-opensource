export const DETERMINISTIC_INSTALLATION_KEY: Buffer

export class DeterministicFakeKeyProtector {
  constructor(state?: "available" | "locked" | "wrong-user")
  protect(key: Buffer): Promise<Buffer>
  unprotect(protectedKey: Buffer): Promise<Buffer>
}

export function withTempDirectory<T>(
  run: (root: string) => Promise<T>
): Promise<T>

export function readTree(root: string): Promise<Map<string, Buffer>>
