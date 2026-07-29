#!/usr/bin/env python3
"""Validate and normalize only the closed A02-to-A03 recovery upgrade state."""

from __future__ import annotations

import argparse
import ctypes
import errno
import hashlib
import json
import os
import pathlib
import re
import stat
import subprocess
import sys


A02_MANIFEST_SHA256 = "945ffda713b5e9a02d2472d6f4e9e91340111384a6cdeab40890a5f3b572768b"
A02_ENVELOPE_SHA256 = "69f88512f7b2740326346c57593ed428812a2e278eb86b62a005b17b9e56286f"
A02_LEGACY_MANIFEST_SHA256 = "54997fb321b9b83e4237e23ad6914e10777f130df35ff9de8b9aae692ee7d97e"
A02_SUDOERS_SHA256 = "7fe7480026d425056231200a518c26c0e40b79ef59c130d6924d5af30e23170b"
A02_METADATA_NAMES = {
    "approved-envelope.sha256",
    "expected-install-manifest.json",
    "installed-self-test.json",
    "legacy-v1-observed-manifest.json",
    "release-envelope.json",
}
REQUEST_NAMES = {"arm.json", "verify.json"}
PHASE_NAMES = {f"P{number:02d}" for number in range(1, 13)}
COMMIT_PATTERN = re.compile(r"[0-9a-f]{40}")
RUN_PATTERN = re.compile(r"[0-9a-f]{32}")


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


def lstat_regular(path: pathlib.Path, uid: int, gid: int, mode: int) -> os.stat_result:
    info = path.lstat()
    if (
        not stat.S_ISREG(info.st_mode)
        or info.st_nlink != 1
        or info.st_uid != uid
        or info.st_gid != gid
        or stat.S_IMODE(info.st_mode) != mode
    ):
        raise SystemExit(f"filesystem contract disagreement: {path}")
    reject_acl(path)
    return info


def lstat_directory(path: pathlib.Path, uid: int, gid: int, mode: int) -> os.stat_result:
    info = path.lstat()
    if (
        not stat.S_ISDIR(info.st_mode)
        or info.st_uid != uid
        or info.st_gid != gid
        or stat.S_IMODE(info.st_mode) != mode
    ):
        raise SystemExit(f"directory contract disagreement: {path}")
    reject_acl(path)
    return info


def reject_acl(path: pathlib.Path) -> None:
    libc = ctypes.CDLL("/usr/lib/libSystem.B.dylib", use_errno=True)
    libc.acl_get_file.argtypes = [ctypes.c_char_p, ctypes.c_int]
    libc.acl_get_file.restype = ctypes.c_void_p
    libc.acl_free.argtypes = [ctypes.c_void_p]
    libc.acl_free.restype = ctypes.c_int
    ctypes.set_errno(0)
    acl = libc.acl_get_file(os.fsencode(path), 0x00000100)
    if acl:
        freed = libc.acl_free(acl)
        if freed != 0:
            raise SystemExit(f"ACL release failed: {path}")
        raise SystemExit(f"extended ACL is forbidden: {path}")
    if ctypes.get_errno() != errno.ENOENT:
        raise SystemExit(f"ACL inspection failed: {path}")


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


def validate_self_test(path: pathlib.Path) -> None:
    document = json.loads(path.read_text())
    if set(document) != {
        "schemaVersion",
        "controllerVersion",
        "generatedAt",
        "cases",
        "negativeControl",
    }:
        raise SystemExit("A02 installed self-test schema is not closed")
    if (
        document["schemaVersion"] != 1
        or document["controllerVersion"] != "P00-V2-CAP-A02"
        or not isinstance(document["generatedAt"], str)
        or not document["generatedAt"].endswith("Z")
        or document["cases"]
        != [
            {
                "name": "executes the pinned Node negative control with raw exit seven",
                "result": "PASS",
            },
            {
                "name": "continues to the second child and derives aggregate one from exact exits seven then zero",
                "result": "PASS",
            },
        ]
        or document["negativeControl"]
        != {
            "aggregateExit": 1,
            "continuedAfterFailure": True,
            "rawExits": [7, 0],
            "spawned": [True, True],
        }
    ):
        raise SystemExit("A02 installed self-test identity disagreement")


