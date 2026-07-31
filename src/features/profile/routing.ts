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
    return context.flatMap((item) => {
      if (item.category !== "profile") return [item]
      const applicable = item.content
        .split(/\r?\n/)
        .filter((line) =>
          /\b(?:scale|system|architecture|reliability|data|api)\b/i.test(line)
        )
        .join("\n")
      return applicable ? [{ ...item, content: applicable }] : []
    })
  }
  return [...context]
}
