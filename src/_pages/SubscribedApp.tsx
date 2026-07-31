import { useEffect, useLayoutEffect, useRef, useState } from "react"
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
import {
  CodingWorkspace,
  snapshotCodingLanguage,
  type CodingIntent
} from "../features/coding"
import { deriveHudState } from "../shared/shell"

interface SubscribedAppProps {
  readonly config: SubscriptionConfig
  readonly settingsOpen: boolean
}

export default function SubscribedApp({
  config,
  settingsOpen
}: SubscribedAppProps) {
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
  const [workspaceExpanded, setWorkspaceExpanded] = useState(false)
  const [codingIntent, setCodingIntent] = useState<CodingIntent>()
  const hotKeysButton = useRef<HTMLButtonElement>(null)
  const shell = useRef<HTMLElement>(null)
  const sectionCount =
    session.lifecycle === "active" ? session.sections.length : 0
  const artifactCount =
    session.lifecycle === "active" ? session.artifacts.length : 0
  const hudState = deriveHudState({
    settingsOpen,
    workspaceExpanded,
    composerOpen,
    hotKeysOpen,
    sectionCount,
    artifactCount
  })

  useEffect(() => {
    void window.electronAPI.getInterviewState().then(setSession)
    void window.electronAPI.getInterviewRecovery().then(setRecovery)
    return window.electronAPI.onInterviewState(setSession)
  }, [])

  useEffect(() => {
    void window.electronAPI.setHudState(hudState)
  }, [hudState])

  useLayoutEffect(() => {
    if (hudState === "expanded") return
    const frame = requestAnimationFrame(() => {
      const surface = shell.current
      if (!surface) return
      const width =
        hudState === "compact-bar"
          ? Math.min(520, Math.max(320, surface.scrollWidth))
          : 520
      const height =
        hudState === "compact-bar"
          ? config.shell?.density === "comfortable"
            ? 52
            : 44
          : Math.max(80, surface.scrollHeight)
      void window.electronAPI.updateContentDimensions({ width, height })
    })
    return () => cancelAnimationFrame(frame)
  }, [
    composerOpen,
    config.shell?.density,
    hotKeysOpen,
    hudState,
    sectionCount,
    artifactCount
  ])

  const start = async () => {
    const result = await window.electronAPI.dispatchInterviewCommand({
      type: "start",
      snapshot: {
        mode,
        provider,
        model,
        responseMode: config.responseMode,
        language:
          mode === "coding"
            ? snapshotCodingLanguage(config.language)
            : config.language,
        context: []
      }
    })
    setSession(result.state)
  }

  const submit = async (message = input) => {
    if (mode === "coding" && !codingIntent) {
      setShellStatus("Choose Analyze, Generate Code, Debug, or Follow-up.")
      return false
    }
    const result = await window.electronAPI.dispatchInterviewCommand({
      type: "submit",
      route: mode === "coding" ? "mode-action" : "chat",
      input: message,
      codingIntent: mode === "coding" ? codingIntent : undefined
    })
    setSession(result.state)
    if (result.ok) {
      setInput("")
      setShellStatus("")
    } else {
      setShellStatus(result.error ?? "Request failed.")
    }
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
          if (mode !== "coding" || session.lifecycle !== "active") {
            setShellStatus("Fix current code requires an active Coding question.")
          }
        } else if (action === "submit" && session.lifecycle === "active") {
          void submit()
        }
      }),
    [input, session]
  )

  useEffect(() => {
    if (session.lifecycle === "idle" && composerOpen) {
      setComposerOpen(false)
      void window.electronAPI.closeComposer()
    }
  }, [composerOpen, session.lifecycle])

  return (
    <section
      ref={shell}
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
        onWorkspace={() => setWorkspaceExpanded((expanded) => !expanded)}
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
          onClose={() => {
            setComposerOpen(false)
            void window.electronAPI.closeComposer()
          }}
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
            artifacts={session.artifacts.filter(
              (artifact) =>
                session.snapshot.mode !== "coding" ||
                artifact.kind === "transcript" ||
                artifact.codingBranchId ===
                  session.codingQuestions?.currentBranchId
            )}
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
            {session.snapshot.mode === "coding" ? (
              <CodingWorkspace
                intent={codingIntent}
                sections={session.sections.filter((section) =>
                  session.codingQuestions?.branches
                    .find(
                      (branch) =>
                        branch.id ===
                        session.codingQuestions?.currentBranchId
                    )
                    ?.sectionIds.includes(section.id)
                )}
                onIntentChange={setCodingIntent}
                onNewQuestion={() =>
                  void window.electronAPI
                    .dispatchInterviewCommand({
                      type: "new-coding-question",
                      question: input
                    })
                    .then((result) => {
                      setSession(result.state)
                      if (!result.ok) {
                        setShellStatus(result.error ?? "New Question failed.")
                        return
                      }
                      setCodingIntent(undefined)
                      setInput("")
                      setShellStatus(
                        "New Coding question ready; interview history preserved."
                      )
                    })
                }
                onCodeAction={(action) => {
                  if (action === "copy") {
                    const code = session.sections.find(
                      (section) => section.id === "code"
                    )?.body
                    if (code) void navigator.clipboard.writeText(code)
                  } else if (action === "debug") {
                    void window.electronAPI.debugCurrentCode()
                  } else {
                    setCodingIntent(
                      action === "regenerate" ? "generate-code" : "follow-up"
                    )
                    setComposerOpen(true)
                  }
                }}
              />
            ) : (
              <AnswerSections sections={session.sections} />
            )}
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