def a02_admission(
    metadata_root: pathlib.Path,
    sudoers: pathlib.Path,
    uid: int,
    gid: int,
    metadata_mode: int,
    allow_source_xattrs: bool,
) -> None:
    lstat_directory(metadata_root, uid, gid, metadata_mode)
    if {entry.name for entry in os.scandir(metadata_root)} != A02_METADATA_NAMES:
        raise SystemExit("A02 metadata member set disagreement")
    for name in sorted(A02_METADATA_NAMES):
        path = metadata_root / name
        lstat_regular(path, uid, gid, 0o444)
        if not allow_source_xattrs:
            reject_xattrs(path)
    if not allow_source_xattrs:
        reject_xattrs(metadata_root)
    if sha256(metadata_root / "expected-install-manifest.json") != A02_MANIFEST_SHA256:
        raise SystemExit("A02 manifest hash disagreement")
    if sha256(metadata_root / "release-envelope.json") != A02_ENVELOPE_SHA256:
        raise SystemExit("A02 envelope hash disagreement")
    if (
        sha256(metadata_root / "legacy-v1-observed-manifest.json")
        != A02_LEGACY_MANIFEST_SHA256
    ):
        raise SystemExit("A02 legacy manifest hash disagreement")
    if (
        (metadata_root / "approved-envelope.sha256").read_text().strip()
        != A02_ENVELOPE_SHA256
    ):
        raise SystemExit("A02 approval hash disagreement")
    validate_self_test(metadata_root / "installed-self-test.json")
    lstat_regular(sudoers, uid, gid, 0o440)
    if not allow_source_xattrs:
        reject_xattrs(sudoers)
    if sha256(sudoers) != A02_SUDOERS_SHA256:
        raise SystemExit("A02 sudoers hash disagreement")


def xattr_facts(path: pathlib.Path) -> list[list[str]]:
    facts = []
    names = subprocess.run(
        ["/usr/bin/xattr", str(path)],
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    ).stdout.splitlines()
    for name in sorted(names):
        value = subprocess.run(
            ["/usr/bin/xattr", "-px", name, str(path)],
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        ).stdout
        facts.append([name, hashlib.sha256(value).hexdigest()])
    return facts


def request_snapshot(
    request_root: pathlib.Path,
    root_uid: int,
    root_gid: int,
    request_uid: int,
    request_gid: int,
) -> str:
    lstat_directory(request_root, root_uid, root_gid, 0o711)
    owner_root = request_root / str(request_uid)
    lstat_directory(owner_root, request_uid, request_gid, 0o700)
    entries = list(os.scandir(owner_root))
    if {entry.name for entry in entries} - REQUEST_NAMES:
        raise SystemExit("request slot member set disagreement")
    facts: list[dict[str, object]] = []
    for entry in sorted(entries, key=lambda item: item.name):
        path = pathlib.Path(entry.path)
        info = lstat_regular(path, request_uid, request_gid, 0o400)
        facts.append(
            {
                "name": entry.name,
                "size": info.st_size,
                "sha256": sha256(path),
                "xattrs": xattr_facts(path),
            }
        )
    return hashlib.sha256(canonical(facts)).hexdigest()


def scandir_sorted(path: pathlib.Path) -> list[os.DirEntry[str]]:
    return sorted(os.scandir(path), key=lambda entry: entry.name)


def ownership_is_allowed(
    observed_uid: int,
    observed_gid: int,
    state_uid: int,
    state_gid: int,
    execution_uid: int,
    execution_gid: int,
    allow_execution: bool,
) -> bool:
    owner = (observed_uid, observed_gid)
    allowed = {(state_uid, state_gid)}
    if allow_execution:
        allowed.add((execution_uid, execution_gid))
    return owner in allowed


def validate_tree_member(
    path: pathlib.Path,
    state_uid: int,
    state_gid: int,
    execution_uid: int,
    execution_gid: int,
    allow_execution: bool,
) -> os.stat_result:
    info = path.lstat()
    if not ownership_is_allowed(
        info.st_uid,
        info.st_gid,
        state_uid,
        state_gid,
        execution_uid,
        execution_gid,
        allow_execution,
    ):
        raise SystemExit(f"run state ownership disagreement: {path}")
    if not (stat.S_ISDIR(info.st_mode) or stat.S_ISREG(info.st_mode)):
        raise SystemExit(f"run state has link or special member: {path}")
    if stat.S_ISREG(info.st_mode) and info.st_nlink != 1:
        raise SystemExit(f"run state regular member has multiple links: {path}")
    if stat.S_IMODE(info.st_mode) & 0o022:
        raise SystemExit(f"run state is group/world writable: {path}")
    reject_acl(path)
    return info


