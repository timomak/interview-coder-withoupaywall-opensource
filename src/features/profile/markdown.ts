import type {
  CandidateDossier,
  ClaimProvenance,
  ProvenancedClaim
} from "./types"

const REQUIRED_SECTIONS = [
  "# Candidate",
  "## Summary",
  "## Skills",
  "## Experience",
  "## Stories"
] as const

const UNSAFE_LINK = /\]\(\s*(?:javascript|data|file):[^)]*\)/gi
const HTML = /<\/?[a-z][^>]*>/gi
const PROTECTED_DIRECTIVE =
  /^\s*(?:system|assistant|developer|tool)\s*:\s*|(?:ignore|disregard|override|replace|forget)\b.*\b(?:instructions?|rules?|prompt|policy)\b|(?:reveal|print|expose)\b.*\b(?:prompt|secret|token|key)\b/i

export function sanitizeProfileMarkdown(source: string): string {
  return source
    .normalize("NFC")
    .replace(HTML, "")
    .replace(UNSAFE_LINK, "](unsafe-link-removed)")
    .split(/\r?\n/)
    .filter((line) => !PROTECTED_DIRECTIVE.test(line))
    .join("\n")
    .trim()
}

export function validateCanonicalDossier(markdown: string): readonly string[] {
  const errors: string[] = []
  let prior = -1
  for (const heading of REQUIRED_SECTIONS) {
    const index = markdown.indexOf(heading)
    if (index === -1) errors.push(`Missing dossier section: ${heading}`)
    if (index !== -1 && index <= prior) {
      errors.push(`Dossier section is out of order: ${heading}`)
    }
    prior = Math.max(prior, index)
  }
  return errors
}

export function createDossierDraft(
  markdown: string,
  provenance: ClaimProvenance,
  prior?: CandidateDossier
): CandidateDossier {
  const sanitized = sanitizeProfileMarkdown(markdown)
  const errors = validateCanonicalDossier(sanitized)
  if (errors.length > 0) throw new Error(errors.join("; "))
  const claims: ProvenancedClaim[] = sanitized
    .split("\n")
    .filter((line) => /^[-*]\s+\S/.test(line))
    .map((line, index) => {
      const text = line.replace(/^[-*]\s+/, "")
      const existing = prior?.claims.find((claim) => claim.text === text)
      return (
        existing ?? {
          id: `claim-${prior?.revision ?? 0}-${index + 1}`,
          text,
          provenance,
          sourceRevision: (prior?.revision ?? 0) + 1
        }
      )
    })
  return {
    schemaVersion: 1,
    revision: (prior?.revision ?? 0) + 1,
    markdown: sanitized,
    claims,
    status: "draft"
  }
}

export function reviewDossier(dossier: CandidateDossier): CandidateDossier {
  return { ...dossier, status: "reviewed" }
}
