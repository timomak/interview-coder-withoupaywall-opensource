import type {
  ContextItem,
  InterviewMode
} from "../../shared/interview"

export function personalContextForMode(
  mode: InterviewMode,
  context: readonly ContextItem[]
): readonly ContextItem[] {
  if (mode === "coding") {
    return context.filter(
      (item) =>
        item.category !== "profile" && item.category !== "opportunity"
    )
  }
  if (mode === "system-design") {
    return [...context]
  }
  return [...context]
}
