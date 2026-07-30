import type { StartSnapshot } from "../../shared/interview"

export default function QueueCommands({
  snapshot
}: {
  readonly snapshot: StartSnapshot
}) {
  return (
    <button
      onClick={() =>
        void window.electronAPI.dispatchInterviewCommand({
          type: "start",
          snapshot
        })
      }
    >
      Start
    </button>
  )
}
