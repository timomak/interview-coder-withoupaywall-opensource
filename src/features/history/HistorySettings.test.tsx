import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { expect, it, vi } from "vitest"
import { HistorySettings } from "./HistorySettings"
import { projectHistoryArchive } from "./model"
import { historyFixture } from "../../../electron/history/testSupport"

it("exposes exact Settings-only controls and retention", async () => {
  const archive = projectHistoryArchive(historyFixture())
  const first = {
    schemaVersion: 1 as const,
    migration: "M-09" as const,
    recordType: "summary" as const,
    sessionId: archive.sessionId,
    startedAt: archive.startedAt,
    sealedAt: archive.sealedAt,
    mode: archive.mode,
    provider: archive.provider,
    model: archive.model,
    title: "Design a service",
    searchText: "design service"
  }
  const second = { ...first, sessionId: "second", title: "Behavioral story" }
  const all = { entries: [first, second], issues: [] }
  const listHistory = vi.fn().mockResolvedValue(all)
  const searchHistory = vi.fn().mockImplementation((query: string) =>
    Promise.resolve({ entries: query ? [first] : [first, second], issues: [] })
  )
  const deleteHistory = vi.fn().mockResolvedValue({ entries: [], issues: [] })
  Object.assign(window, {
    electronAPI: {
      listHistory,
      searchHistory,
      openHistory: vi.fn().mockResolvedValue(archive),
      deleteHistory,
      exportHistory: vi.fn()
    }
  })
  render(<HistorySettings />)
  expect(await screen.findByText("Design a service")).toBeVisible()
  expect(screen.getByText(/remain until you explicitly delete/i)).toBeVisible()
  fireEvent.click(screen.getByText("Design a service"))
  expect(await screen.findByRole("region", { name: "Archived interview" }))
    .toHaveAttribute("data-read-only", "true")

  fireEvent.click(screen.getAllByRole("button", { name: "Delete" })[0])
  expect(deleteHistory).not.toHaveBeenCalled()
  expect(screen.getByRole("alertdialog", { name: "Confirm History deletion" }))
    .toHaveTextContent("Design a service")
  fireEvent.click(screen.getByRole("button", { name: "Confirm permanent deletion" }))
  await waitFor(() => expect(deleteHistory).toHaveBeenCalledWith({
    scope: "selected",
    sessionIds: [archive.sessionId],
    confirmed: true
  }))

  deleteHistory.mockClear()
  fireEvent.change(screen.getByLabelText("Search History"), { target: { value: "service" } })
  await waitFor(() => expect(searchHistory).toHaveBeenLastCalledWith("service"))
  expect(screen.queryByText("Behavioral story")).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "Delete all History" }))
  expect(deleteHistory).not.toHaveBeenCalled()
  expect(screen.getByRole("alertdialog", { name: "Confirm History deletion" }))
    .toHaveTextContent("Delete all 2 archived interviews")
  fireEvent.click(screen.getByRole("button", { name: "Confirm permanent deletion" }))
  await waitFor(() => expect(deleteHistory).toHaveBeenCalledWith({
    scope: "all",
    sessionIds: [],
    confirmed: true
  }))
  expect(document.body.textContent).not.toMatch(/tag|favorite|bulk export|cloud/i)
})
