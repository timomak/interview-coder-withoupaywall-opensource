import { useEffect, useState } from "react"
import {
  createDossierDraft,
  reviewDossier
} from "./markdown"
import {
  activateOpportunity,
  saveOpportunity
} from "./opportunities"
import type { ProfileBundle } from "./types"

const EMPTY_DOSSIER = `# Candidate
## Summary

## Skills

## Experience

## Stories
`

export function ProfileSettings() {
  const [bundle, setBundle] = useState<ProfileBundle>({
    schemaVersion: 1,
    opportunities: []
  })
  const [markdown, setMarkdown] = useState(EMPTY_DOSSIER)
  const [guidedAnswer, setGuidedAnswer] = useState("")
  const [opportunityName, setOpportunityName] = useState("")
  const [opportunityMarkdown, setOpportunityMarkdown] = useState("")
  const [exportPath, setExportPath] = useState("")
  const [status, setStatus] = useState("")
  const [nextProvenance, setNextProvenance] = useState<
    "resume-import" | "guided-chat" | "manual-edit"
  >("resume-import")

  useEffect(() => {
    void window.electronAPI.getProfileBundle().then((value) => {
      setBundle(value)
      if (value.dossier) setMarkdown(value.dossier.markdown)
    })
  }, [])

  const persistDossier = async (review: boolean) => {
    try {
      const draft = createDossierDraft(
        markdown,
        nextProvenance,
        bundle.dossier
      )
      const next = {
        ...bundle,
        dossier: review ? reviewDossier(draft) : draft
      }
      await window.electronAPI.saveProfileBundle(next)
      setBundle(next)
      setNextProvenance("manual-edit")
      setStatus(review ? "Reviewed dossier saved." : "Reviewable draft saved.")
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Profile save failed.")
    }
  }

  const addGuidedAnswer = () => {
    const answer = guidedAnswer.trim()
    if (!answer) return
    setMarkdown((value) => `${value.trim()}\n- ${answer}\n`)
    setNextProvenance("guided-chat")
    setGuidedAnswer("")
    setStatus("Guided answer added to the review draft.")
  }

  const addOpportunity = async () => {
    const name = opportunityName.trim()
    if (!name || !opportunityMarkdown.trim()) return
    const id = name.normalize("NFC").toLowerCase().replace(/[^a-z0-9]+/g, "-")
    const saved = saveOpportunity(bundle, {
      id,
      name,
      revision:
        (bundle.opportunities.find((candidate) => candidate.id === id)
          ?.revision ?? 0) + 1,
      markdown: opportunityMarkdown,
      provenance: "manual-edit"
    })
    const next = activateOpportunity(saved, id)
    await window.electronAPI.saveProfileBundle(next)
    setBundle(next)
    setOpportunityName("")
    setOpportunityMarkdown("")
    setStatus("Opportunity saved and selected for the next interview.")
  }

  return (
    <section className="space-y-3" aria-label="Candidate context">
      <h3 className="text-sm font-medium">Candidate dossier</h3>
      <textarea
        aria-label="Candidate Markdown"
        value={markdown}
        onChange={(event) => {
          setMarkdown(event.target.value)
          setNextProvenance(
            bundle.dossier ? "manual-edit" : "resume-import"
          )
        }}
        className="min-h-36 w-full rounded bg-black p-2"
      />
      <div className="flex gap-2">
        <button type="button" onClick={() => void persistDossier(false)}>
          Save review draft
        </button>
        <button type="button" onClick={() => void persistDossier(true)}>
          Review and use
        </button>
      </div>
      <label className="block text-sm">
        Guided profile answer
        <textarea
          value={guidedAnswer}
          onChange={(event) => setGuidedAnswer(event.target.value)}
          className="mt-1 w-full rounded bg-black p-2"
        />
      </label>
      <button type="button" onClick={addGuidedAnswer}>Add to Stories</button>
      <h3 className="text-sm font-medium">Opportunity</h3>
      <input
        aria-label="Opportunity name"
        value={opportunityName}
        onChange={(event) => setOpportunityName(event.target.value)}
        className="w-full rounded bg-black p-2"
      />
      <textarea
        aria-label="Opportunity Markdown"
        value={opportunityMarkdown}
        onChange={(event) => setOpportunityMarkdown(event.target.value)}
        className="w-full rounded bg-black p-2"
      />
      <button type="button" onClick={() => void addOpportunity()}>
        Save and select opportunity
      </button>
      <label className="flex gap-2 text-sm">
        <input
          type="checkbox"
          checked={bundle.syntheticEnabled ?? false}
          onChange={(event) => {
            const next = {
              ...bundle,
              syntheticEnabled: event.target.checked
            }
            setBundle(next)
            void window.electronAPI.saveProfileBundle(next)
            setStatus(
              event.target.checked
                ? "Synthetic drafts enabled and will be visibly labeled."
                : "Synthetic drafts disabled."
            )
          }}
        />
        Allow visibly labeled synthetic drafts
      </label>
      {bundle.opportunities.length > 0 ? (
        <label className="block text-sm">
          Active opportunity
          <select
            value={bundle.activeOpportunityId ?? ""}
            onChange={(event) => {
              const next = activateOpportunity(bundle, event.target.value)
              setBundle(next)
              void window.electronAPI.saveProfileBundle(next)
            }}
            className="w-full rounded bg-black p-2"
          >
            {bundle.opportunities.map((opportunity) => (
              <option key={opportunity.id} value={opportunity.id}>
                {opportunity.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label className="block text-sm">
        Explicit Markdown export path
        <input
          value={exportPath}
          onChange={(event) => setExportPath(event.target.value)}
          className="w-full rounded bg-black p-2"
        />
      </label>
      <button
        type="button"
        disabled={!exportPath.trim()}
        onClick={() =>
          void window.electronAPI
            .exportDossier(exportPath)
            .then(() => setStatus("Dossier exported."))
            .catch((error: unknown) =>
              setStatus(error instanceof Error ? error.message : "Export failed.")
            )
        }
      >
        Export Markdown
      </button>
      <p role="status">{status}</p>
    </section>
  )
}
