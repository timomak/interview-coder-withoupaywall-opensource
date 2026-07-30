import type { ActiveInterviewSession } from "../../shared/interview"

export default function SolutionCommands({
  session
}: {
  readonly session: ActiveInterviewSession
}) {
  const pending = session.requests.find(
    (request) => !request.completed && !request.cancelled
  )
  const cancelled = session.requests.find(
    (request) => request.cancelled && !request.completed
  )
  return (
    <div className="flex gap-2">
      {pending ? (
        <button
          onClick={() =>
            void window.electronAPI.dispatchInterviewCommand({
              type: "cancel",
              requestId: pending.id
            })
          }
        >
          Cancel
        </button>
      ) : null}
      {cancelled ? (
        <button
          onClick={() =>
            void window.electronAPI.dispatchInterviewCommand({
              type: "continue",
              requestId: cancelled.id
            })
          }
        >
          Continue unfinished
        </button>
      ) : null}
    </div>
  )
}
