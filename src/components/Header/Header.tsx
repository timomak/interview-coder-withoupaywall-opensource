import type { InterviewSession } from "../../shared/interview"

export function Header({
  session,
  onOpenSettings
}: {
  readonly session: InterviewSession
  readonly onOpenSettings: () => void
}) {
  return (
    <header className="flex items-center justify-between border-b border-white/10 py-2">
      <span>
        {session.lifecycle === "active"
          ? `${session.snapshot.mode} · ${session.snapshot.provider}`
          : "Ready"}
      </span>
      <div className="flex gap-2">
        <button onClick={onOpenSettings}>Settings</button>
        {session.lifecycle === "active" ? (
          <button
            onClick={() =>
              void window.electronAPI.dispatchInterviewCommand({ type: "reset" })
            }
          >
            Reset
          </button>
        ) : null}
      </div>
    </header>
  )
}
