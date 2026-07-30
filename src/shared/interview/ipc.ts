import {
  CONTEXT_CATEGORIES,
  INTERVIEW_MODES,
  InterviewCommand,
  StartSnapshot
} from "./types"
import { isProviderId } from "../provider"

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[]
): boolean {
  const allowed = new Set(allowedKeys)
  return Object.keys(value).every((key) => allowed.has(key))
}

function isStartSnapshot(value: unknown): value is StartSnapshot {
  if (!isRecord(value)) return false
  if (
    !hasOnlyKeys(value, [
      "mode",
      "provider",
      "model",
      "responseMode",
      "language",
      "context"
    ]) ||
    !INTERVIEW_MODES.includes(value.mode as StartSnapshot["mode"]) ||
    !isProviderId(value.provider) ||
    !isString(value.model) ||
    (value.responseMode !== "fast" && value.responseMode !== "reasoning") ||
    !isString(value.language) ||
    !Array.isArray(value.context)
  ) {
    return false
  }
  return value.context.every(
    (item) =>
      isRecord(item) &&
      hasOnlyKeys(item, ["id", "category", "revision", "content"]) &&
      isString(item.id) &&
      CONTEXT_CATEGORIES.includes(
        item.category as StartSnapshot["context"][number]["category"]
      ) &&
      Number.isSafeInteger(item.revision) &&
      (item.revision as number) >= 0 &&
      typeof item.content === "string"
  )
}

export function parseInterviewCommand(value: unknown): InterviewCommand {
  if (!isRecord(value) || !isString(value.type)) {
    throw new Error("Malformed interview command")
  }
  switch (value.type) {
    case "start":
      if (
        !hasOnlyKeys(value, ["type", "snapshot"]) ||
        !isStartSnapshot(value.snapshot)
      ) {
        break
      }
      return { type: "start", snapshot: value.snapshot }
    case "stage-artifact": {
      const artifact = value.artifact
      if (
        !hasOnlyKeys(value, ["type", "artifact"]) ||
        !isRecord(artifact) ||
        !hasOnlyKeys(artifact, ["id", "kind", "finalizedAt", "content"]) ||
        !isString(artifact.id) ||
        (artifact.kind !== "transcript" && artifact.kind !== "screenshot") ||
        !isString(artifact.finalizedAt) ||
        typeof artifact.content !== "string"
      ) {
        break
      }
      return {
        type: "stage-artifact",
        artifact: {
          id: artifact.id,
          kind: artifact.kind,
          finalizedAt: artifact.finalizedAt,
          content: artifact.content
        }
      }
    }
    case "select-artifact":
      if (
        !hasOnlyKeys(value, ["type", "artifactId", "selected"]) ||
        !isString(value.artifactId) ||
        typeof value.selected !== "boolean"
      ) {
        break
      }
      return {
        type: "select-artifact",
        artifactId: value.artifactId,
        selected: value.selected
      }
    case "submit":
      if (
        !hasOnlyKeys(value, ["type", "route", "input", "sectionIds"]) ||
        !["mode-action", "chat", "clarification", "correction"].includes(
          String(value.route)
        ) ||
        typeof value.input !== "string" ||
        (value.sectionIds !== undefined &&
          (!Array.isArray(value.sectionIds) ||
            !value.sectionIds.every(isString)))
      ) {
        break
      }
      return {
        type: "submit",
        route: value.route as Extract<InterviewCommand, { type: "submit" }>["route"],
        input: value.input,
        sectionIds: value.sectionIds as readonly string[] | undefined
      }
    case "cancel":
    case "continue":
      if (
        !hasOnlyKeys(value, ["type", "requestId"]) ||
        !isString(value.requestId)
      ) {
        break
      }
      return { type: value.type, requestId: value.requestId }
    case "reset":
    case "resume":
      if (!hasOnlyKeys(value, ["type"])) break
      return { type: value.type }
  }
  throw new Error("Malformed interview command")
}
