export const EXECUTABLE_SOURCE_PATTERN: RegExp
export const TEST_FILE_PATTERN: RegExp
export const CANONICAL_EXECUTABLE_SOURCE_PATTERN: RegExp
export const CANONICAL_TEST_FILE_PATTERN: RegExp
export const GENERATED_OR_DEPENDENCY_DIRECTORIES: ReadonlySet<string>
export interface SourceInventory {
  schemaVersion: 2
  root: string
  executableFiles: string[]
  testFiles: string[]
  hashes: Record<string, string>
  errors: string[]
}
export function normalizeRepositoryPath(filePath: string): string
export function createSourceInventory(root: string): SourceInventory
export function assertSourceInventory(root: string): SourceInventory
export function discoverRepositoryFiles(
  root: string,
  predicate: (name: string) => boolean
): string[]
export function discoverExecutableSourceFiles(root: string): string[]
export function discoverTestFiles(root: string): string[]
export function isTestFile(relativePath: string): boolean
