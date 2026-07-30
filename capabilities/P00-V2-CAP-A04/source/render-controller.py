#!/usr/bin/env python3
"""Render A04 from the exact, already-reviewed A03 P01 controller source."""

from __future__ import annotations

import hashlib
import pathlib
import sys


BASE_SHA256 = "55e5ad28c31de53beb0389646be07e1bd7547c4539bbbd094a62f88120550903"


def replace_once(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    return source.replace(old, new, 1)


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: render-controller.py A03_CONTROLLER OUTPUT")
    base = pathlib.Path(sys.argv[1])
    output = pathlib.Path(sys.argv[2])
    raw = base.read_bytes()
    actual = hashlib.sha256(raw).hexdigest()
    if actual != BASE_SHA256:
        raise SystemExit(
            f"A03 controller hash mismatch: expected {BASE_SHA256}, got {actual}"
        )
    source = raw.decode("utf-8")
    source = replace_once(
        source,
        'let installRoot = "/Users/Shared/InterviewCopilot/verification-controller/v2"',
        'let installRoot = "/Users/Shared/InterviewCopilot/verification-controller-a04/payload"',
        "install root",
    )
    source = replace_once(
        source,
        'let controllerRoot = "/Users/Shared/InterviewCopilot/verification-controller"',
        'let controllerRoot = "/Users/Shared/InterviewCopilot/verification-controller-a04"',
        "controller root",
    )
    source = source.replace("P00-V2-CAP-A03", "P00-V2-CAP-A04")
    admission = r'''
func installedAdmission() throws -> [String: Any] {
    let receiptRoot = "/Users/Shared/InterviewCopilot/verification-controller-a04-receipts"
    let receiptPath = "\(receiptRoot)/P00-V2-CAP-A04-activation.json"
    let journalPath = "\(receiptRoot)/P00-V2-CAP-A04-activation.in-progress"
    if FileManager.default.fileExists(atPath: journalPath) {
        try fail("A04 activation remains in progress")
    }
    let receiptData = try Data(contentsOf: URL(fileURLWithPath: receiptPath))
    guard let receipt = try parseJSON(receiptData) as? [String: Any],
          Set(receipt.keys) == Set([
            "schemaVersion", "artifactId", "envelopeSha256", "status",
            "exitCode", "checkpoint", "candidateRevision",
            "installedControllerSha256", "installedStateSha256",
            "authorizationPresent", "namespacePresent",
            "legacyA02ControllerSha256", "legacyRecovery03ReceiptSha256"
          ]),
          receipt["schemaVersion"] as? Int == 1,
          receipt["artifactId"] as? String == "P00-V2-CAP-A04",
          receipt["status"] as? String == "SUCCESS",
          receipt["checkpoint"] as? String == "installed",
          receipt["candidateRevision"] as? String ==
            "2e5045116db6e3c5f6e6cc18b70df6d7fa021baf",
          receipt["authorizationPresent"] as? Bool == true,
          receipt["namespacePresent"] as? Bool == true,
          let envelopeSHA = receipt["envelopeSha256"] as? String,
          let controllerSHA = receipt["installedControllerSha256"] as? String,
          controllerSHA == (try sha256File(CommandLine.arguments[0])) else {
        try fail("A04 activation receipt bootstrap disagreement")
    }
    let envelopePath = "\(metadataRoot)/release-envelope.json"
    guard try sha256File(envelopePath) == envelopeSHA,
          let envelope = try parseJSON(
            Data(contentsOf: URL(fileURLWithPath: envelopePath))
          ) as? [String: Any],
          envelope["artifactId"] as? String == "P00-V2-CAP-A04",
          let members = envelope["members"] as? [String: Any],
          let controllerMember = members["controllerBinary"] as? [String: Any],
          controllerMember["sha256"] as? String == controllerSHA,
          let manifestMember = members["expectedInstallManifest"] as? [String: Any],
          let manifestSHA = manifestMember["sha256"] as? String else {
        try fail("A04 release envelope bootstrap disagreement")
    }
    let manifestPath = "\(metadataRoot)/expected-install-manifest.json"
    guard try sha256File(manifestPath) == manifestSHA,
          let manifest = try parseJSON(
            Data(contentsOf: URL(fileURLWithPath: manifestPath))
          ) as? [String: Any],
          let manifestMembers = manifest["members"] as? [[String: Any]],
          let admissionMember = manifestMembers.first(where: {
              $0["path"] as? String == "libexec/admission.py"
          }),
          let admissionSHA = admissionMember["sha256"] as? String else {
        try fail("A04 payload manifest bootstrap disagreement")
    }
    let admissionPath = "\(installRoot)/libexec/admission.py"
    guard try sha256File(admissionPath) == admissionSHA else {
        try fail("A04 installed admission verifier disagreement")
    }
    let result = try runCommand(
        "/usr/bin/python3",
        [
            admissionPath, "verify-success",
            "--controller-root", controllerRoot,
            "--receipt-root", receiptRoot,
            "--sudoers", "/etc/sudoers.d/interviewcopilot-verification-controller-a04",
            "--envelope", envelopeSHA,
            "--controller-sha", controllerSHA,
            "--root-owner", "0", "--root-group", "0",
            "--request-owner", "501", "--request-group", "20"
        ]
    )
    if result.exit != 0 {
        try fail("A04 closed installed-state admission failed")
    }
    return [
        "schemaVersion": 1,
        "receiptSha256": try sha256File(receiptPath),
        "envelopeSha256": envelopeSHA,
        "installedStateSha256": receipt["installedStateSha256"] as Any
    ]
}

'''
    source = replace_once(
        source,
        "func installedPreflight() throws -> [String: Any] {",
        admission + "func installedPreflight() throws -> [String: Any] {",
        "installed admission bootstrap",
    )
    source = replace_once(
        source,
        '''    return [
        "schemaVersion": 1,
        "controllerVersion": "P00-V2-CAP-A04",
        "checkedAt": isoNow(),
        "nodeVersion": nodeVersion,
        "npmVersion": npmVersion,
        "paths": facts
    ]''',
        '''    let admission = try installedAdmission()
    return [
        "schemaVersion": 1,
        "controllerVersion": "P00-V2-CAP-A04",
        "checkedAt": isoNow(),
        "nodeVersion": nodeVersion,
        "npmVersion": npmVersion,
        "paths": facts,
        "installedAdmission": admission
    ]''',
        "installed preflight admission",
    )
    if "P00-V2-CAP-A03" in source or "verification-controller/v2" in source:
        raise SystemExit("A04 renderer left a legacy capability identity")
    if 'let phaseIDs = Set(["P01"])' not in source:
        raise SystemExit("A04 renderer widened phase admission")
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(source, encoding="utf-8")


if __name__ == "__main__":
    main()
