function errorRecord(error: unknown): Record<string, unknown> | null {
  return typeof error === "object" && error !== null
    ? (error as Record<string, unknown>)
    : null
}

export function errorMessage(
  error: unknown,
  fallback = "Unknown error"
): string {
  if (error instanceof Error && error.message) return error.message
  const message = errorRecord(error)?.message
  return typeof message === "string" && message.length > 0 ? message : fallback
}

export function errorStatus(error: unknown): number | undefined {
  const status = errorRecord(error)?.status
  return typeof status === "number" ? status : undefined
}

export function errorResponseStatus(error: unknown): number | undefined {
  const response = errorRecord(error)?.response
  if (typeof response !== "object" || response === null) return undefined
  const status = (response as Record<string, unknown>).status
  return typeof status === "number" ? status : undefined
}
