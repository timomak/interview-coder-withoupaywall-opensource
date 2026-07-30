import { Button } from "./ui/button"

interface WelcomeScreenProps {
  onOpenSettings: () => void
}

export function WelcomeScreen({ onOpenSettings }: WelcomeScreenProps) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-black p-6">
      <section className="w-full max-w-md rounded-xl border border-white/10 p-6">
        <h1 className="text-2xl font-bold text-white">InterviewCopilot</h1>
        <p className="mt-3 text-sm text-white/70">
          Connect a signed-in Claude Code or Codex CLI subscription to begin.
          Your provider choice is locked for each interview.
        </p>
        <div className="mt-6 rounded-lg border border-white/10 bg-white/5 p-4">
          <h2 className="font-medium text-white">Getting started</h2>
          <ol className="mt-2 list-inside list-decimal space-y-1 text-sm text-white/70">
            <li>Install Claude Code or Codex.</li>
            <li>Sign in through that provider’s CLI.</li>
            <li>Choose a model and response style.</li>
          </ol>
        </div>
        <Button className="mt-6 w-full" onClick={onOpenSettings}>
          Configure provider
        </Button>
      </section>
    </main>
  )
}
