#!/usr/bin/env python3
"""Durable closed recovery state journal."""

from __future__ import annotations

import argparse
import json
import os
import pathlib
import secrets
import tempfile


ARTIFACT_ID = "P00-V2-CAP-A03-RECOVERY-03"
CANDIDATE = "2e5045116db6e3c5f6e6cc18b70df6d7fa021baf"
STATES = {
    "STARTED",
    "RELOCATION_PREPARED",
    "RELOCATION_MOVED",
    "RUNS_AUDITED",
    "ROLLBACK_SNAPSHOTTING",
    "ROLLBACK_SNAPSHOTTED",
    "AUTHORIZATION_PUBLISHING",
    "AUTHORIZATION_PUBLISHED",
    "CHILD_STARTING",
    "CHILD_RUNNING",
    "CHILD_COMMITTED",
    "RECEIPT_COMMITTED",
    "RECONCILING",
}


def canonical(value: object) -> bytes:
    return (
        json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
        + "\n"
    ).encode()


def atomic_write(path: pathlib.Path, document: object) -> None:
    path.parent.mkdir(parents=True, mode=0o700, exist_ok=True)
    path.parent.chmod(0o700)
    descriptor, temporary_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    temporary = pathlib.Path(temporary_name)
    try:
        with os.fdopen(descriptor, "wb") as handle:
            handle.write(canonical(document))
            handle.flush()
            os.fsync(handle.fileno())
        temporary.chmod(0o400)
        os.rename(temporary, path)
        parent_descriptor = os.open(path.parent, os.O_RDONLY)
        try:
            os.fsync(parent_descriptor)
        finally:
            os.close(parent_descriptor)
    finally:
        temporary.unlink(missing_ok=True)


def base_document(envelope: str, state: str, attempt_token: str) -> dict[str, object]:
    return {
        "schemaVersion": 1,
        "artifactId": ARTIFACT_ID,
        "candidateRevision": CANDIDATE,
        "envelopeSha256": envelope,
        "state": state,
        "childPid": None,
        "attemptToken": attempt_token,
    }


def load(path: pathlib.Path, envelope: str) -> dict[str, object]:
    document = json.loads(path.read_text())
    if (
        set(document)
        != {
            "schemaVersion",
            "artifactId",
            "candidateRevision",
            "envelopeSha256",
            "state",
            "childPid",
            "attemptToken",
        }
        or document["schemaVersion"] != 1
        or document["artifactId"] != ARTIFACT_ID
        or document["candidateRevision"] != CANDIDATE
        or document["envelopeSha256"] != envelope
        or document["state"] not in STATES
        or (
            not isinstance(document["attemptToken"], str)
            or len(document["attemptToken"]) != 64
            or any(character not in "0123456789abcdef" for character in document["attemptToken"])
        )
        or (
            document["childPid"] is not None
            and (
                not isinstance(document["childPid"], int)
                or document["childPid"] <= 1
            )
        )
    ):
        raise SystemExit("recovery journal identity disagreement")
    return document


def main() -> None:
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="command", required=True)
    for command in ("init", "set", "verify", "state", "child-pid", "token", "rotate"):
        operation = subparsers.add_parser(command)
        operation.add_argument("path", type=pathlib.Path)
        operation.add_argument("envelope")
        if command in {"init", "set"}:
            operation.add_argument("state", choices=sorted(STATES))
        if command == "set":
            operation.add_argument("--child-pid", type=int)
            operation.add_argument("--attempt-token", required=True)
    arguments = parser.parse_args()
    path = arguments.path.resolve()
    if arguments.command == "init":
        if path.exists():
            raise SystemExit("recovery journal already exists")
        attempt_token = secrets.token_hex(32)
        atomic_write(
            path,
            base_document(arguments.envelope, arguments.state, attempt_token),
        )
        print(attempt_token)
    elif arguments.command == "set":
        document = load(path, arguments.envelope)
        if document["attemptToken"] != arguments.attempt_token:
            raise SystemExit("recovery journal attempt token disagreement")
        document["state"] = arguments.state
        document["childPid"] = arguments.child_pid
        atomic_write(path, document)
    elif arguments.command == "rotate":
        document = load(path, arguments.envelope)
        document["attemptToken"] = secrets.token_hex(32)
        document["state"] = "RECONCILING"
        document["childPid"] = None
        atomic_write(path, document)
        print(document["attemptToken"])
    elif arguments.command == "verify":
        load(path, arguments.envelope)
    else:
        document = load(path, arguments.envelope)
        if arguments.command == "state":
            print(document["state"])
        elif arguments.command == "token":
            print(document["attemptToken"])
        elif document["childPid"] is not None:
            print(document["childPid"])


if __name__ == "__main__":
    main()
