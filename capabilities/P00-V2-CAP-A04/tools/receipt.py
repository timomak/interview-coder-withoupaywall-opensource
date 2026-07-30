#!/usr/bin/env python3
"""Publish and verify the terminal A04 activation receipt and its root."""

from __future__ import annotations

import argparse
import json
import os
import pathlib
import stat
import subprocess

ARTIFACT = "P00-V2-CAP-A04"
CANDIDATE = "2e5045116db6e3c5f6e6cc18b70df6d7fa021baf"
LEGACY_A02 = "73eda1532baa3044cf4feb989d2ec58d15304c86c31a298ed3d73a1a75c7494d"
LEGACY_R03 = "5da6d108e0fde1583bc09ecef806d591847c2c26c69bef461c5813390d36f5b8"
FIELDS = {
    "schemaVersion", "artifactId", "envelopeSha256", "status", "exitCode",
    "checkpoint", "candidateRevision", "installedControllerSha256",
    "installedStateSha256", "authorizationPresent", "namespacePresent",
    "legacyA02ControllerSha256", "legacyRecovery03ReceiptSha256",
}


def canonical(value: object) -> bytes:
    return (json.dumps(value, sort_keys=True, separators=(",", ":")) + "\n").encode()


def attributes(path: pathlib.Path) -> set[str]:
    result = subprocess.run(
        ["/usr/bin/xattr", str(path)], text=True, capture_output=True, check=False
    )
    if result.returncode != 0:
        raise SystemExit(f"cannot inspect extended attributes: {path}")
    return set(result.stdout.splitlines())


def acl_free(path: pathlib.Path) -> bool:
    result = subprocess.run(
        ["/bin/ls", "-lde", str(path)], text=True, capture_output=True, check=True
    )
    lines = result.stdout.splitlines()
    return bool(lines) and "+" not in lines[0].split(maxsplit=1)[0] and len(lines) == 1


def verify_root(
    root: pathlib.Path, owner: int, group: int, allow_provenance: bool
) -> None:
    info = root.lstat()
    allowed = {"com.apple.provenance"} if allow_provenance else set()
    if (
        not stat.S_ISDIR(info.st_mode)
        or info.st_uid != owner
        or info.st_gid != group
        or stat.S_IMODE(info.st_mode) != 0o711
        or not acl_free(root)
        or not attributes(root).issubset(allowed)
    ):
        raise SystemExit("activation receipt root identity disagreement")


def validate_document(
    document: dict[str, object], envelope: str, controller: str
) -> None:
    if set(document) != FIELDS:
        raise SystemExit("activation receipt schema is not closed")
    fixed = {
        "schemaVersion": 1,
        "artifactId": ARTIFACT,
        "envelopeSha256": envelope,
        "candidateRevision": CANDIDATE,
        "installedControllerSha256": controller,
        "legacyA02ControllerSha256": LEGACY_A02,
        "legacyRecovery03ReceiptSha256": LEGACY_R03,
    }
    for key, value in fixed.items():
        if document.get(key) != value:
            raise SystemExit(f"activation receipt identity disagreement: {key}")
    if type(document["exitCode"]) is not int:
        raise SystemExit("activation receipt exit code type disagreement")
    for key in ("authorizationPresent", "namespacePresent"):
        if type(document[key]) is not bool:
            raise SystemExit(f"activation receipt boolean type disagreement: {key}")
    state = document["installedStateSha256"]
    if not isinstance(state, str):
        raise SystemExit("activation receipt installed-state type disagreement")
    if document["status"] == "SUCCESS":
        if (
            document["checkpoint"] != "installed"
            or document["exitCode"] != 0
            or document["authorizationPresent"] is not True
            or document["namespacePresent"] is not True
            or len(state) != 64
            or any(character not in "0123456789abcdef" for character in state)
        ):
            raise SystemExit("SUCCESS receipt state disagreement")
    elif document["status"] == "FAILURE":
        if (
            document["checkpoint"] not in {
                "install_rollback", "crash_replay_rollback"
            }
            or not 1 <= document["exitCode"] <= 255
            or document["authorizationPresent"] is not False
            or document["namespacePresent"] is not False
            or state != ""
        ):
            raise SystemExit("FAILURE receipt state disagreement")
    else:
        raise SystemExit("activation receipt status disagreement")


def verify(
    path: pathlib.Path,
    envelope: str,
    controller: str,
    owner: int,
    group: int,
    allow_provenance: bool,
) -> dict[str, object]:
    verify_root(path.parent, owner, group, allow_provenance)
    info = path.lstat()
    allowed = {"com.apple.provenance"} if allow_provenance else set()
    if (
        not stat.S_ISREG(info.st_mode)
        or info.st_uid != owner
        or info.st_nlink != 1
        or stat.S_IMODE(info.st_mode) != 0o444
        or not acl_free(path)
        or not attributes(path).issubset(allowed)
    ):
        raise SystemExit("activation receipt member identity disagreement")
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        before = os.fstat(descriptor)
        raw = b""
        while True:
            chunk = os.read(descriptor, 65536)
            if not chunk:
                break
            raw += chunk
        after = os.fstat(descriptor)
    finally:
        os.close(descriptor)
    if (
        before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns
    ) != (
        after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns
    ):
        raise SystemExit("activation receipt changed during descriptor read")
    document = json.loads(raw)
    validate_document(document, envelope, controller)
    if raw != canonical(document):
        raise SystemExit("activation receipt bytes are not canonical")
    return document


def publish(
    path: pathlib.Path,
    document: dict[str, object],
    envelope: str,
    controller: str,
    owner: int,
    group: int,
    allow_provenance: bool,
) -> None:
    validate_document(document, envelope, controller)
    verify_root(path.parent, owner, group, allow_provenance)
    if path.exists():
        if verify(
            path, envelope, controller, owner, group, allow_provenance
        ) != document:
            raise SystemExit("terminal activation receipt collision")
        return
    temporary = path.parent / f".{path.name}.tmp.{os.getpid()}"
    descriptor = os.open(
        temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600
    )
    try:
        payload = canonical(document)
        view = memoryview(payload)
        while view:
            written = os.write(descriptor, view)
            view = view[written:]
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
    if verify(path, envelope, controller, owner, group, allow_provenance) != document:
        raise SystemExit("activation receipt reopen disagreement")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("operation", choices=["publish", "verify"])
    parser.add_argument("path", type=pathlib.Path)
    parser.add_argument("envelope")
    parser.add_argument("--expected-controller-sha", required=True)
    parser.add_argument("--owner", type=int, required=True)
    parser.add_argument("--group", type=int, required=True)
    parser.add_argument("--status", choices=["SUCCESS", "FAILURE"])
    parser.add_argument("--exit-code", type=int)
    parser.add_argument("--checkpoint")
    parser.add_argument("--installed-state-sha", default="")
    parser.add_argument("--allow-provenance", action="store_true")
    args = parser.parse_args()
    if args.operation == "verify":
        print(json.dumps(
            verify(
                args.path, args.envelope, args.expected_controller_sha,
                args.owner, args.group, args.allow_provenance,
            ),
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
        "installedControllerSha256": args.expected_controller_sha,
        "installedStateSha256": args.installed_state_sha,
        "authorizationPresent": args.status == "SUCCESS",
        "namespacePresent": args.status == "SUCCESS",
        "legacyA02ControllerSha256": LEGACY_A02,
        "legacyRecovery03ReceiptSha256": LEGACY_R03,
    }
    publish(
        args.path, document, args.envelope, args.expected_controller_sha,
        args.owner, args.group, args.allow_provenance,
    )


if __name__ == "__main__":
    main()
