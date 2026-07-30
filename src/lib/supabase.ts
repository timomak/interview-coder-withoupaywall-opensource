/**
 * Cloud account support was removed with the provider-only runtime.
 * W3 removes the remaining legacy importer while integrating shared pages.
 */
export function removedCloudAccountBoundary(): never {
  throw new Error("Cloud account flows are not part of InterviewCopilot")
}
