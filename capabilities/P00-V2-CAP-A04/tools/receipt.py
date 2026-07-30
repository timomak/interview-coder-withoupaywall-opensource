#!/usr/bin/env python3
"""Publish and verify the terminal A04 activation receipt."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import pathlib
import stat
import subprocess
import sys

ARTIFACT = "P00-V2-CAP-A04"
CANDIDATE = "2e5045116db6e3c5f6e6cc18b70df6d7fa021baf"
LEGACY_A02 = "73eda1532baa3044cf4feb989d2ec58d15304c86c31a298ed3d73a1a75c7494d"
LEGACY_R03 = "5da6d108e0fde1583bc09ecef806d591847c2c26c69bef461c5813390d36f5b8"
FIELDS = {
    "schemaVersion", "artifactId", "envelopeSha256", "status", "exitCode",
    "checkpoint", "candidateRevision", "installedControllerSha256",
    "authorizationPresent", "namespacePresent", "legacyA02ControllerSha256",
    "legacyRecovery03ReceiptSha256",
}


def canonical(value: object) -> bytes:
    return (json.dumps(value, sort_keys=True, separators=(",", ":")) + "\n").encode()


def acl_free(path: pathlib.Path) -> bool:
    result = subprocess.run(
        ["/bin/ls", "-lde", str(path)], text=True, capture_output=True, check=True
    )
    lines = result.stdout.splitlines()
    return bool(lines) and "+" not in lines[0].split(maxsplit=1)[0] and len(lines) == 1


def xattr_free(path: pathlib.Path, allow_provenance: bool) -> bool:
    result = subprocess.run(
        ["/usr/bin/xattr", str(path)], text=True, capture_output=True, check=False
    )
    if result.returncode != 0:
        return False
    names = set(result.stdout.splitlines())
    allowed = {"com.apple.provenance"} if allow_provenance else set()
    return names.issubset(allowed)


def validate_document(document: dict[str, object], envelope: str) -> None:
    if set(document) != FIELDS:
        raise SystemExit("activation receipt schema is not closed")
    expected = {
        "schemaVersion": 1,
        "artifactId": ARTIFACT,
        "envelopeSha256": envelope,
        "candidateRevision": CANDIDATE,
        "legacyA02ControllerSha256": LEGACY_A02,
        "legacyRecovery03ReceiptSha256": LEGACY_R03,
    }
    for key, value in expected.items():
        if document.get(key) != value:
            raise SystemExit(f"activation receipt identity disagreement: {key}")
    if document["status"] not in {"SUCCESS", "FAILURE"}:
        raise SystemExit("activation receipt status disagreement")
    if not isinstance(document["exitCode"], int) or document["exitCode"] < 0:
        raise SystemExit("activation receipt exit code disagreement")
    if not isinstance(document["checkpoint"], str) or not document["checkpoint"]:
        raise SystemExit("activation receipt checkpoint disagreement")
    if document["status"] == "SUCCESS":
        if document["exitCode"] != 0 or not document["authorizationPresent"] or not document["namespacePresent"]:
            raise SystemExit("SUCCESS receipt state disagreement")
    else:
        if document["authorizationPresent"] or document["namespacePresent"]:
            raise SystemExit("FAILURE receipt rollback disagreement")


def verify(
    path: pathlib.Path, envelope: str, owner: int, allow_provenance: bool
) -> dict[str, object]:
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != owner or info.st_nlink != 1:
        raise SystemExit("activation receipt filesystem identity disagreement")
    if (
        stat.S_IMODE(info.st_mode) != 0o444
        or not acl_free(path)
        or not xattr_free(path, allow_provenance)
    ):
        raise SystemExit("activation receipt permissions disagreement")
    raw = path.read_bytes()
    document = json.loads(raw)
    validate_document(document, envelope)
    if raw != canonical(document):
        raise SystemExit("activation receipt bytes are not canonical")
    return document


def publish(
    path: pathlib.Path,
    document: dict[str, object],
    envelope: str,
    owner: int,
    allow_provenance: bool,
) -> None:
    validate_document(document, envelope)
    path.parent.mkdir(mode=0o711, parents=True, exist_ok=True)
    root_info = path.parent.lstat()
    if root_info.st_uid != owner or stat.S_IMODE(root_info.st_mode) != 0o711:
        raise SystemExit("activation receipt root identity disagreement")
    if not acl_free(path.parent) or not xattr_free(path.parent, allow_provenance):
        raise SystemExit("activation receipt root permissions disagreement")
    if path.exists():
        observed = verify(path, envelope, owner, allow_provenance)
        if observed != document:
            raise SystemExit("terminal activation receipt collision")
        return
    temporary = path.parent / f".{path.name}.tmp.{os.getpid()}"
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW
    descriptor = os.open(temporary, flags, 0o600)
    try:
        payload = canonical(document)
        os.write(descriptor, payload)
        os.fsync(descriptor)
    finally:
        os.close(descriptor)
    subprocess.run(["/bin/chmod", "-N", str(temporary)], check=True)
    subprocess.run(["/usr/bin/xattr", "-c", str(temporary)], check=True)
    temporary.chmod(0o444)
    try:
        os.link(temporary, path, follow_symlinks=False)
        os.unlink(temporary)
        directory = os.open(path.parent, os.O_RDONLY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    except Exception:
        temporary.unlink(missing_ok=True)
        raise
    observed = verify(path, envelope, owner, allow_provenance)
    if observed != document:
        raise SystemExit("activation receipt reopen disagreement")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("operation", choices=["publish", "verify"])
    parser.add_argument("path", type=pathlib.Path)
    parser.add_argument("envelope")
    parser.add_argument("--owner", type=int, required=True)
    parser.add_argument("--status", choices=["SUCCESS", "FAILURE"])
    parser.add_argument("--exit-code", type=int)
    parser.add_argument("--checkpoint")
    parser.add_argument("--controller-sha", default="")
    parser.add_argument("--allow-provenance", action="store_true")
    args = parser.parse_args()
    if args.operation == "verify":
        print(json.dumps(
            verify(args.path, args.envelope, args.owner, args.allow_provenance),
            sort_keys=True,
        ))
        return
    if args.status is None or args.exit_code is None or args.checkpoint is None:
        raise SystemExit("publish requires status, exit-code, and checkpoint")
    document = {
        "schemaVersion": 1, "artifactId": ARTIFACT,
        "envelopeSha256": args.envelope, "status": args.status,
        "exitCode": args.exit_code, "checkpoint": args.checkpoint,
        "candidateRevision": CANDIDATE,
        "installedControllerSha256": args.controller_sha,
        "authorizationPresent": args.status == "SUCCESS",
        "namespacePresent": args.status == "SUCCESS",
        "legacyA02ControllerSha256": LEGACY_A02,
        "legacyRecovery03ReceiptSha256": LEGACY_R03,
    }
    publish(args.path, document, args.envelope, args.owner, args.allow_provenance)


if __name__ == "__main__":
    main()
