import { resolveEvidenceAuthority } from "./evidence"
import type { EvidenceArtifact } from "../../src/shared/interview"

const artifact = (
  id: string,
  kind: EvidenceArtifact["kind"]
): EvidenceArtifact => ({
  id,
  kind,
  finalizedAt: "now",
  content: id,
  selected: false,
  submitted: true
})

describe("evidence authority", () => {
  it("applies screenshot authority rule", () => {
    expect(
      resolveEvidenceAuthority([artifact("transcript", "transcript")]).authority
    ).toBe("transcript")
    expect(
      resolveEvidenceAuthority([
        artifact("transcript", "transcript"),
        artifact("screenshot", "screenshot")
      ])
    ).toEqual({
      authority: "screenshot",
      artifacts: [artifact("screenshot", "screenshot")]
    })
  })
})
