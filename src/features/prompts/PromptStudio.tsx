import { useEffect, useMemo, useState } from "react"
import type { InterviewMode } from "../../shared/interview"
import {
  applyGuidedPromptAnswer,
  createPromptDraft
} from "./model"
import type {
  PromptCatalog,
  PromptTemplateV1,
  ReviewedPromptChange
} from "./types"

const MODES: readonly InterviewMode[] = [
  "coding",
  "system-design",
  "behavioral"
]

interface PromptBridge {
  getPromptCatalog(): Promise<PromptCatalog>
  reviewPromptChange(
    draft: ReturnType<typeof createPromptDraft>
  ): Promise<ReviewedPromptChange>
  savePromptChange(reviewed: ReviewedPromptChange): Promise<PromptCatalog>
  deletePromptTemplate(id: string, confirmedName: string): Promise<PromptCatalog>
  selectPromptTemplate(mode: InterviewMode, id: string): Promise<PromptCatalog>
  restoreBuiltInPrompt(mode: InterviewMode): Promise<PromptCatalog>
}

function newId(): string {
  return `user:${crypto.randomUUID()}`
}

export function PromptStudio() {
  const bridge = window.electronAPI as unknown as PromptBridge
  const [catalog, setCatalog] = useState<PromptCatalog>()
  const [mode, setMode] = useState<InterviewMode>("coding")
  const [baseId, setBaseId] = useState<string>()
  const [draftId, setDraftId] = useState(newId)
  const [name, setName] = useState("")
  const [instructions, setInstructions] = useState("")
  const [source, setSource] = useState<"duplicate" | "guided-chat" | "manual-edit">("manual-edit")
  const [guidedAnswer, setGuidedAnswer] = useState("")
  const [reviewed, setReviewed] = useState<ReviewedPromptChange>()
  const [deleteConfirmation, setDeleteConfirmation] = useState("")
  const [status, setStatus] = useState("")

  useEffect(() => {
    void bridge.getPromptCatalog().then(setCatalog).catch(() => setStatus("Prompt Studio is unavailable."))
  }, [bridge])

  const base = useMemo(
    () => catalog?.templates.find((template) => template.id === baseId),
    [baseId, catalog]
  )
  const templates = catalog?.templates.filter((template) => template.mode === mode) ?? []

  const edit = (template: PromptTemplateV1) => {
    setMode(template.mode)
    setBaseId(template.id)
    setDraftId(template.kind === "built-in" ? newId() : template.id)
    setName(template.kind === "built-in" ? `${template.name} copy` : template.name)
    setInstructions(template.instructions)
    setSource(template.kind === "built-in" ? "duplicate" : "manual-edit")
    setReviewed(undefined)
    setDeleteConfirmation("")
  }

  const resetDraft = (nextMode = mode) => {
    setMode(nextMode)
    setBaseId(undefined)
    setDraftId(newId())
    setName("")
    setInstructions("")
    setSource("manual-edit")
    setReviewed(undefined)
  }

  const draft = () => createPromptDraft({
    base,
    id: draftId,
    mode,
    name,
    instructions,
    source,
    updatedAt: new Date().toISOString()
  })

  const review = async () => {
    try {
      setReviewed(await bridge.reviewPromptChange(draft()))
      setStatus("Review the semantic diff, then save.")
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Review failed.")
    }
  }

  const save = async () => {
    if (!reviewed) return
    try {
      const next = await bridge.savePromptChange(reviewed)
      setCatalog(next)
      setBaseId(reviewed.draft.candidate.id)
      setReviewed(undefined)
      setStatus("Reviewed template saved for a future interview.")
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Save failed.")
    }
  }

  const addGuided = () => {
    try {
      const next = applyGuidedPromptAnswer(base, {
        id: draftId,
        mode,
        name,
        answer: guidedAnswer,
        updatedAt: new Date().toISOString()
      })
      setInstructions(next.candidate.instructions)
      setSource("guided-chat")
      setGuidedAnswer("")
      setReviewed(undefined)
      setStatus("Guided change added to the same review draft.")
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Guided edit failed.")
    }
  }

  return (
    <section aria-label="Prompt Studio" className="space-y-3 border-t border-white/10 pt-3">
      <h3 className="text-sm font-medium">Prompt Studio</h3>
      <label className="block text-sm">
        Core mode
        <select
          aria-label="Prompt mode"
          value={mode}
          onChange={(event) => resetDraft(event.target.value as InterviewMode)}
          className="mt-1 w-full rounded bg-black p-2"
        >
          {MODES.map((candidate) => <option key={candidate} value={candidate}>{candidate}</option>)}
        </select>
      </label>
      <ul aria-label={`${mode} templates`} className="space-y-1 text-sm">
        {templates.map((template) => (
          <li key={template.id}>
            <button type="button" onClick={() => edit(template)}>
              {template.name} {template.kind === "built-in" ? "(built-in)" : ""}
            </button>
            {catalog?.selections[mode] === template.id ? " — selected" : ""}
            <button
              type="button"
              className="ml-2"
              onClick={() => void bridge.selectPromptTemplate(mode, template.id).then(setCatalog)}
            >
              Use next
            </button>
          </li>
        ))}
      </ul>
      <button type="button" onClick={() => resetDraft()}>New template</button>
      <button
        type="button"
        className="ml-2"
        onClick={() => void bridge.restoreBuiltInPrompt(mode).then(setCatalog)}
      >
        Restore built-in
      </button>
      <label className="block text-sm">
        Name
        <input
          aria-label="Template name"
          value={name}
          onChange={(event) => {
            setName(event.target.value)
            setSource("manual-edit")
            setReviewed(undefined)
          }}
          className="mt-1 w-full rounded bg-black p-2"
        />
      </label>
      <label className="block text-sm">
        Manage instructions
        <textarea
          aria-label="Template instructions"
          value={instructions}
          onChange={(event) => {
            setInstructions(event.target.value)
            setSource("manual-edit")
            setReviewed(undefined)
          }}
          className="mt-1 min-h-24 w-full rounded bg-black p-2"
        />
      </label>
      <label className="block text-sm">
        Guided change
        <textarea
          aria-label="Guided template answer"
          value={guidedAnswer}
          onChange={(event) => setGuidedAnswer(event.target.value)}
          className="mt-1 w-full rounded bg-black p-2"
        />
      </label>
      <button type="button" onClick={addGuided}>Add guided change</button>
      <button type="button" className="ml-2" onClick={() => void review()}>Review changes</button>
      {reviewed ? (
        <div aria-label="Semantic template diff" className="space-y-1 text-xs">
          {reviewed.draft.changes.map((change) => (
            <div key={change.field}>
              <strong>{change.field}</strong>
              <pre className="whitespace-pre-wrap" data-content-role="inert-text">{change.before}</pre>
              <pre className="whitespace-pre-wrap" data-content-role="inert-text">{change.after}</pre>
            </div>
          ))}
          <button type="button" onClick={() => void save()}>Save reviewed change</button>
        </div>
      ) : null}
      {base?.kind === "user" ? (
        <div>
          <label className="text-sm">
            Type “{base.name}” to delete
            <input
              aria-label="Delete template confirmation"
              value={deleteConfirmation}
              onChange={(event) => setDeleteConfirmation(event.target.value)}
              className="ml-2 rounded bg-black p-1"
            />
          </label>
          <button
            type="button"
            disabled={deleteConfirmation !== base.name}
            onClick={() => void bridge.deletePromptTemplate(base.id, deleteConfirmation).then((next) => {
              setCatalog(next)
              resetDraft()
            })}
          >
            Delete user template
          </button>
        </div>
      ) : null}
      <p role="status" className="text-xs text-white/60">{status}</p>
    </section>
  )
}

export function InertTemplateContent({ content }: { readonly content: string }) {
  return <pre data-content-role="inert-text" className="whitespace-pre-wrap">{content}</pre>
}
