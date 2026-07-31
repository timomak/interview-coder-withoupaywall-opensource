import { parseCanonicalJson, requireClosedObject, sha256 } from "./protocol"

export interface ExpectedPackageInspection {
  readonly rcSha: string
  readonly releaseStatement: Buffer
  readonly packages: Readonly<Record<string, {
    readonly bytes: Buffer
    readonly signingTeamId: string
    readonly signingCertificateSha256: string
    readonly notarizationTicketId: string
  }>>
}

export function validatePackageInspection(
  bytes: Buffer,
  expected: ExpectedPackageInspection
): readonly Record<string, unknown>[] {
  const receipt = parseCanonicalJson(bytes)
  requireClosedObject(receipt, ["schemaVersion", "kind", "rcSha", "inspections"], "package inspection")
  if (
    receipt.schemaVersion !== 1 || receipt.kind !== "qualification-package-inspection" ||
    receipt.rcSha !== expected.rcSha || !Array.isArray(receipt.inspections)
  ) throw new Error("Package inspection receipt is invalid")
  const architectures = Object.keys(expected.packages).sort()
  if (JSON.stringify(receipt.inspections.map((item) => (item as Record<string, unknown>).architecture)) !== JSON.stringify(architectures)) {
    throw new Error("Package inspection architecture set is invalid")
  }
  const statementSha256 = sha256(expected.releaseStatement)
  for (const inspection of receipt.inspections) {
    requireClosedObject(inspection, [
      "architecture", "appAsarSha256", "packageSha256", "releaseStatementSha256",
      "signingTeamId", "signingCertificateSha256", "notarizationTicketId"
    ], "package inspection entry")
    const item = expected.packages[String(inspection.architecture)]
    if (
      !item || !/^[0-9a-f]{64}$/.test(String(inspection.appAsarSha256)) ||
      inspection.packageSha256 !== sha256(item.bytes) ||
      inspection.releaseStatementSha256 !== statementSha256 ||
      inspection.signingTeamId !== item.signingTeamId ||
      inspection.signingCertificateSha256 !== item.signingCertificateSha256 ||
      inspection.notarizationTicketId !== item.notarizationTicketId
    ) throw new Error("Package inspection identity binding is invalid")
  }
  return receipt.inspections as Record<string, unknown>[]
}
