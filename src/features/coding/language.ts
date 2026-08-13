export type LanguageQuality = "first-class" | "best-effort"

export interface CodingLanguage {
  readonly id: string
  readonly label: string
  readonly aliases: readonly string[]
  readonly quality: LanguageQuality
  readonly fence: string
}

export const CODING_LANGUAGES: readonly CodingLanguage[] = Object.freeze([
  { id: "python3", label: "Python 3", aliases: ["python", "py", "python3"], quality: "first-class", fence: "python" },
  { id: "typescript", label: "JavaScript / TypeScript", aliases: ["javascript", "js", "typescript", "ts"], quality: "first-class", fence: "typescript" },
  { id: "java", label: "Java", aliases: ["java"], quality: "first-class", fence: "java" },
  { id: "go", label: "Go", aliases: ["go", "golang"], quality: "first-class", fence: "go" },
  { id: "cpp", label: "C++", aliases: ["c++", "cpp"], quality: "first-class", fence: "cpp" },
  { id: "csharp", label: "C#", aliases: ["c#", "csharp", "cs"], quality: "first-class", fence: "csharp" },
  { id: "rust", label: "Rust (best effort)", aliases: ["rust", "rs"], quality: "best-effort", fence: "rust" },
  { id: "swift", label: "Swift (best effort)", aliases: ["swift"], quality: "best-effort", fence: "swift" },
  { id: "kotlin", label: "Kotlin (best effort)", aliases: ["kotlin", "kt"], quality: "best-effort", fence: "kotlin" },
  { id: "ruby", label: "Ruby (best effort)", aliases: ["ruby", "rb"], quality: "best-effort", fence: "ruby" },
  { id: "sql", label: "SQL (best effort)", aliases: ["sql"], quality: "best-effort", fence: "sql" },
  { id: "r", label: "R (best effort)", aliases: ["r"], quality: "best-effort", fence: "r" }
])

const aliasMap = new Map(
  CODING_LANGUAGES.flatMap((language) =>
    language.aliases.map((alias) => [alias.toLowerCase(), language] as const)
  )
)

export function normalizeCodingLanguage(value: string): CodingLanguage {
  const language = aliasMap.get(value.trim().toLowerCase())
  if (!language) {
    throw new Error(`Unsupported Coding language: ${value}`)
  }
  return language
}

export function snapshotCodingLanguage(value: string): string {
  return normalizeCodingLanguage(value).id
}

export function stripCodeFences(code: string): string {
  const trimmed = code.trim()
  const fenced = trimmed.match(/^```[^\n]*\n?([\s\S]*?)\n?```$/)
  return fenced ? fenced[1] : trimmed
}
