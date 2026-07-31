import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { expect, it, vi } from "vitest"
import { HistorySettings } from "./HistorySettings"
import { projectHistoryArchive } from "./model"
import { historyFixture } from "../../../electron/history/testSupport"

it("exposes exact Settings-only controls and retention", async () => {
  const archive = projectHistoryArchive(historyFixture())
  const summary = {
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
  const searchHistory = vi.fn().mockResolvedValue({ entries: [summary], issues: [] })
  const deleteHistory = vi.fn().mockResolvedValue({ entries: [], issues: [] })
  Object.assign(window, {
    electronAPI: {
      searchHistory,
      openHistory: vi.fn().mockResolvedValue(archive),
      deleteHistory,
      exportHistory: vi.fn()
    }
  })
  render(<HistorySettings />)
  expect(await screen.findByText("Design a service")).toBeVisible()
  expect(screen.getByText(/remain until you explicitly delete/i)).toBeVisible()
  fireEvent.change(screen.getByLabelText("Search History"), { target: { value: "service" } })
  await waitFor(() => expect(searchHistory).toHaveBeenLastCalledWith("service"))
  fireEvent.click(screen.getByText("Design a service"))
  expect(await screen.findByRole("region", { name: "Archived interview" })).toHaveAttribute("data-read-only", "true")
  expect(screen.getByRole("button", { name: "Delete all History" })).toBeVisible()
  expect(document.body.textContent).not.toMatch(/tag|favorite|bulk export|cloud/i)
})
