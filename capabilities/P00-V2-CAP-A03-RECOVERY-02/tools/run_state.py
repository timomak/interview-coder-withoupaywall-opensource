#!/usr/bin/env python3
"""Atomically quarantine and restore the exact historical run dependency tree."""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
import pathlib
import stat
import subprocess
import sys


ARTIFACT_ID = "P00-V2-CAP-A03-RECOVERY-02"
COMMIT = "1ff0881b9bd59f243146c93b6709be57d58ee17a"
PHASE = "P01"
RUN = "70acd85a0202cc85f65e176a995a248f"
SOURCE_SUFFIX = pathlib.PurePath(
    "verification-controller",
    "runs",
    COMMIT,
    PHASE,
    RUN,
    "repo",
    "node_modules",
)
DESTINATION_SUFFIX = pathlib.PurePath(
    "verification-controller",
    "quarantine",
    ARTIFACT_ID,
    f"{COMMIT}-{PHASE}-{RUN}-repo-node_modules",
)


def canonical(value: object) -> bytes:
    return (
        json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
        + "\n"
    ).encode()


def sha256_file(path: pathlib.Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def xattr_facts(path: pathlib.Path) -> list[list[str]]:
    facts = []
    names = subprocess.run(
        ["/usr/bin/xattr", "-s", str(path)],
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    ).stdout.splitlines()
    for name in sorted(names):
        hexadecimal = subprocess.run(
            ["/usr/bin/xattr", "-p", "-x", "-s", name, str(path)],
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        ).stdout
        value = bytes.fromhex("".join(hexadecimal.split()))
        facts.append([name, hashlib.sha256(value).hexdigest()])
    return facts


def tree_facts(root: pathlib.Path) -> dict[str, object]:
    root_info = root.lstat()
    if not stat.S_ISDIR(root_info.st_mode):
        raise SystemExit(f"relocation root is not a directory: {root}")
    rows: list[dict[str, object]] = []
    counts = {"directory": 0, "regular": 0, "symlink": 0}
    total_regular_bytes = 0
    stack = [root]
    while stack:
        parent = stack.pop()
        entries = sorted(os.scandir(parent), key=lambda entry: entry.name)
        for entry in entries:
            path = pathlib.Path(entry.path)
            info = path.lstat()
            relative = path.relative_to(root).as_posix()
            common = {
                "path": relative,
                "uid": info.st_uid,
                "gid": info.st_gid,
                "mode": stat.S_IMODE(info.st_mode),
                "nlink": info.st_nlink,
                "size": info.st_size,
                "xattrs": xattr_facts(path),
            }
            if stat.S_ISDIR(info.st_mode):
                counts["directory"] += 1
                rows.append({**common, "type": "directory"})
                stack.append(path)
            elif stat.S_ISREG(info.st_mode):
                counts["regular"] += 1
                total_regular_bytes += info.st_size
                rows.append(
                    {**common, "type": "regular", "sha256": sha256_file(path)}
                )
            elif stat.S_ISLNK(info.st_mode):
                counts["symlink"] += 1
                rows.append(
                    {**common, "type": "symlink", "target": os.readlink(path)}
                )
            else:
                raise SystemExit(f"unsupported historical dependency member: {path}")
    rows.sort(key=lambda row: str(row["path"]))
    return {
        "factsSha256": hashlib.sha256(canonical(rows)).hexdigest(),
        "memberCount": len(rows),
        "typeCounts": counts,
        "totalRegularBytes": total_regular_bytes,
    }


def require_suffix(path: pathlib.Path, suffix: pathlib.PurePath, label: str) -> None:
    observed = pathlib.PurePath(*path.parts[-len(suffix.parts) :])
    if observed != suffix:
        raise SystemExit(f"{label} path disagreement: {path}")


def load_upgrade_state(path: pathlib.Path):
    spec = importlib.util.spec_from_file_location("exact_a03_upgrade_state", path)
    if spec is None or spec.loader is None:
        raise SystemExit("cannot load exact A03 run-state validator")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def audit_runs(
    runs_root: pathlib.Path,
    state_uid: int,
    state_gid: int,
    execution_uid: int,
    execution_gid: int,
    upgrade_state: pathlib.Path,
) -> None:
    module = load_upgrade_state(upgrade_state)
    root_info = module.validate_tree_member(
        runs_root, state_uid, state_gid, execution_uid, execution_gid, False
    )
    if not stat.S_ISDIR(root_info.st_mode):
        raise SystemExit("runs root is not a directory")
    for commit_entry in module.scandir_sorted(runs_root):
        commit = pathlib.Path(commit_entry.path)
        info = module.validate_tree_member(
            commit, state_uid, state_gid, execution_uid, execution_gid, False
        )
        if not module.COMMIT_PATTERN.fullmatch(commit_entry.name) or not stat.S_ISDIR(
            info.st_mode
        ):
            raise SystemExit(f"unexpected runs commit member: {commit}")
        for phase_entry in module.scandir_sorted(commit):
            phase = pathlib.Path(phase_entry.path)
            info = module.validate_tree_member(
                phase, state_uid, state_gid, execution_uid, execution_gid, False
            )
            if phase_entry.name not in module.PHASE_NAMES or not stat.S_ISDIR(
                info.st_mode
            ):
                raise SystemExit(f"unexpected runs phase member: {phase}")
            for run_entry in module.scandir_sorted(phase):
                run = pathlib.Path(run_entry.path)
                info = module.validate_tree_member(
                    run, state_uid, state_gid, execution_uid, execution_gid, False
                )
                if not module.RUN_PATTERN.fullmatch(run_entry.name) or not stat.S_ISDIR(
                    info.st_mode
                ):
                    raise SystemExit(f"unexpected runs run member: {run}")
                stack = [run]
                while stack:
                    parent = stack.pop()
                    for child_entry in module.scandir_sorted(parent):
                        child = pathlib.Path(child_entry.path)
                        child_info = module.validate_tree_member(
                            child,
                            state_uid,
                            state_gid,
                            execution_uid,
                            execution_gid,
                            True,
                        )
                        if stat.S_ISDIR(child_info.st_mode):
                            stack.append(child)


def relocate(
    source: pathlib.Path, destination: pathlib.Path, manifest: pathlib.Path
) -> None:
    require_suffix(source, SOURCE_SUFFIX, "source")
    require_suffix(destination, DESTINATION_SUFFIX, "destination")
    if destination.exists() or manifest.exists():
        raise SystemExit("relocation destination or manifest already exists")
    facts = tree_facts(source)
    destination.parent.mkdir(parents=True, mode=0o700)
    destination.parent.chmod(0o700)
    if source.stat().st_dev != destination.parent.stat().st_dev:
        raise SystemExit("relocation must remain on one filesystem")
    temporary = destination.parent / ".relocation.json.tmp"
    document = {
        "schemaVersion": 1,
        "artifactId": ARTIFACT_ID,
        "source": str(source),
        "destination": str(destination),
        "tree": facts,
    }
    temporary.write_bytes(canonical(document))
    temporary.chmod(0o400)
    os.rename(source, destination)
    try:
        if tree_facts(destination) != facts:
            raise SystemExit("relocated tree facts disagreement")
        os.rename(temporary, manifest)
        manifest.chmod(0o444)
    except BaseException:
        if destination.exists() and not source.exists():
            os.rename(destination, source)
        temporary.unlink(missing_ok=True)
        raise


def restore(source: pathlib.Path, destination: pathlib.Path, manifest: pathlib.Path) -> None:
    require_suffix(source, SOURCE_SUFFIX, "source")
    require_suffix(destination, DESTINATION_SUFFIX, "destination")
    if source.exists() or not destination.is_dir() or not manifest.is_file():
        raise SystemExit("relocation restore state disagreement")
    document = json.loads(manifest.read_text())
    if (
        document.get("schemaVersion") != 1
        or document.get("artifactId") != ARTIFACT_ID
        or document.get("source") != str(source)
        or document.get("destination") != str(destination)
        or document.get("tree") != tree_facts(destination)
    ):
        raise SystemExit("relocation restore manifest disagreement")
    os.rename(destination, source)
    if tree_facts(source) != document["tree"]:
        raise SystemExit("restored tree facts disagreement")
    manifest.unlink()
    destination.parent.rmdir()


def main() -> None:
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="command", required=True)
    relocate_parser = subparsers.add_parser("relocate")
    relocate_parser.add_argument("source", type=pathlib.Path)
    relocate_parser.add_argument("destination", type=pathlib.Path)
    relocate_parser.add_argument("manifest", type=pathlib.Path)
    restore_parser = subparsers.add_parser("restore")
    restore_parser.add_argument("source", type=pathlib.Path)
    restore_parser.add_argument("destination", type=pathlib.Path)
    restore_parser.add_argument("manifest", type=pathlib.Path)
    audit_parser = subparsers.add_parser("audit-runs")
    audit_parser.add_argument("runs_root", type=pathlib.Path)
    audit_parser.add_argument("state_uid", type=int)
    audit_parser.add_argument("state_gid", type=int)
    audit_parser.add_argument("execution_uid", type=int)
    audit_parser.add_argument("execution_gid", type=int)
    audit_parser.add_argument("upgrade_state", type=pathlib.Path)
    arguments = parser.parse_args()
    if arguments.command == "relocate":
        relocate(
            arguments.source.resolve(),
            arguments.destination.resolve(),
            arguments.manifest.resolve(),
        )
    elif arguments.command == "restore":
        restore(
            arguments.source.resolve(),
            arguments.destination.resolve(),
            arguments.manifest.resolve(),
        )
    else:
        audit_runs(
            arguments.runs_root.resolve(),
            arguments.state_uid,
            arguments.state_gid,
            arguments.execution_uid,
            arguments.execution_gid,
            arguments.upgrade_state.resolve(),
        )


if __name__ == "__main__":
    sys.exit(main())
