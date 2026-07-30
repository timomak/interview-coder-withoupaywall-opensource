#!/usr/bin/env python3
"""Durable exclusive A04 activation journal."""

from __future__ import annotations

import argparse
import json
import os
import pathlib
import stat
import subprocess

ARTIFACT = "P00-V2-CAP-A04"
CANDIDATE = "2e5045116db6e3c5f6e6cc18b70df6d7fa021baf"


def canonical(value: object) -> bytes:
    return (json.dumps(value, sort_keys=True, separators=(",", ":")) + "\n").encode()


def xattrs(path: pathlib.Path) -> set[str]:
    result = subprocess.run(
        ["/usr/bin/xattr", str(path)], text=True, capture_output=True, check=True
    )
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
        or not xattrs(root).issubset(allowed)
    ):
        raise SystemExit("activation journal root identity disagreement")


def document(envelope: str, controller: str) -> dict[str, object]:
    return {
        "schemaVersion": 1,
        "artifactId": ARTIFACT,
        "candidateRevision": CANDIDATE,
        "envelopeSha256": envelope,
        "installedControllerSha256": controller,
        "checkpoint": "IN_PROGRESS",
    }


def verify(
    path: pathlib.Path, envelope: str, controller: str, owner: int, group: int,
    allow_provenance: bool,
) -> None:
    verify_root(path.parent, owner, group, allow_provenance)
    info = path.lstat()
    allowed = {"com.apple.provenance"} if allow_provenance else set()
    if (
        not stat.S_ISREG(info.st_mode)
        or info.st_uid != owner
        or info.st_gid != group
        or info.st_nlink != 1
        or stat.S_IMODE(info.st_mode) != 0o400
        or not acl_free(path)
        or not xattrs(path).issubset(allowed)
    ):
        raise SystemExit("activation journal member identity disagreement")
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        before = os.fstat(descriptor)
        if (
            before.st_dev != info.st_dev
            or before.st_ino != info.st_ino
            or before.st_gid != group
        ):
            raise SystemExit("activation journal descriptor group disagreement")
        raw = os.read(descriptor, 8192)
        if os.read(descriptor, 1):
            raise SystemExit("activation journal exceeds maximum size")
        after = os.fstat(descriptor)
    finally:
        os.close(descriptor)
    if (
        before.st_dev, before.st_ino, before.st_gid,
        before.st_size, before.st_mtime_ns
    ) != (
        after.st_dev, after.st_ino, after.st_gid,
        after.st_size, after.st_mtime_ns
    ):
        raise SystemExit("activation journal changed during descriptor read")
    expected = document(envelope, controller)
    if raw != canonical(expected) or json.loads(raw) != expected:
        raise SystemExit("activation journal bytes disagreement")


def create(
    path: pathlib.Path, envelope: str, controller: str, owner: int, group: int,
    allow_provenance: bool,
) -> None:
    if path.parent.exists():
        verify_root(path.parent, owner, group, allow_provenance)
    else:
        path.parent.mkdir(mode=0o711)
        path.parent.chmod(0o711)
        subprocess.run(["/bin/chmod", "-N", str(path.parent)], check=True)
        subprocess.run(["/usr/bin/xattr", "-c", str(path.parent)], check=True)
        verify_root(path.parent, owner, group, allow_provenance)
    descriptor = os.open(
        path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600
    )
    try:
        os.fchown(descriptor, owner, group)
        payload = canonical(document(envelope, controller))
        os.write(descriptor, payload)
        os.fsync(descriptor)
    finally:
        os.close(descriptor)
    subprocess.run(["/bin/chmod", "-N", str(path)], check=True)
    subprocess.run(["/usr/bin/xattr", "-c", str(path)], check=True)
    path.chmod(0o400)
    directory = os.open(path.parent, os.O_RDONLY)
    try:
        os.fsync(directory)
    finally:
        os.close(directory)
    verify(path, envelope, controller, owner, group, allow_provenance)


def remove(
    path: pathlib.Path, envelope: str, controller: str, owner: int, group: int,
    allow_provenance: bool,
) -> None:
    verify(path, envelope, controller, owner, group, allow_provenance)
    path.unlink()
    directory = os.open(path.parent, os.O_RDONLY)
    try:
        os.fsync(directory)
    finally:
        os.close(directory)
    if path.exists():
        raise SystemExit("activation journal removal disagreement")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("operation", choices=["create", "verify", "remove"])
    parser.add_argument("path", type=pathlib.Path)
    parser.add_argument("envelope")
    parser.add_argument("--controller-sha", required=True)
    parser.add_argument("--owner", type=int, required=True)
    parser.add_argument("--group", type=int, required=True)
    parser.add_argument("--allow-provenance", action="store_true")
    args = parser.parse_args()
    options = (
        args.path, args.envelope, args.controller_sha, args.owner, args.group,
        args.allow_provenance,
    )
    if args.operation == "create":
        create(*options)
    elif args.operation == "verify":
        verify(*options)
    else:
        remove(*options)


if __name__ == "__main__":
    main()
