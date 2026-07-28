#!/usr/bin/env python3
"""Generate and verify the complete closed install-tree manifest."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import pathlib
import stat
import subprocess
import sys
from typing import Any


def fail(message: str) -> None:
    raise SystemExit(message)


def sha256(path: pathlib.Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def acl_free(path: pathlib.Path) -> bool:
    if sys.platform != "darwin":
        return True
    result = subprocess.run(
        ["/bin/ls", "-lde", str(path)],
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    lines = result.stdout.splitlines()
    if not lines:
        return False
    permissions = lines[0].split(maxsplit=1)[0]
    return "+" not in permissions and len(lines) == 1


def xattr_names(path: pathlib.Path) -> set[str]:
    if sys.platform != "darwin":
        return set()
    result = subprocess.run(
        ["/usr/bin/xattr", str(path)],
        check=False,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    if result.returncode != 0:
        fail(f"could not inspect extended attributes: {path}")
    return set(result.stdout.splitlines())


def facts(
    root: pathlib.Path, path: pathlib.Path, allow_source_provenance: bool
) -> dict[str, Any]:
    relative = path.relative_to(root).as_posix()
    info = path.lstat()
    if stat.S_ISLNK(info.st_mode):
        fail(f"symlink is forbidden: {relative}")
    if info.st_nlink != 1 and not stat.S_ISDIR(info.st_mode):
        fail(f"non-directory link count must be one: {relative}")
    if not acl_free(path):
        fail(f"extended ACL is forbidden: {relative}")
    attributes = xattr_names(path)
    allowed = {"com.apple.provenance"} if allow_source_provenance else set()
    if not attributes.issubset(allowed):
        fail(f"extended attribute is forbidden: {relative}")
    mode = f"{stat.S_IMODE(info.st_mode):04o}"
    if stat.S_ISDIR(info.st_mode):
        return {"path": relative, "kind": "directory", "mode": mode}
    if stat.S_ISREG(info.st_mode):
        return {
            "path": relative,
            "kind": "file",
            "mode": mode,
            "bytes": info.st_size,
            "sha256": sha256(path),
        }
    fail(f"unsupported filesystem member: {relative}")


def inventory(
    root: pathlib.Path, allow_source_provenance: bool = False
) -> list[dict[str, Any]]:
    if not root.is_dir() or root.is_symlink():
        fail(f"root must be a real directory: {root}")
    members = [facts(root, root, allow_source_provenance)]
    members[0]["path"] = "."
    for path in sorted(root.rglob("*"), key=lambda item: item.relative_to(root).as_posix()):
        members.append(facts(root, path, allow_source_provenance))
    return members


def canonical(value: Any) -> bytes:
    return (
        json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
        + "\n"
    ).encode()


def generate(
    root: pathlib.Path, output: pathlib.Path, allow_source_provenance: bool
) -> None:
    document = {
        "schemaVersion": 1,
        "algorithm": "sha256",
        "rootKind": "verification-controller-v2-payload",
        "members": inventory(root, allow_source_provenance),
    }
    output.write_bytes(canonical(document))


def verify(
    root: pathlib.Path,
    manifest_path: pathlib.Path,
    require_uid: int | None,
    allow_source_provenance: bool,
) -> None:
    manifest = json.loads(manifest_path.read_text())
    if set(manifest) != {"schemaVersion", "algorithm", "rootKind", "members"}:
        fail("manifest top-level schema is not closed")
    if (
        manifest["schemaVersion"] != 1
        or manifest["algorithm"] != "sha256"
        or manifest["rootKind"] != "verification-controller-v2-payload"
        or not isinstance(manifest["members"], list)
    ):
        fail("manifest identity disagreement")
    observed = inventory(root, allow_source_provenance)
    if observed != manifest["members"]:
        expected_paths = [entry.get("path") for entry in manifest["members"]]
        observed_paths = [entry.get("path") for entry in observed]
        if expected_paths != observed_paths:
            fail(
                "closed member set disagreement: "
                f"expected={expected_paths}, observed={observed_paths}"
            )
        for expected, actual in zip(manifest["members"], observed):
            if expected != actual:
                fail(f"member facts disagreement for {expected.get('path')}")
        fail("manifest disagreement")
    if require_uid is not None:
        for path in [root, *sorted(root.rglob("*"))]:
            info = path.lstat()
            if info.st_uid != require_uid:
                fail(f"owner UID disagreement: {path.relative_to(root)}")
            if stat.S_IMODE(info.st_mode) & 0o022:
                fail(f"group/other writable member: {path.relative_to(root)}")


def main() -> None:
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="command", required=True)
    generator = subparsers.add_parser("generate")
    generator.add_argument("root", type=pathlib.Path)
    generator.add_argument("output", type=pathlib.Path)
    generator.add_argument("--allow-source-provenance", action="store_true")
    verifier = subparsers.add_parser("verify")
    verifier.add_argument("root", type=pathlib.Path)
    verifier.add_argument("manifest", type=pathlib.Path)
    verifier.add_argument("--require-uid", type=int)
    verifier.add_argument("--allow-source-provenance", action="store_true")
    args = parser.parse_args()
    if args.command == "generate":
        generate(
            args.root.resolve(),
            args.output.resolve(),
            args.allow_source_provenance,
        )
    else:
        verify(
            args.root.resolve(),
            args.manifest.resolve(),
            args.require_uid,
            args.allow_source_provenance,
        )


if __name__ == "__main__":
    main()
