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
    if "P00-V2-CAP-A03" in source or "verification-controller/v2" in source:
        raise SystemExit("A04 renderer left a legacy capability identity")
    if 'let phaseIDs = Set(["P01"])' not in source:
        raise SystemExit("A04 renderer widened phase admission")
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(source, encoding="utf-8")


if __name__ == "__main__":
    main()
