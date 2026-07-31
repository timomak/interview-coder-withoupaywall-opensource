import type {
  HistoryCatalog,
  HistoryDeleteRequest,
  HistoryExportReceipt,
  HistoryExportRequest
} from "../../src/features/history/types"
import type { HistoryDeletionJournal } from "./deletionJournal"
import type { HistoryExportService } from "./exportService"
import type { HistoryRepository } from "./HistoryRepository"

export class HistoryService {
  constructor(
    private readonly repository: HistoryRepository,
    private readonly deletions: HistoryDeletionJournal,
    private readonly exports: HistoryExportService
  ) {}

  async recover(): Promise<void> {
    await this.exports.recover()
    await this.deletions.resume()
  }

  list(): Promise<HistoryCatalog> {
    return this.repository.rebuild()
  }

  search(query: string): Promise<HistoryCatalog> {
    return this.repository.search(query)
  }

  open(sessionId: string) {
    return this.repository.open(sessionId)
  }

  async delete(request: HistoryDeleteRequest): Promise<HistoryCatalog> {
    if (request.confirmed !== true) throw new Error("History deletion is not confirmed")
    const catalog = await this.repository.rebuild()
    const available = new Set(catalog.entries.map((entry) => entry.sessionId))
    const targets = request.scope === "all" ? [...available] : request.sessionIds
    if ((request.scope !== "all" && request.scope !== "selected") ||
        (request.scope === "all" && request.sessionIds.length !== 0) ||
        (request.scope === "selected" && targets.length === 0) ||
        new Set(targets).size !== targets.length ||
        targets.some((id) => !available.has(id))) {
      throw new Error("History deletion targets are invalid")
    }
    await this.deletions.delete(targets)
    return this.repository.rebuild()
  }

  async export(request: HistoryExportRequest): Promise<HistoryExportReceipt> {
    return this.exports.export(await this.repository.open(request.sessionId), request)
  }
}
