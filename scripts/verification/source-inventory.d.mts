export const EXECUTABLE_SOURCE_PATTERN: RegExp
export const TEST_FILE_PATTERN: RegExp
export const GENERATED_OR_DEPENDENCY_DIRECTORIES: ReadonlySet<string>
export function normalizeRepositoryPath(filePath: string): string
export function discoverRepositoryFiles(
  root: string,
  predicate: (name: string) => boolean
): string[]
export function discoverExecutableSourceFiles(root: string): string[]
export function discoverTestFiles(root: string): string[]
export function isTestFile(relativePath: string): boolean