def normalize_runs(
    runs_root: pathlib.Path,
    state_uid: int,
    state_gid: int,
    execution_uid: int,
    execution_gid: int,
) -> None:
    root_info = validate_tree_member(
        runs_root,
        state_uid,
        state_gid,
        execution_uid,
        execution_gid,
        False,
    )
    if not stat.S_ISDIR(root_info.st_mode):
        raise SystemExit("runs root is not a directory")
    commits: list[pathlib.Path] = []
    phases: list[pathlib.Path] = []
    runs: list[pathlib.Path] = []
    descendants: list[tuple[pathlib.Path, os.stat_result]] = []
    readable_evidence: list[pathlib.Path] = []
    for commit_entry in scandir_sorted(runs_root):
        commit = pathlib.Path(commit_entry.path)
        info = validate_tree_member(
            commit, state_uid, state_gid, execution_uid, execution_gid, False
        )
        if not COMMIT_PATTERN.fullmatch(commit_entry.name) or not stat.S_ISDIR(info.st_mode):
            raise SystemExit(f"unexpected runs commit member: {commit}")
        commits.append(commit)
        for phase_entry in scandir_sorted(commit):
            phase = pathlib.Path(phase_entry.path)
            info = validate_tree_member(
                phase, state_uid, state_gid, execution_uid, execution_gid, False
            )
            if phase_entry.name not in PHASE_NAMES or not stat.S_ISDIR(info.st_mode):
                raise SystemExit(f"unexpected runs phase member: {phase}")
            phases.append(phase)
            for run_entry in scandir_sorted(phase):
                run = pathlib.Path(run_entry.path)
                info = validate_tree_member(
                    run, state_uid, state_gid, execution_uid, execution_gid, False
                )
                if not RUN_PATTERN.fullmatch(run_entry.name) or not stat.S_ISDIR(info.st_mode):
                    raise SystemExit(f"unexpected runs run member: {run}")
                runs.append(run)
                stack = [run]
                while stack:
                    parent = stack.pop()
                    for child_entry in scandir_sorted(parent):
                        child = pathlib.Path(child_entry.path)
                        child_info = validate_tree_member(
                            child,
                            state_uid,
                            state_gid,
                            execution_uid,
                            execution_gid,
                            True,
                        )
                        descendants.append((child, child_info))
                        if parent == run and stat.S_ISREG(child_info.st_mode):
                            if (
                                child_info.st_uid,
                                child_info.st_gid,
                            ) != (state_uid, state_gid):
                                raise SystemExit(
                                    f"top-level evidence is not state-owned: {child}"
                                )
                            readable_evidence.append(child)
                        if stat.S_ISDIR(child_info.st_mode):
                            stack.append(child)
    for path, info in descendants:
        if stat.S_ISDIR(info.st_mode):
            path.chmod(0o700)
        else:
            owner_mode = stat.S_IMODE(info.st_mode) & 0o700
            path.chmod(owner_mode or 0o400)
    for path in readable_evidence:
        path.chmod(0o444)
    for path in [runs_root, *commits, *phases, *runs]:
        path.chmod(0o711)


def main() -> int:
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="command", required=True)
    admission = subparsers.add_parser("a02-admission")
    admission.add_argument("metadata_root", type=pathlib.Path)
    admission.add_argument("sudoers", type=pathlib.Path)
    admission.add_argument("uid", type=int)
    admission.add_argument("gid", type=int)
    admission.add_argument("metadata_mode", type=lambda value: int(value, 8))
    admission.add_argument("allow_source_xattrs", choices=("0", "1"))
    snapshot = subparsers.add_parser("request-snapshot")
    snapshot.add_argument("request_root", type=pathlib.Path)
    snapshot.add_argument("root_uid", type=int)
    snapshot.add_argument("root_gid", type=int)
    snapshot.add_argument("request_uid", type=int)
    snapshot.add_argument("request_gid", type=int)
    runs = subparsers.add_parser("normalize-runs")
    runs.add_argument("runs_root", type=pathlib.Path)
    runs.add_argument("uid", type=int)
    runs.add_argument("gid", type=int)
    runs.add_argument("execution_uid", type=int)
    runs.add_argument("execution_gid", type=int)
    arguments = parser.parse_args()
    if arguments.command == "a02-admission":
        a02_admission(
            arguments.metadata_root,
            arguments.sudoers,
            arguments.uid,
            arguments.gid,
            arguments.metadata_mode,
            arguments.allow_source_xattrs == "1",
        )
    elif arguments.command == "request-snapshot":
        print(
            request_snapshot(
                arguments.request_root,
                arguments.root_uid,
                arguments.root_gid,
                arguments.request_uid,
                arguments.request_gid,
            )
        )
    else:
        normalize_runs(
            arguments.runs_root,
            arguments.uid,
            arguments.gid,
            arguments.execution_uid,
            arguments.execution_gid,
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
