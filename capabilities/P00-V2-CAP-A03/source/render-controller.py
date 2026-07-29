#!/usr/bin/env python3
"""Render the narrow A03 P01 recovery controller from exact A02 source."""

from __future__ import annotations

import hashlib
import pathlib
import sys


BASE_SHA256 = "2552af801e0cc32bbc06a39b84cb4a4773547add314381f49969430cdf34f4a4"


def fail(message: str) -> None:
    raise SystemExit(message)


def replace_once(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        fail(f"{label}: expected exactly one match, found {count}")
    return source.replace(old, new, 1)


def main() -> None:
    if len(sys.argv) != 3:
        fail("usage: render-controller.py A02_CONTROLLER OUTPUT")
    base = pathlib.Path(sys.argv[1])
    output = pathlib.Path(sys.argv[2])
    raw = base.read_bytes()
    actual = hashlib.sha256(raw).hexdigest()
    if actual != BASE_SHA256:
        fail(f"A02 controller hash mismatch: expected {BASE_SHA256}, got {actual}")
    source = raw.decode("utf-8")

    source = source.replace("P00-V2-CAP-A02", "P00-V2-CAP-A03")
    source = replace_once(
        source,
        'let phaseIDs = Set(["P01", "P02", "P03", "P04", "P05", "P06", "P07", "P08", "P09", "P10", "P11", "P12"])\n'
        'let phaseDependencies: [String: [String]] = [\n'
        '    "P01": [], "P02": ["P01"], "P03": ["P01"],\n'
        '    "P04": ["P02", "P03"], "P05": ["P04"],\n'
        '    "P06": ["P05"], "P07": ["P05"], "P08": ["P05"], "P09": ["P05"],\n'
        '    "P10": ["P06", "P07", "P08"],\n'
        '    "P11": ["P06", "P07", "P08", "P09", "P10"], "P12": ["P11"]\n'
        "]",
        'let phaseIDs = Set(["P01"])\n'
        'let phaseDependencies: [String: [String]] = ["P01": []]',
        "P01-only recovery envelope",
    )
    source = replace_once(
        source,
        '"scripts/verification/phase-reporter.mjs": "572b7068aaef665c2b2243d487b3a31019c025a17376ec41338fddd191fb7bb8"',
        '"scripts/verification/phase-reporter.mjs": "c3cd8bc716cf7dffd2bcc40cc10ae50a6457b7b75c482629208d76783874bcd7"',
        "remediated reporter digest",
    )
    source = replace_once(
        source,
        '''        "device": Int(info.st_dev),
        "inode": Int(info.st_ino),
        "extendedAcl": extendedACL,''',
        '''        "device": Int(info.st_dev),
        "inode": Int(info.st_ino),
        "size": Int(info.st_size),
        "flags": Int(info.st_flags),
        "mtimeSeconds": Int(info.st_mtimespec.tv_sec),
        "mtimeNanoseconds": Int(info.st_mtimespec.tv_nsec),
        "ctimeSeconds": Int(info.st_ctimespec.tv_sec),
        "ctimeNanoseconds": Int(info.st_ctimespec.tv_nsec),
        "extendedAcl": extendedACL,''',
        "complete file facts",
    )
    source = replace_once(
        source,
        '''    lhs.st_nlink == rhs.st_nlink &&
    lhs.st_size == rhs.st_size &&
    lhs.st_mtimespec.tv_sec == rhs.st_mtimespec.tv_sec &&''',
        '''    lhs.st_nlink == rhs.st_nlink &&
    lhs.st_size == rhs.st_size &&
    lhs.st_flags == rhs.st_flags &&
    lhs.st_mtimespec.tv_sec == rhs.st_mtimespec.tv_sec &&''',
        "descriptor flags identity",
    )

    evidence_publisher = r'''
func publishRunEvidence(_ runDirectory: String) throws {
    let names = try FileManager.default.contentsOfDirectory(atPath: runDirectory).sorted()
    var published = 0
    for name in names {
        let path = "\(runDirectory)/\(name)"
        var before = stat()
        if lstat(path, &before) != 0 {
            try fail("evidence publication member disappeared: \(path)")
        }
        let kind = before.st_mode & S_IFMT
        if kind == S_IFDIR { continue }
        guard kind == S_IFREG,
              before.st_uid == 0,
              before.st_gid == 0,
              before.st_nlink == 1 else {
            try fail("evidence publication member contract disagreement: \(path)")
        }
        let facts = try fileFacts(path)
        guard facts["extendedAcl"] as? Bool == false else {
            try fail("evidence publication ACL disagreement: \(path)")
        }
        if chmod(path, 0o444) != 0 {
            try fail("evidence publication chmod failed: \(path)")
        }
        var after = stat()
        guard lstat(path, &after) == 0,
              (after.st_mode & S_IFMT) == S_IFREG,
              after.st_uid == 0,
              after.st_gid == 0,
              after.st_nlink == 1,
              (after.st_mode & 0o7777) == 0o444,
              before.st_dev == after.st_dev,
              before.st_ino == after.st_ino,
              before.st_size == after.st_size,
              before.st_flags == after.st_flags else {
            try fail("evidence publication final identity disagreement: \(path)")
        }
        published += 1
    }
    if published == 0 {
        try fail("evidence publication produced no readable members")
    }
}

'''
    source = replace_once(
        source,
        "func verifyPhase(_ arguments: [String]) throws {",
        evidence_publisher + "func verifyPhase(_ arguments: [String]) throws {",
        "evidence publisher",
    )
    source = replace_once(
        source,
        '''        "survivorCount": finalSurvivors.count,
        "completedAt": isoNow()''',
        '''        "survivorCount": finalSurvivors.count,
        "evidenceReadContract": "root-owned-read-only-top-level-P01-v1",
        "evidenceMemberMode": "0444",
        "completedAt": isoNow()''',
        "terminal evidence contract",
    )
    source = replace_once(
        source,
        r'''    print("CONTROLLER phase=\(phase) run_id=\(runId) run_root=\(runDirectory) aggregate_exit=\(aggregateExit) final_reopen=\(finalReopen)")
    if aggregateExit != 0 { exit(1) }''',
        r'''    try publishRunEvidence(runDirectory)
    print("CONTROLLER phase=\(phase) run_id=\(runId) run_root=\(runDirectory) aggregate_exit=\(aggregateExit) final_reopen=\(finalReopen)")
    if aggregateExit != 0 { exit(1) }''',
        "publish before exit",
    )

    if 'let phaseIDs = Set(["P01"])' not in source:
        fail("A03 renderer did not narrow phase admission")
    if "P00-V2-CAP-A02" in source:
        fail("A03 renderer left an A02 controller identity")
    if "root-owned-read-only-top-level-P01-v1" not in source:
        fail("A03 renderer omitted evidence read contract")
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(source, encoding="utf-8")


if __name__ == "__main__":
    main()
