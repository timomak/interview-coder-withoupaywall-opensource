import { useEffect, useState } from "react"
import type { SubscriptionConfig } from "../../electron/config"
import {
  createIdleInterviewSession
} from "../domain/interview"
import type {
  InterviewMode,
  InterviewSession,
  RecoveryChoice
} from "../shared/interview"
import { ContextDetail } from "../components/ContextDetail/ContextDetail"
import { Header } from "../components/Header/Header"

interface SubscribedAppProps {
  readonly config: SubscriptionConfig
}

export default function SubscribedApp({ config }: SubscribedAppProps) {
  if (!config.provider || !config.model) {
    throw new Error("SubscribedApp requires a configured provider")
  }
  const provider = config.provider
  const model = config.model
  const [session, setSession] = useState<InterviewSession>(
    createIdleInterviewSession()
  )
  const [recovery, setRecovery] = useState<RecoveryChoice>({
    available: false,
    captureActive: false
  })
  const [mode, setMode] = useState<InterviewMode>("coding")
  const [input, setInput] = useState("")

  useEffect(() => {
    void window.electronAPI.getInterviewState().then(setSession)
    void window.electronAPI.getInterviewRecovery().then(setRecovery)
    return window.electronAPI.onInterviewState(setSession)
  }, [])

  const start = async () => {
    const result = await window.electronAPI.dispatchInterviewCommand({
      type: "start",
      snapshot: {
        mode,
        provider,
        model,
        responseMode: config.responseMode,
        language: config.language,
        context: []
      }
    })
    setSession(result.state)
  }

  const submit = async () => {
    const result = await window.electronAPI.dispatchInterviewCommand({
      type: "submit",
      route: "chat",
      input
    })
    setSession(result.state)
    if (result.ok) setInput("")
  }

  return (
    <section className="mx-auto max-w-3xl p-4">
      <Header
        session={session}
        onOpenSettings={() => void window.electronAPI.openSettings()}
      />
      {recovery.available && session.lifecycle === "idle" ? (
        <div className="my-4 rounded border border-amber-400/30 p-3">
          <p>Previous interview found. Capture remains off.</p>
          <div className="mt-2 flex gap-2">
            <button
              onClick={() =>
                void window.electronAPI
                  .dispatchInterviewCommand({ type: "resume" })
                  .then((result) => {
                    setSession(result.state)
                    setRecovery({ available: false, captureActive: false })
                  })
              }
            >
              Resume
            </button>
            <button
              onClick={() =>
                void window.electronAPI
                  .dispatchInterviewCommand({ type: "reset" })
                  .then((result) => {
                    setSession(result.state)
                    setRecovery({ available: false, captureActive: false })
                  })
              }
            >
              Reset
            </button>
          </div>
        </div>
      ) : null}
      {session.lifecycle === "idle" ? (
        <div className="mt-6 space-y-3">
          <label className="block text-sm">
            Mode
            <select
              className="ml-2 bg-neutral-900"
              value={mode}
              onChange={(event) => setMode(event.target.value as InterviewMode)}
            >
              <option value="coding">Coding</option>
              <option value="system-design">System design</option>
              <option value="behavioral">Behavioral</option>
            </select>
          </label>
          <button onClick={() => void start()}>Start interview</button>
        </div>
      ) : (
        <>
          <ContextDetail session={session} />
          <div className="mt-6 space-y-2">
            {session.sections.map((section) => (
              <article key={section.id} className="rounded border border-white/10 p-3">
                <h2>{section.id}</h2>
                <pre className="whitespace-pre-wrap">{section.body}</pre>
              </article>
            ))}
            {session.compactExchanges.map((exchange) => (
              <article key={exchange.id} className="rounded bg-white/5 p-3">
                <p>{exchange.prompt}</p>
                <p className="text-white/70">{exchange.answer}</p>
              </article>
            ))}
          </div>
          <div className="mt-4 flex gap-2">
            <input
              aria-label="Interview chat"
              className="flex-1 bg-neutral-900 p-2"
              value={input}
              onChange={(event) => setInput(event.target.value)}
            />
            <button onClick={() => void submit()}>Send</button>
          </div>
        </>
      )}
    </section>
  )
}
