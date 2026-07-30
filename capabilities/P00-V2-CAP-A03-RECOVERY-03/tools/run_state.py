#!/usr/bin/env python3
"""Crash-recoverable exact run-state relocation and metadata snapshots."""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
import pathlib
import signal
import stat
import subprocess
import sys
import tempfile


ARTIFACT_ID = "P00-V2-CAP-A03-RECOVERY-03"
COMMIT = "1ff0881b9bd59f243146c93b6709be57d58ee17a"
PHASE = "P01"
RUN = "70acd85a0202cc85f65e176a995a248f"
SOURCE_SUFFIX = pathlib.PurePath(
    "verification-controller", "runs", COMMIT, PHASE, RUN, "repo", "node_modules"
)
DESTINATION_SUFFIX = pathlib.PurePath(
    "verification-controller",
    "quarantine",
    ARTIFACT_ID,
    f"{COMMIT}-{PHASE}-{RUN}-repo-node_modules",
)
RELOCATION_STATES = {"PREPARED", "RELOCATED"}


def canonical(value: object) -> bytes:
    return (
        json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
        + "\n"
    ).encode()


def fsync_directory(path: pathlib.Path) -> None:
    descriptor = os.open(path, os.O_RDONLY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def atomic_document(path: pathlib.Path, document: object, mode: int = 0o400) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    temporary = pathlib.Path(temporary_name)
    try:
        with os.fdopen(descriptor, "wb") as handle:
            handle.write(canonical(document))
            handle.flush()
            os.fsync(handle.fileno())
        temporary.chmod(mode)
        os.rename(temporary, path)
        fsync_directory(path.parent)
    finally:
        temporary.unlink(missing_ok=True)


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


def acl_facts(path: pathlib.Path) -> list[str]:
    output = subprocess.run(
        ["/bin/ls", "-lde", str(path)],
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    ).stdout.splitlines()
    return [line.rstrip() for line in output[1:]]


def member_row(root: pathlib.Path, path: pathlib.Path) -> dict[str, object]:
    info = path.lstat()
    relative = "." if path == root else path.relative_to(root).as_posix()
    common: dict[str, object] = {
        "path": relative,
        "uid": info.st_uid,
        "gid": info.st_gid,
        "mode": stat.S_IMODE(info.st_mode),
        "nlink": info.st_nlink,
        "size": info.st_size,
        "xattrs": xattr_facts(path),
        "acl": acl_facts(path),
    }
    if stat.S_ISDIR(info.st_mode):
        return {**common, "type": "directory"}
    if stat.S_ISREG(info.st_mode):
        return {**common, "type": "regular", "sha256": sha256_file(path)}
    if stat.S_ISLNK(info.st_mode):
        return {**common, "type": "symlink", "target": os.readlink(path)}
    raise SystemExit(f"unsupported historical dependency member: {path}")


def tree_rows(root: pathlib.Path) -> list[dict[str, object]]:
    if not stat.S_ISDIR(root.lstat().st_mode):
        raise SystemExit(f"tree root is not a directory: {root}")
    rows = [member_row(root, root)]
    stack = [root]
    while stack:
        parent = stack.pop()
        for entry in sorted(os.scandir(parent), key=lambda item: item.name):
            path = pathlib.Path(entry.path)
            row = member_row(root, path)
            rows.append(row)
            if row["type"] == "directory":
                stack.append(path)
    rows.sort(key=lambda row: str(row["path"]))
    return rows


def tree_facts(root: pathlib.Path) -> dict[str, object]:
    rows = tree_rows(root)
    counts = {"directory": 0, "regular": 0, "symlink": 0}
    total_regular_bytes = 0
    acl_member_count = 0
    for row in rows:
        counts[str(row["type"])] += 1
        if row["type"] == "regular":
            total_regular_bytes += int(row["size"])
        if row["acl"]:
            acl_member_count += 1
    return {
        "factsSha256": hashlib.sha256(canonical(rows)).hexdigest(),
        "memberCountIncludingRoot": len(rows),
        "typeCountsIncludingRoot": counts,
        "totalRegularBytes": total_regular_bytes,
        "aclMemberCount": acl_member_count,
    }


def require_suffix(path: pathlib.Path, suffix: pathlib.PurePath, label: str) -> None:
    observed = pathlib.PurePath(*path.parts[-len(suffix.parts) :])
    if observed != suffix:
        raise SystemExit(f"{label} path disagreement: {path}")


def hard_crash_parent(point: str) -> None:
    if (
        os.environ.get("P00_V2_TEST_ROOT")
        and os.geteuid() != 0
        and os.environ.get("P00_V2_RECOVERY_TEST_HARD_CRASH_POINT") == point
    ):
        os.kill(os.getppid(), signal.SIGKILL)
        os._exit(137)


def relocation_document(
    source: pathlib.Path,
    destination: pathlib.Path,
    facts: dict[str, object],
    state: str,
) -> dict[str, object]:
    return {
        "schemaVersion": 2,
        "artifactId": ARTIFACT_ID,
        "state": state,
        "source": str(source),
        "destination": str(destination),
        "tree": facts,
    }


def load_relocation(
    source: pathlib.Path, destination: pathlib.Path, manifest: pathlib.Path
) -> dict[str, object]:
    document = json.loads(manifest.read_text())
    if (
        set(document)
        != {
            "schemaVersion",
            "artifactId",
            "state",
            "source",
            "destination",
            "tree",
        }
        or document["schemaVersion"] != 2
        or document["artifactId"] != ARTIFACT_ID
        or document["state"] not in RELOCATION_STATES
        or document["source"] != str(source)
        or document["destination"] != str(destination)
        or not isinstance(document["tree"], dict)
    ):
        raise SystemExit("relocation manifest disagreement")
    return document


def prepare_relocation(
    source: pathlib.Path, destination: pathlib.Path, manifest: pathlib.Path
) -> None:
    require_suffix(source, SOURCE_SUFFIX, "source")
    require_suffix(destination, DESTINATION_SUFFIX, "destination")
    if not source.is_dir() or destination.exists() or manifest.exists():
        raise SystemExit("relocation preparation state disagreement")
    destination.parent.mkdir(parents=True, mode=0o700)
    destination.parent.chmod(0o700)
    fsync_directory(destination.parent.parent)
    hard_crash_parent("after-quarantine-mkdir")
    if source.stat().st_dev != destination.parent.stat().st_dev:
        raise SystemExit("relocation must remain on one filesystem")
    facts = tree_facts(source)
    atomic_document(
        manifest, relocation_document(source, destination, facts, "PREPARED"), 0o400
    )
    if tree_facts(source) != facts:
        raise SystemExit("source tree changed while preparing relocation")
    hard_crash_parent("after-manifest-publish")


def move_relocation(
    source: pathlib.Path, destination: pathlib.Path, manifest: pathlib.Path
) -> None:
    require_suffix(source, SOURCE_SUFFIX, "source")
    require_suffix(destination, DESTINATION_SUFFIX, "destination")
    document = load_relocation(source, destination, manifest)
    if document["state"] != "PREPARED" or not source.is_dir() or destination.exists():
        raise SystemExit("relocation move state disagreement")
    if tree_facts(source) != document["tree"]:
        raise SystemExit("prepared source tree facts disagreement")
    os.rename(source, destination)
    fsync_directory(source.parent)
    fsync_directory(destination.parent)
    hard_crash_parent("after-relocation-rename")
    if tree_facts(destination) != document["tree"]:
        raise SystemExit("relocated tree facts disagreement")
    atomic_document(
        manifest,
        relocation_document(source, destination, document["tree"], "RELOCATED"),
        0o400,
    )


def finalize_retained(
    source: pathlib.Path, destination: pathlib.Path, manifest: pathlib.Path
) -> None:
    document = load_relocation(source, destination, manifest)
    if source.exists() or not destination.is_dir():
        raise SystemExit("retained relocation state disagreement")
    if tree_facts(destination) != document["tree"]:
        raise SystemExit("retained relocation facts disagreement")
    if document["state"] != "RELOCATED":
        atomic_document(
            manifest,
            relocation_document(source, destination, document["tree"], "RELOCATED"),
            0o400,
        )
    manifest.chmod(0o444)


def restore_relocation(
    source: pathlib.Path, destination: pathlib.Path, manifest: pathlib.Path
) -> None:
    require_suffix(source, SOURCE_SUFFIX, "source")
    require_suffix(destination, DESTINATION_SUFFIX, "destination")
    document = load_relocation(source, destination, manifest)
    if source.exists() or not destination.is_dir():
        raise SystemExit("relocation restore state disagreement")
    if tree_facts(destination) != document["tree"]:
        raise SystemExit("relocation restore pre-rename facts disagreement")
    os.rename(destination, source)
    fsync_directory(source.parent)
    fsync_directory(destination.parent)
    if tree_facts(source) != document["tree"]:
        raise SystemExit("restored tree facts disagreement")
    manifest.unlink()
    fsync_directory(manifest.parent)


def reconcile_relocation(
    source: pathlib.Path, destination: pathlib.Path, manifest: pathlib.Path
) -> None:
    require_suffix(source, SOURCE_SUFFIX, "source")
    require_suffix(destination, DESTINATION_SUFFIX, "destination")
    if manifest.exists():
        document = load_relocation(source, destination, manifest)
        if source.is_dir() and not destination.exists():
            if tree_facts(source) != document["tree"]:
                raise SystemExit("prepared source facts disagree during reconciliation")
            manifest.unlink()
            fsync_directory(manifest.parent)
        elif not source.exists() and destination.is_dir():
            restore_relocation(source, destination, manifest)
        else:
            raise SystemExit("ambiguous relocation state during reconciliation")
    elif source.is_dir() and not destination.exists():
        pass
    else:
        raise SystemExit("unrecoverable relocation state without manifest")
    try:
        destination.parent.rmdir()
        fsync_directory(destination.parent.parent)
    except OSError:
        pass


def snapshot_tree(root: pathlib.Path, output: pathlib.Path) -> None:
    document = {
        "schemaVersion": 1,
        "artifactId": ARTIFACT_ID,
        "root": str(root),
        "rows": tree_rows(root),
    }
    atomic_document(output, document, 0o400)


def row_without_mode(row: dict[str, object]) -> dict[str, object]:
    return {key: value for key, value in row.items() if key != "mode"}


def restore_tree_metadata(root: pathlib.Path, snapshot: pathlib.Path) -> None:
    document = json.loads(snapshot.read_text())
    if (
        set(document) != {"schemaVersion", "artifactId", "root", "rows"}
        or document["schemaVersion"] != 1
        or document["artifactId"] != ARTIFACT_ID
        or document["root"] != str(root)
        or not isinstance(document["rows"], list)
    ):
        raise SystemExit("tree metadata snapshot disagreement")
    expected = document["rows"]
    observed = tree_rows(root)
    if [row_without_mode(row) for row in observed] != [
        row_without_mode(row) for row in expected
    ]:
        raise SystemExit("tree identity changed; metadata restore refused")
    for row in expected:
        path = root if row["path"] == "." else root / str(row["path"])
        if row["type"] == "symlink":
            continue
        path.chmod(int(row["mode"]))
    if tree_rows(root) != expected:
        raise SystemExit("tree metadata restoration disagreement")


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
                        if parent == run and stat.S_ISREG(child_info.st_mode):
                            if (child_info.st_uid, child_info.st_gid) != (
                                state_uid,
                                state_gid,
                            ):
                                raise SystemExit(
                                    f"top-level evidence is not state-owned: {child}"
                                )
                        if stat.S_ISDIR(child_info.st_mode):
                            stack.append(child)


def main() -> None:
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="command", required=True)
    for name in (
        "prepare-relocation",
        "move-relocation",
        "restore-relocation",
        "reconcile-relocation",
        "finalize-retained",
    ):
        operation = subparsers.add_parser(name)
        operation.add_argument("source", type=pathlib.Path)
        operation.add_argument("destination", type=pathlib.Path)
        operation.add_argument("manifest", type=pathlib.Path)
    snapshot_parser = subparsers.add_parser("snapshot-tree")
    snapshot_parser.add_argument("root", type=pathlib.Path)
    snapshot_parser.add_argument("output", type=pathlib.Path)
    restore_parser = subparsers.add_parser("restore-tree-metadata")
    restore_parser.add_argument("root", type=pathlib.Path)
    restore_parser.add_argument("snapshot", type=pathlib.Path)
    audit_parser = subparsers.add_parser("audit-runs")
    audit_parser.add_argument("runs_root", type=pathlib.Path)
    audit_parser.add_argument("state_uid", type=int)
    audit_parser.add_argument("state_gid", type=int)
    audit_parser.add_argument("execution_uid", type=int)
    audit_parser.add_argument("execution_gid", type=int)
    audit_parser.add_argument("upgrade_state", type=pathlib.Path)
    arguments = parser.parse_args()
    if arguments.command == "prepare-relocation":
        prepare_relocation(
            arguments.source.resolve(),
            arguments.destination.resolve(),
            arguments.manifest.resolve(),
        )
    elif arguments.command == "move-relocation":
        move_relocation(
            arguments.source.resolve(),
            arguments.destination.resolve(),
            arguments.manifest.resolve(),
        )
    elif arguments.command == "restore-relocation":
        restore_relocation(
            arguments.source.resolve(),
            arguments.destination.resolve(),
            arguments.manifest.resolve(),
        )
    elif arguments.command == "reconcile-relocation":
        reconcile_relocation(
            arguments.source.resolve(),
            arguments.destination.resolve(),
            arguments.manifest.resolve(),
        )
    elif arguments.command == "finalize-retained":
        finalize_retained(
            arguments.source.resolve(),
            arguments.destination.resolve(),
            arguments.manifest.resolve(),
        )
    elif arguments.command == "snapshot-tree":
        snapshot_tree(arguments.root.resolve(), arguments.output.resolve())
    elif arguments.command == "restore-tree-metadata":
        restore_tree_metadata(arguments.root.resolve(), arguments.snapshot.resolve())
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
