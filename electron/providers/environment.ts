const ANSWER_SECRET_NAMES = new Set([
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
  "CLAUDE_API_KEY",
  "CLAUDE_CODE_OAUTH_TOKEN",
  "CODEX_API_KEY",
  "CODEX_ACCESS_TOKEN",
  "OPENAI_API_KEY",
  "OPENAI_ACCESS_TOKEN",
  "AZURE_OPENAI_API_KEY",
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_SESSION_TOKEN"
])

export function scrubProviderEnvironment(
  source: NodeJS.ProcessEnv
): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = {}
  for (const [name, value] of Object.entries(source)) {
    if (!ANSWER_SECRET_NAMES.has(name) && value !== undefined) result[name] = value
  }
  result.NO_COLOR = "1"
  result.CI = "1"
  return result
}

export function answerSecretNames(): readonly string[] {
  return [...ANSWER_SECRET_NAMES]
}
