import { describe, expect, it } from "vitest"
import {
  activateOpportunity,
  saveOpportunity,
  snapshotOpportunity
} from "./opportunities"
import type { ProfileBundle } from "./types"

describe("opportunity snapshots", () => {
  it("isolates named opportunities across sessions", () => {
    let bundle: ProfileBundle = { schemaVersion: 1, opportunities: [] }
    bundle = saveOpportunity(bundle, {
      id: "alpha",
      name: "Alpha",
      revision: 1,
      markdown: "Distributed systems role",
      provenance: "manual-edit"
    })
    bundle = saveOpportunity(bundle, {
      id: "beta",
      name: "Beta",
      revision: 1,
      markdown: "Frontend role",
      provenance: "manual-edit"
    })
    bundle = activateOpportunity(bundle, "alpha")
    const activeSnapshot = snapshotOpportunity(bundle)
    bundle = saveOpportunity(bundle, {
      ...bundle.opportunities[0],
      revision: 2,
      markdown: "Edited after Start"
    })
    expect(bundle.activeOpportunityId).toBe("alpha")
    expect(activeSnapshot?.markdown).toBe("Distributed systems role")
    expect(snapshotOpportunity(bundle)?.markdown).toBe("Edited after Start")
  })
})
