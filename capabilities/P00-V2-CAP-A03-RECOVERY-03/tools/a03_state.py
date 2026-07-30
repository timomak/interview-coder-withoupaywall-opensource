#!/usr/bin/env python3
"""Validate the closed installed A03 metadata contract used by replay."""

from __future__ import annotations

import argparse
import ctypes
import errno
import hashlib
import json
import os
import pathlib
import stat
import subprocess


A03_MANIFEST_SHA256 = "d94f06f0d6f585ed6ce368cfc933e5ec4fe4c9914621a39ce2544baa97f0ad39"
A03_ENVELOPE_SHA256 = "00ea8696be7af50cfadd9035f9d7b44cb9d560b96c1f563c9ded0f6197a1af41"
LEGACY_MANIFEST_SHA256 = "54997fb321b9b83e4237e23ad6914e10777f130df35ff9de8b9aae692ee7d97e"
METADATA_NAMES = {
    "approved-envelope.sha256",
    "expected-install-manifest.json",
    "installed-self-test.json",
    "legacy-v1-observed-manifest.json",
    "release-envelope.json",
}
CASES = [
    {
        "name": "executes the pinned Node negative control with raw exit seven",
        "result": "PASS",
    },
    {
        "name": (
            "continues to the second child and derives aggregate one "
            "from exact exits seven then zero"
        ),
        "result": "PASS",
    },
]
NEGATIVE_CONTROL = {
    "aggregateExit": 1,
    "continuedAfterFailure": True,
    "rawExits": [7, 0],
    "spawned": [True, True],
}


def sha256(path: pathlib.Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def reject_xattrs(path: pathlib.Path) -> None:
    result = subprocess.run(
        ["/usr/bin/xattr", str(path)],
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    if result.stdout.splitlines():
        raise SystemExit(f"extended attributes are forbidden: {path}")


def reject_acl(path: pathlib.Path) -> None:
    libc = ctypes.CDLL("/usr/lib/libSystem.B.dylib", use_errno=True)
    libc.acl_get_file.argtypes = [ctypes.c_char_p, ctypes.c_int]
    libc.acl_get_file.restype = ctypes.c_void_p
    libc.acl_free.argtypes = [ctypes.c_void_p]
    libc.acl_free.restype = ctypes.c_int
    ctypes.set_errno(0)
    acl = libc.acl_get_file(os.fsencode(path), 0x00000100)
    if acl:
        if libc.acl_free(acl) != 0:
            raise SystemExit(f"ACL release failed: {path}")
        raise SystemExit(f"extended ACL is forbidden: {path}")
    if ctypes.get_errno() != errno.ENOENT:
        raise SystemExit(f"ACL inspection failed: {path}")


def regular(path: pathlib.Path, uid: int, gid: int, mode: int) -> None:
    info = path.lstat()
    if (
        not stat.S_ISREG(info.st_mode)
        or info.st_nlink != 1
        or info.st_uid != uid
        or info.st_gid != gid
        or stat.S_IMODE(info.st_mode) != mode
    ):
        raise SystemExit(f"A03 metadata file contract disagreement: {path}")
    reject_acl(path)


def validate_self_test(path: pathlib.Path) -> None:
    document = json.loads(path.read_text())
    if set(document) != {
        "schemaVersion",
        "controllerVersion",
        "generatedAt",
        "cases",
        "negativeControl",
    }:
        raise SystemExit("A03 installed self-test schema is not closed")
    if (
        document["schemaVersion"] != 1
        or document["controllerVersion"] != "P00-V2-CAP-A03"
        or not isinstance(document["generatedAt"], str)
        or not document["generatedAt"].endswith("Z")
        or document["cases"] != CASES
        or document["negativeControl"] != NEGATIVE_CONTROL
    ):
        raise SystemExit("A03 installed self-test evidence disagreement")


def verify(
    metadata: pathlib.Path,
    uid: int,
    gid: int,
    mode: int,
    allow_xattrs: bool,
) -> None:
    info = metadata.lstat()
    if (
        not stat.S_ISDIR(info.st_mode)
        or info.st_uid != uid
        or info.st_gid != gid
        or stat.S_IMODE(info.st_mode) != mode
    ):
        raise SystemExit("A03 metadata directory contract disagreement")
    reject_acl(metadata)
    if {entry.name for entry in os.scandir(metadata)} != METADATA_NAMES:
        raise SystemExit("A03 metadata member set disagreement")
    for name in sorted(METADATA_NAMES):
        path = metadata / name
        regular(path, uid, gid, 0o444)
        if not allow_xattrs:
            reject_xattrs(path)
    if not allow_xattrs:
        reject_xattrs(metadata)
    if sha256(metadata / "expected-install-manifest.json") != A03_MANIFEST_SHA256:
        raise SystemExit("A03 metadata manifest hash disagreement")
    if sha256(metadata / "release-envelope.json") != A03_ENVELOPE_SHA256:
        raise SystemExit("A03 metadata envelope hash disagreement")
    if (
        sha256(metadata / "legacy-v1-observed-manifest.json")
        != LEGACY_MANIFEST_SHA256
    ):
        raise SystemExit("A03 metadata legacy manifest hash disagreement")
    if (
        (metadata / "approved-envelope.sha256").read_text().strip()
        != A03_ENVELOPE_SHA256
    ):
        raise SystemExit("A03 metadata approval hash disagreement")
    validate_self_test(metadata / "installed-self-test.json")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("metadata", type=pathlib.Path)
    parser.add_argument("uid", type=int)
    parser.add_argument("gid", type=int)
    parser.add_argument("mode", type=lambda value: int(value, 8))
    parser.add_argument("allow_xattrs", choices=("0", "1"))
    arguments = parser.parse_args()
    verify(
        arguments.metadata.resolve(),
        arguments.uid,
        arguments.gid,
        arguments.mode,
        arguments.allow_xattrs == "1",
    )


if __name__ == "__main__":
    main()
