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
import {
  CommandRail,
  CompactComposer,
  PointerRegions,
  HotKeysPanel,
  InputTray,
  AnswerSections,
  useLocalShellShortcuts
} from "../features/shell"
import {
  CodingWorkspace,
  snapshotCodingLanguage,
  stripCodeFences,
  type CodingIntent
} from "../features/coding"
import {
  SYSTEM_DESIGN_SECTIONS,
  SystemDesignWorkspace
} from "../features/system-design"
import { BehavioralResponseWorkspace } from "../features/behavioral"
import { CrashDecision } from "../features/history"
import {
  DEFAULT_SHORTCUT_BINDINGS,
  deriveHudState,
  type ShortcutBindings
} from "../shared/shell"
import {
  AudioSessionPanel,
  masterRecordPresentation,
  useAudioSession,
  type AudioSource
} from "../features/audio"

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
  const [promptMenuOpen, setPromptMenuOpen] = useState(false)
  const [moreMenuOpen, setMoreMenuOpen] = useState(false)
  const [input, setInput] = useState("")
  const [composerOpen, setComposerOpen] = useState(false)
  const [hotKeysOpen, setHotKeysOpen] = useState(false)
  const [shortcuts, setShortcuts] = useState<ShortcutBindings>(
    config.shell?.shortcuts ?? DEFAULT_SHORTCUT_BINDINGS
  )
  const [shellStatus, setShellStatus] = useState("")
  const [workspaceExpanded, setWorkspaceExpanded] = useState(false)
  const [debugActive, setDebugActive] = useState(false)
  const [composerIntent, setComposerIntent] = useState<CodingIntent>()
  const hotKeysButton = useRef<HTMLButtonElement>(null)
  const shell = useRef<HTMLElement>(null)
  const answerRegion = useRef<HTMLDivElement>(null)
  const audio = useAudioSession()
  const record = masterRecordPresentation(audio.state)
  const sectionCount =
    session.lifecycle === "active" ? session.sections.length : 0
  const artifactCount =
    session.lifecycle === "active" ? session.artifacts.length : 0
  const baseHudState = deriveHudState({
    settingsOpen,
    workspaceExpanded,
    composerOpen,
    hotKeysOpen,
    sectionCount,
    artifactCount
  })
  const hudState =
    baseHudState === "expanded"
      ? baseHudState
      : promptMenuOpen || moreMenuOpen
        ? "compact-answer"
        : baseHudState

  useEffect(() => {
    void window.electronAPI.getInterviewState().then(setSession)
    void window.electronAPI.getInterviewRecovery().then(setRecovery)
    void window.electronAPI.getShortcutBindings().then(setShortcuts)
    return window.electronAPI.onInterviewState(setSession)
  }, [])

  useEffect(() => {
    void window.electronAPI.setHudState(hudState)
  }, [hudState])

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--quiet-background-opacity",
      String(config.shell?.backgroundOpacity ?? 0.92)
    )
  }, [config.shell?.backgroundOpacity])

  useLayoutEffect(() => {
    if (hudState === "expanded") return
    const frame = requestAnimationFrame(() => {
      const surface = shell.current
      if (!surface) return
      const barHeight = config.shell?.density === "comfortable" ? 52 : 44
      if (session.lifecycle === "active") {
        if (hudState === "compact-bar") {
          void window.electronAPI.updateContentDimensions({
            width: Math.min(1120, Math.max(520, surface.scrollWidth)),
            height: barHeight
          })
          return
        }
        // The user owns the compact-answer window size (drag the corner to
        // resize); only grow it so the rail and any open menu stay visible.
        const railWidth = Math.ceil(
          surface.querySelector(".quiet-rail")?.scrollWidth ?? 0
        )
        const width = Math.max(window.innerWidth, railWidth, 520)
        const height = Math.max(
          window.innerHeight,
          moreMenuOpen ? 400 : 80
        )
        if (width > window.innerWidth || height > window.innerHeight) {
          void window.electronAPI.updateContentDimensions({ width, height })
        }
        return
      }
      const width = promptMenuOpen
        ? Math.min(1120, Math.max(720, surface.scrollWidth))
        : hudState === "compact-bar"
          ? Math.min(1120, Math.max(520, surface.scrollWidth))
          : 520
      const height = promptMenuOpen
        ? 188
        : hudState === "compact-bar"
          ? barHeight
          : Math.max(80, surface.scrollHeight)
      void window.electronAPI.updateContentDimensions({ width, height })
    })
    return () => cancelAnimationFrame(frame)
  }, [
    composerOpen,
    config.shell?.density,
    hotKeysOpen,
    hudState,
    moreMenuOpen,
    promptMenuOpen,
    session.lifecycle,
    shortcuts,
    sectionCount,
    artifactCount
  ])

  const start = async () => {
    const personalContext = await window.electronAPI.getProfileContext()
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
        context: personalContext
      }
    })
    setSession(result.state)
  }

  useLocalShellShortcuts({
    lifecycle: session.lifecycle,
    onSettings: () => void window.electronAPI.openSettings(),
    onHotKeys: () => setHotKeysOpen((open) => !open),
    onStart: () => void start(),
    onQuit: () => void window.electronAPI.quitApplication()
  })

  const requestPending =
    session.lifecycle === "active" &&
    session.requests.some(
      (request) => !request.completed && !request.cancelled
    )

  const branchHasSections =
    session.lifecycle === "active" &&
    (session.codingQuestions?.branches.find(
      (branch) => branch.id === session.codingQuestions?.currentBranchId
    )?.sectionIds.length ?? 0) > 0

  const submit = async (
    message = input,
    explicitCodingIntent?: CodingIntent
  ) => {
    // Sent messages follow up on the current answer unless Debug is toggled
    // on or the branch has no answer yet (first request generates the full
    // analysis plus code).
    const requestedCodingIntent =
      explicitCodingIntent ??
      (debugActive
        ? "debug"
        : branchHasSections
          ? "follow-up"
          : "generate-code")
    const result = await window.electronAPI.dispatchInterviewCommand({
      type: "submit",
      route:
        mode === "coding" || mode === "system-design"
          || mode === "behavioral"
          ? "mode-action"
          : "chat",
      input: message,
      codingIntent: mode === "coding" ? requestedCodingIntent : undefined,
      sectionIds:
        mode === "system-design"
          ? SYSTEM_DESIGN_SECTIONS
          : mode === "behavioral"
            ? ["answer", "star", "evidence", "follow-ups"]
            : undefined
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

  const captureAndAnswer = async () => {
    setShellStatus("Looking at your screen…")
    try {
      await window.electronAPI.captureScreenshot()
      setSession(await window.electronAPI.getInterviewState())
      const answered = await submit(
        "Use the current screen to answer the interviewer.",
        mode === "coding"
          ? debugActive
            ? "debug"
            : "generate-code"
          : undefined
      )
      if (answered) setShellStatus("")
    } catch (error) {
      setShellStatus(
        error instanceof Error ? error.message : "Screen capture failed."
      )
    }
  }

  const openComposer = (intent?: CodingIntent) => {
    setComposerIntent(intent)
    setComposerOpen(true)
  }

  const toggleAudioMaster = () => {
    void audio.dispatch({ type: "master-toggle" })
  }

  const openAudioSystemSettings = (source: AudioSource) => {
    const open = window.electronAPI.openAudioSystemSettings
    if (typeof open !== "function") {
      setShellStatus("Open macOS Privacy & Security to repair audio access.")
      return
    }
    void open(source).then((result) => {
      if (!result.success) {
        setShellStatus("Could not open macOS Privacy & Security.")
      }
    })
  }

  useEffect(
    () =>
      window.electronAPI.onShellShortcut((action) => {
        if (action === "composer") {
          openComposer()
        } else if (action === "record") {
          toggleAudioMaster()
        } else if (action === "screenshot") {
          void captureAndAnswer()
        } else if (action === "debug") {
          if (mode !== "coding" || session.lifecycle !== "active") {
            setShellStatus("Fix current code requires an active Coding question.")
          }
        } else if (action === "submit") {
          if (session.lifecycle === "idle") void start()
          else void submit()
        } else if (
          action === "section-previous" ||
          action === "section-next"
        ) {
          const candidates = Array.from(
            answerRegion.current?.querySelectorAll<HTMLElement>(
              "article, [role='article']"
            ) ?? []
          )
          if (candidates.length === 0) return
          const currentIndex = Math.max(
            0,
            candidates.findIndex((candidate) =>
              candidate.contains(document.activeElement)
            )
          )
          const delta = action === "section-previous" ? -1 : 1
          const next =
            candidates[
              (currentIndex + delta + candidates.length) % candidates.length
            ]
          next.tabIndex = 0
          next.focus()
          next.scrollIntoView({ block: "nearest" })
        } else if (
          action === "section-scroll-up" ||
          action === "section-scroll-down"
        ) {
          answerRegion.current?.scrollBy({
            top: action === "section-scroll-up" ? -120 : 120,
            behavior: "smooth"
          })
        }
      }),
    [audio.dispatch, input, session]
  )

  useEffect(
    () =>
      window.electronAPI.onShellStartupWarning((message) => {
        setShellStatus(message)
      }),
    []
  )

  useEffect(() => {
    if (session.lifecycle === "idle" && composerOpen) {
      setComposerOpen(false)
      void window.electronAPI.closeComposer()
    }
  }, [composerOpen, session.lifecycle])

  useEffect(() => {
    if (session.lifecycle === "idle" && debugActive) setDebugActive(false)
  }, [debugActive, session.lifecycle])

  return (
    <section
      ref={shell}
      className={`quiet-shell quiet-shell-${hudState}`}
      data-density={config.shell?.density ?? "compact"}
      data-text-size={config.shell?.textSize ?? "default"}
    >
      <PointerRegions forceInteractive={settingsOpen} />
      <CommandRail
        session={session}
        mode={mode}
        onModeChange={setMode}
        promptMenuOpen={promptMenuOpen}
        onPromptMenuOpenChange={setPromptMenuOpen}
        moreMenuOpen={moreMenuOpen}
        onMoreMenuOpenChange={setMoreMenuOpen}
        onStart={() => void start()}
        onRecord={toggleAudioMaster}
        recordLabel={record.label}
        recordPressed={record.pressed}
        recordDisabled={!audio.available}
        recordDescription={record.description}
        onScreenshot={() => void captureAndAnswer()}
        onChat={() => openComposer()}
        shortcuts={shortcuts}
        debugActive={debugActive}
        onDebugToggle={() => setDebugActive((active) => !active)}
        onHotKeys={() => setHotKeysOpen((open) => !open)}
        onSettings={() => void window.electronAPI.openSettings()}
        onQuit={() => void window.electronAPI.quitApplication()}
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
      />
      {hotKeysOpen ? (
        <HotKeysPanel
          returnFocusTo={hotKeysButton}
          onClose={() => setHotKeysOpen(false)}
          onBindingsChange={setShortcuts}
        />
      ) : null}
      {composerOpen && session.lifecycle === "active" ? (
        <CompactComposer
          initialValue={input}
          onDraftChange={setInput}
          hasSelectedEvidence={session.artifacts.some(
            (artifact) => artifact.selected && !artifact.submitted
          )}
          onSubmit={(message) =>
            submit(message, composerIntent).then((ok) => {
              if (ok) setComposerIntent(undefined)
              return ok
            })
          }
          onClose={() => {
            setComposerOpen(false)
            setComposerIntent(undefined)
            void window.electronAPI.closeComposer()
          }}
        />
      ) : null}
      {shellStatus ? (
        <div className="quiet-status-card" role="status">
          <span>{shellStatus}</span>
          {shellStatus.includes("Screen Recording") ? (
            <button
              type="button"
              data-interactive
              onClick={() => openAudioSystemSettings("system")}
            >
              Open settings
            </button>
          ) : null}
        </div>
      ) : null}
      {session.lifecycle === "idle" ? (
        <CrashDecision
          recovery={recovery}
          onResume={() =>
            void window.electronAPI
              .dispatchInterviewCommand({ type: "resume" })
              .then((result) => {
                setSession(result.state)
                setRecovery({ available: false, captureActive: false })
              })
          }
          onReset={() =>
            void window.electronAPI
              .dispatchInterviewCommand({ type: "reset" })
              .then((result) => {
                setSession(result.state)
                setRecovery({ available: false, captureActive: false })
              })
          }
        />
      ) : null}
      {session.lifecycle === "active" ? (
        <>
          <AudioSessionPanel
            mode={session.snapshot.mode}
            state={audio.state}
            available={audio.available}
            error={audio.error}
            onCommand={(command) => void audio.dispatch(command)}
            onOpenSystemSettings={openAudioSystemSettings}
            onAnswer={(question) => void submit(question)}
          />
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
          <div
            ref={answerRegion}
            className="quiet-answer-region"
            data-interactive
          >
            {session.snapshot.mode === "coding" ? (
              <CodingWorkspace
                sections={session.sections.filter((section) =>
                  session.codingQuestions?.branches
                    .find(
                      (branch) =>
                        branch.id ===
                        session.codingQuestions?.currentBranchId
                    )
                    ?.sectionIds.includes(section.id)
                )}
                onCodeAction={(action) => {
                  if (action === "copy") {
                    const code = [...session.sections]
                      .reverse()
                      .find(
                        (section) =>
                          (section.id === "code" ||
                            section.id.startsWith("code-")) &&
                          section.body.length > 0
                      )?.body
                    if (code) {
                      void navigator.clipboard.writeText(stripCodeFences(code))
                    }
                  } else {
                    openComposer(
                      action === "regenerate" ? "generate-code" : undefined
                    )
                  }
                }}
              />
            ) : session.snapshot.mode === "system-design" ? (
              <SystemDesignWorkspace
                sections={session.sections}
                onRegenerateArchitecture={() => {
                  setInput("Regenerate only the Architecture section.")
                  setComposerOpen(true)
                }}
                onDeepenEstimates={() => {
                  setInput("Deepen only the requested material estimates.")
                  setComposerOpen(true)
                }}
              />
            ) : session.snapshot.mode === "behavioral" ? (
              <BehavioralResponseWorkspace sections={session.sections} />
            ) : (
              <AnswerSections sections={session.sections} />
            )}
            {requestPending ? (
              <div className="quiet-pending-inline" role="status">
                <span className="quiet-spinner" aria-hidden="true" />
                <span>Answering…</span>
              </div>
            ) : null}
            {session.compactExchanges.map((exchange) => (
              <article key={exchange.id} className="rounded bg-white/5 p-3">
                <p>{exchange.prompt}</p>
                <p className="text-white/70">{exchange.answer}</p>
              </article>
            ))}
          </div>
        </>
      ) : null}
      {hudState !== "compact-bar" ? (
        <div
          className="quiet-resize-grip"
          data-interactive
          aria-hidden="true"
        />
      ) : null}
    </section>
  )
}
