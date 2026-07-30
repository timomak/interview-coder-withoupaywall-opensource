#!/usr/bin/env python3
"""Write or verify one sanitized immutable recovery outcome receipt."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import pathlib
import signal
import tempfile


def sha256(path: pathlib.Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def canonical(value: object) -> bytes:
    return (
        json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
        + "\n"
    ).encode()


def hard_crash_parent(point: str) -> None:
    if (
        os.environ.get("P00_V2_TEST_ROOT")
        and os.geteuid() != 0
        and os.environ.get("P00_V2_RECOVERY_TEST_HARD_CRASH_POINT") == point
    ):
        os.kill(os.getppid(), signal.SIGKILL)
        os._exit(137)


def write(arguments: argparse.Namespace) -> None:
    if (
        os.environ.get("P00_V2_TEST_ROOT")
        and os.environ.get("P00_V2_RECOVERY_TEST_RECEIPT_FAILURE") == "1"
    ):
        raise SystemExit("injected durable receipt failure")
    arguments.root.mkdir(parents=True, mode=0o755, exist_ok=True)
    arguments.root.chmod(0o755)
    target = arguments.root / f"{arguments.artifact}.json"
    if target.exists():
        raise SystemExit("recovery receipt already exists")
    controller = arguments.install_root / "libexec/verify-phase-core"
    document = {
        "schemaVersion": 1,
        "artifactId": arguments.artifact,
        "envelopeSha256": arguments.envelope,
        "status": arguments.status,
        "exitCode": arguments.exit_code,
        "checkpoint": arguments.checkpoint,
        "relocation": arguments.relocation,
        "candidateRevision": arguments.candidate,
        "installedControllerSha256": sha256(controller)
        if controller.is_file()
        else None,
        "authorizationPresent": arguments.sudoers.exists(),
        "stagePresentAtReceipt": arguments.stage.exists(),
    }
    descriptor, temporary_name = tempfile.mkstemp(
        prefix=f".{arguments.artifact}.", dir=arguments.root
    )
    temporary = pathlib.Path(temporary_name)
    try:
        with os.fdopen(descriptor, "wb") as handle:
            handle.write(canonical(document))
            handle.flush()
            os.fsync(handle.fileno())
        temporary.chmod(0o444)
        hard_crash_parent("before-receipt-rename")
        os.rename(temporary, target)
        parent_descriptor = os.open(arguments.root, os.O_RDONLY)
        try:
            os.fsync(parent_descriptor)
        finally:
            os.close(parent_descriptor)
        hard_crash_parent("after-receipt-rename")
    finally:
        temporary.unlink(missing_ok=True)


def verify(arguments: argparse.Namespace) -> None:
    document = json.loads(arguments.path.read_text())
    if (
        set(document)
        != {
            "schemaVersion",
            "artifactId",
            "envelopeSha256",
            "status",
            "exitCode",
            "checkpoint",
            "relocation",
            "candidateRevision",
            "installedControllerSha256",
            "authorizationPresent",
            "stagePresentAtReceipt",
        }
        or document["schemaVersion"] != 1
        or document["artifactId"] != arguments.artifact
        or document["envelopeSha256"] != arguments.envelope
        or document["status"] != arguments.status
        or document["candidateRevision"] != arguments.candidate
    ):
        raise SystemExit("recovery receipt identity disagreement")


def main() -> None:
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="command", required=True)
    writer = subparsers.add_parser("write")
    writer.add_argument("--root", required=True, type=pathlib.Path)
    writer.add_argument("--artifact", required=True)
    writer.add_argument("--envelope", required=True)
    writer.add_argument("--status", required=True, choices=("SUCCESS", "FAILURE"))
    writer.add_argument("--exit-code", required=True, type=int)
    writer.add_argument("--checkpoint", required=True)
    writer.add_argument("--relocation", required=True)
    writer.add_argument("--candidate", required=True)
    writer.add_argument("--install-root", required=True, type=pathlib.Path)
    writer.add_argument("--sudoers", required=True, type=pathlib.Path)
    writer.add_argument("--stage", required=True, type=pathlib.Path)
    verifier = subparsers.add_parser("verify")
    verifier.add_argument("path", type=pathlib.Path)
    verifier.add_argument("--artifact", required=True)
    verifier.add_argument("--envelope", required=True)
    verifier.add_argument("--status", required=True, choices=("SUCCESS", "FAILURE"))
    verifier.add_argument("--candidate", required=True)
    arguments = parser.parse_args()
    if arguments.command == "write":
        write(arguments)
    else:
        verify(arguments)


if __name__ == "__main__":
    main()
