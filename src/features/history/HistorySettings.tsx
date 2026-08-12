import { useEffect, useState } from "react"
import type {
  HistoryArchiveV1,
  HistoryCatalog,
  HistoryExportRequest
} from "./types"

export function HistorySettings({
  onContinued
}: Readonly<{ onContinued?: () => void }> = {}) {
  const [catalog, setCatalog] = useState<HistoryCatalog>({ entries: [], issues: [] })
  const [fullCatalog, setFullCatalog] = useState<HistoryCatalog>({ entries: [], issues: [] })
  const [query, setQuery] = useState("")
  const [opened, setOpened] = useState<HistoryArchiveV1>()
  const [destination, setDestination] = useState("")
  const [disclosure, setDisclosure] = useState(false)
  const [status, setStatus] = useState("")
  const [pendingDeletion, setPendingDeletion] = useState<{
    scope: "selected" | "all"
    sessionIds: readonly string[]
    label: string
  }>()

  const reload = async (search = query) => {
    const [all, visible] = await Promise.all([
      window.electronAPI.listHistory(),
      window.electronAPI.searchHistory(search)
    ])
    setFullCatalog(all)
    setCatalog(visible)
  }
  useEffect(() => { void reload("") }, [])

  const confirmDeletion = async () => {
    if (!pendingDeletion) return
    await window.electronAPI.deleteHistory({
      scope: pendingDeletion.scope,
      sessionIds: pendingDeletion.sessionIds,
      confirmed: true
    })
    if (pendingDeletion.scope === "all" ||
        pendingDeletion.sessionIds.includes(opened?.sessionId ?? "")) setOpened(undefined)
    setPendingDeletion(undefined)
    await reload()
  }

  const exportOne = async (format: HistoryExportRequest["format"]) => {
    if (!opened || !disclosure || !destination.trim()) return
    try {
      await window.electronAPI.exportHistory({
        sessionId: opened.sessionId,
        format,
        destination,
        disclosureAccepted: true,
        overwriteConfirmed: false
      })
      setStatus("Plaintext export created at the explicit destination.")
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Export failed.")
    }
  }

  const continueSession = async () => {
    if (!opened) return
    const result = await window.electronAPI.continueHistory(opened.sessionId)
    if (!result.ok) {
      setStatus(result.error ?? "Could not continue this session.")
      return
    }
    setStatus("Continued in a new live session with the archived conversation attached.")
    onContinued?.()
  }

  return (
    <section aria-label="History" className="space-y-3">
      <h3 className="text-sm font-medium">History</h3>
      <p className="text-xs text-white/60">
        Search encrypted past interviews, inspect them, or continue one in a
        new live session. Continuing keeps the archive unchanged and attaches
        its transcript and answers as initial context. Past interviews remain
        until you explicitly delete them, and stay encrypted in storage.
      </p>
      <label className="block text-sm">Search History
        <input aria-label="Search History" value={query} onChange={(event) => {
          setQuery(event.target.value)
          void reload(event.target.value)
        }} className="w-full rounded bg-black p-2" />
      </label>
      <ul aria-label="Archived interviews">
        {catalog.entries.map((entry) => (
          <li key={entry.sessionId} className="flex gap-2">
            <button type="button" onClick={() => void window.electronAPI.openHistory(entry.sessionId).then(setOpened)}>
              {entry.title}
            </button>
            <button type="button" onClick={() => setPendingDeletion({
              scope: "selected",
              sessionIds: [entry.sessionId],
              label: `Delete “${entry.title}” permanently?`
            })}>Delete</button>
          </li>
        ))}
      </ul>
      {fullCatalog.entries.length > 0 ? (
        <button type="button" onClick={() => setPendingDeletion({
          scope: "all",
          sessionIds: [],
          label: `Delete all ${fullCatalog.entries.length} archived interviews permanently?`
        })}>
          Delete all History
        </button>
      ) : null}
      {pendingDeletion ? (
        <section role="alertdialog" aria-label="Confirm History deletion">
          <p>{pendingDeletion.label}</p>
          <button type="button" onClick={() => void confirmDeletion()}>Confirm permanent deletion</button>
          <button type="button" onClick={() => setPendingDeletion(undefined)}>Cancel</button>
        </section>
      ) : null}
      {opened ? (
        <section aria-label="Archived interview">
          <h4>{opened.mode} interview</h4>
          <p>{opened.startedAt} – {opened.sealedAt}</p>
          <button type="button" onClick={() => void continueSession()}>
            Continue this session
          </button>
          {opened.session.sections.map((section) => <article key={section.id}>{section.body}</article>)}
          <label className="block text-sm">Explicit export destination
            <input value={destination} onChange={(event) => setDestination(event.target.value)} className="w-full rounded bg-black p-2" />
          </label>
          <label className="flex gap-2 text-sm"><input type="checkbox" checked={disclosure} onChange={(event) => setDisclosure(event.target.checked)} />I understand this creates plaintext files.</label>
          <button type="button" disabled={!disclosure || !destination.trim()} onClick={() => void exportOne("markdown")}>Export Markdown</button>
          <button type="button" disabled={!disclosure || !destination.trim()} onClick={() => void exportOne("json")}>Export JSON</button>
        </section>
      ) : null}
      <p role="status">{status}</p>
    </section>
  )
}
