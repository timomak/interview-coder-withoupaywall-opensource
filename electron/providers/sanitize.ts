const SECRET_PATTERNS = [
  /\b(?:sk|sk-ant|sess|token)-[A-Za-z0-9._-]{8,}\b/gi,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}\b/gi,
  /\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token)\s*[:=]\s*\S+/gi
]

const ACCOUNT_PATTERNS = [
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
  /\b(?:acct|account|org|user)_[A-Za-z0-9_-]{6,}\b/gi
]

export function sanitizeProviderText(
  value: string,
  sensitiveValues: readonly string[] = []
): string {
  let sanitized = value
  for (const secret of sensitiveValues) {
    if (secret.length > 0) sanitized = sanitized.split(secret).join("[private]")
  }
  for (const pattern of SECRET_PATTERNS) {
    sanitized = sanitized.replace(pattern, "[secret]")
  }
  for (const pattern of ACCOUNT_PATTERNS) {
    sanitized = sanitized.replace(pattern, "[account]")
  }
  return sanitized.slice(0, 2_000)
}
