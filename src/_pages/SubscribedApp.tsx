import { useEffect, useRef, useState } from "react"
import type { SubscriptionConfig } from "../../electron/config"
import {
  createIdleInterviewSession
} from "../domain/interview"
import { contextStatusLabel } from "../domain/interview/contextStatus"
import type {
  InterviewMode,
  InterviewSession,
  RecoveryChoice
} from "../shared/interview"
import { ContextDetail } from "../components/ContextDetail/ContextDetail"
import {
  CommandRail,
  CompactComposer,
  PointerRegions,
  HotKeysPanel,
  InputTray,
  AnswerSections
} from "../features/shell"
import type { HudState } from "../shared/shell"

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
  const [composerOpen, setComposerOpen] = useState(false)
  const [hotKeysOpen, setHotKeysOpen] = useState(false)
  const [shellStatus, setShellStatus] = useState("")
  const [hudState, setHudState] = useState<HudState>("compact-bar")
  const hotKeysButton = useRef<HTMLButtonElement>(null)
  const sectionCount =
    session.lifecycle === "active" ? session.sections.length : 0

  useEffect(() => {
    void window.electronAPI.getInterviewState().then(setSession)
    void window.electronAPI.getInterviewRecovery().then(setRecovery)
    return window.electronAPI.onInterviewState(setSession)
  }, [])

  useEffect(() => {
    if (hudState !== "expanded") {
      setHudState(
        session.lifecycle === "active" && sectionCount > 0
          ? "compact-answer"
          : "compact-bar"
      )
    }
  }, [hudState, session.lifecycle, sectionCount])

  useEffect(() => {
    void window.electronAPI.setHudState(hudState)
  }, [hudState])

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

  const submit = async (message = input) => {
    const result = await window.electronAPI.dispatchInterviewCommand({
      type: "submit",
      route: "chat",
      input: message
    })
    setSession(result.state)
    if (result.ok) setInput("")
    return result.ok
  }

  useEffect(
    () =>
      window.electronAPI.onShellShortcut((action) => {
        if (action === "composer") {
          setComposerOpen(true)
        } else if (action === "record") {
          setShellStatus("Recording controls are ready for the audio source.")
        } else if (action === "debug") {
          setShellStatus("Debug capture becomes available in Coding mode.")
        } else if (action === "submit" && session.lifecycle === "active") {
          void submit()
        }
      }),
    [input, session]
  )

  return (
    <section
      className={`quiet-shell quiet-shell-${hudState}`}
      data-density={config.shell?.density ?? "compact"}
      data-text-size={config.shell?.textSize ?? "standard"}
    >
      <PointerRegions />
      <CommandRail
        session={session}
        mode={mode}
        onModeChange={setMode}
        onStart={() => void start()}
        onRecord={() =>
          setShellStatus("Recording controls are ready for the audio source.")
        }
        onScreenshot={() =>
          void window.electronAPI.captureScreenshot().then(() => {
            setShellStatus("Screenshot staged.")
          })
        }
        onChat={() => setComposerOpen(true)}
        onSubmit={() => void submit()}
        onHotKeys={() => setHotKeysOpen((open) => !open)}
        hotKeysButtonRef={hotKeysButton}
        onWorkspace={() =>
          setHudState((current) =>
            current === "expanded" ? "compact-answer" : "expanded"
          )
        }
        onReset={() =>
          void window.electronAPI
            .dispatchInterviewCommand({ type: "reset" })
            .then((result) => setSession(result.state))
        }
        contextLabel={
          session.lifecycle === "active"
            ? contextStatusLabel(session)
            : "New context"
        }
        canSubmit={
          session.lifecycle === "active" &&
          (input.trim().length > 0 ||
            session.artifacts.some(
              (artifact) => artifact.selected && !artifact.submitted
            ))
        }
      />
      {hotKeysOpen ? (
        <HotKeysPanel
          returnFocusTo={hotKeysButton}
          onClose={() => setHotKeysOpen(false)}
        />
      ) : null}
      {composerOpen && session.lifecycle === "active" ? (
        <CompactComposer
          initialValue={input}
          hasSelectedEvidence={session.artifacts.some(
            (artifact) => artifact.selected && !artifact.submitted
          )}
          onSubmit={(message) => submit(message)}
          onClose={() => setComposerOpen(false)}
        />
      ) : null}
      <p className="quiet-status" role="status">{shellStatus}</p>
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
      {session.lifecycle === "active" ? (
        <>
          <InputTray
            artifacts={session.artifacts}
            onSelectionChange={(artifactId, selected) =>
              void window.electronAPI
                .dispatchInterviewCommand({
                  type: "select-artifact",
                  artifactId,
                  selected
                })
                .then((result) => setSession(result.state))
            }
          />
          <ContextDetail session={session} />
          <div className="quiet-answer-region">
            <AnswerSections sections={session.sections} />
            {session.compactExchanges.map((exchange) => (
              <article key={exchange.id} className="rounded bg-white/5 p-3">
                <p>{exchange.prompt}</p>
                <p className="text-white/70">{exchange.answer}</p>
              </article>
            ))}
          </div>
        </>
      ) : null}
    </section>
  )
}
