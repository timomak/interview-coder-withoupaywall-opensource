#!/usr/bin/env python3
"""Write one closed, canonical request into the fixed UID-501 request slot."""

from __future__ import annotations

import argparse
import json
import os
import pathlib
import re
import secrets
import stat
import tempfile

PACKET = "02ee6ddec78d6e4ea9e2de3c0303ffd6bc9f45bf"
PHASES = {f"P{number:02d}" for number in range(1, 13)}
LIVE_ROOT = pathlib.Path(
    "/Users/Shared/InterviewCopilot/verification-controller/requests/501"
)


def canonical(value: object) -> bytes:
    return (
        json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
        + "\n"
    ).encode()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("operation", choices=["arm", "verify"])
    parser.add_argument("phase", choices=sorted(PHASES))
    parser.add_argument("--pr", type=int)
    parser.add_argument("--expected-head")
    parser.add_argument("--test-request-root", type=pathlib.Path)
    args = parser.parse_args()
    if os.geteuid() != 501 and args.test_request_root is None:
        raise SystemExit("live request writer requires UID 501")
    if args.operation == "arm":
        if (
            args.pr is None
            or args.pr <= 0
            or args.expected_head is None
            or re.fullmatch(r"[a-f0-9]{40}", args.expected_head) is None
        ):
            raise SystemExit("arm requires positive --pr and exact 40-hex --expected-head")
    elif args.pr is not None or args.expected_head is not None:
        raise SystemExit("verify accepts no PR or head fields")

    root = (args.test_request_root or LIVE_ROOT).resolve()
    info = root.lstat()
    expected_uid = os.geteuid()
    if (
        not stat.S_ISDIR(info.st_mode)
        or info.st_uid != expected_uid
        or stat.S_IMODE(info.st_mode) != 0o700
    ):
        raise SystemExit("request root ownership or mode disagreement")
    document: dict[str, object] = {
        "approvedPacketSha": PACKET,
        "nonce": secrets.token_hex(16),
        "operation": args.operation,
        "phase": args.phase,
        "projectKey": "InterviewCopilot",
        "role": "local",
        "schemaVersion": 1,
    }
    if args.operation == "arm":
        document["expectedHead"] = args.expected_head
        document["prNumber"] = args.pr

    descriptor, temporary = tempfile.mkstemp(
        prefix=f".{args.operation}.", dir=root
    )
    try:
        os.fchmod(descriptor, 0o400)
        with os.fdopen(descriptor, "wb", closefd=True) as handle:
            handle.write(canonical(document))
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, root / f"{args.operation}.json")
        directory = os.open(root, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    except BaseException:
        try:
            os.unlink(temporary)
        except FileNotFoundError:
            pass
        raise
    print(root / f"{args.operation}.json")


if __name__ == "__main__":
    main()
