import { useEffect, useState } from "react"
import type {
  HistoryArchiveV1,
  HistoryCatalog,
  HistoryExportRequest
} from "./types"

export function HistorySettings() {
  const [catalog, setCatalog] = useState<HistoryCatalog>({ entries: [], issues: [] })
  const [query, setQuery] = useState("")
  const [opened, setOpened] = useState<HistoryArchiveV1>()
  const [destination, setDestination] = useState("")
  const [disclosure, setDisclosure] = useState(false)
  const [status, setStatus] = useState("")

  const reload = (search = query) =>
    window.electronAPI.searchHistory(search).then(setCatalog)
  useEffect(() => { void reload("") }, [])

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

  return (
    <section aria-label="History" className="space-y-3">
      <h3 className="text-sm font-medium">History</h3>
      <p className="text-xs text-white/60">Encrypted sessions remain until you explicitly delete them.</p>
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
            <button type="button" onClick={() => void window.electronAPI.deleteHistory({ sessionIds: [entry.sessionId], confirmed: true }).then(() => reload())}>Delete</button>
          </li>
        ))}
      </ul>
      {catalog.entries.length > 0 ? (
        <button type="button" onClick={() => void window.electronAPI.deleteHistory({ sessionIds: catalog.entries.map((entry) => entry.sessionId), confirmed: true }).then(() => reload())}>
          Delete all History
        </button>
      ) : null}
      {opened ? (
        <section aria-label="Archived interview" data-read-only="true">
          <h4>{opened.mode} interview</h4>
          <p>{opened.startedAt} – {opened.sealedAt}</p>
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
