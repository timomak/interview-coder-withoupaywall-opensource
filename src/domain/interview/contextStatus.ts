import type { ActiveInterviewSession } from "../../shared/interview"

export type ContextStatusLabel =
  | "New context"
  | "Updating"
  | "Full context"
  | "Context issue"

export function contextStatusLabel(
  session: ActiveInterviewSession
): ContextStatusLabel {
  switch (session.contextPhase) {
    case "new":
      return "New context"
    case "updating":
      return "Updating"
    case "full":
      return "Full context"
    case "issue":
      return "Context issue"
    default: {
      const exhaustive: never = session.contextPhase
      return exhaustive
    }
  }
}
