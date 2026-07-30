#!/usr/bin/env python3
"""Closed installed-state admission for the A04 privileged capability."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import pathlib
import stat
import subprocess
from typing import Any

ARTIFACT = "P00-V2-CAP-A04"
CANDIDATE = "2e5045116db6e3c5f6e6cc18b70df6d7fa021baf"
PACKET = "02ee6ddec78d6e4ea9e2de3c0303ffd6bc9f45bf"


def sha256(path: pathlib.Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def canonical(value: Any) -> bytes:
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


def facts(
    path: pathlib.Path,
    kind: str,
    mode: int,
    owner: int,
    group: int,
    allow_provenance: bool,
    expected_sha: str | None = None,
    owner_role: str = "root",
) -> dict[str, Any]:
    info = path.lstat()
    expected_kind = stat.S_ISDIR(info.st_mode) if kind == "directory" else stat.S_ISREG(info.st_mode)
    allowed = {"com.apple.provenance"} if allow_provenance else set()
    if (
        not expected_kind
        or path.is_symlink()
        or info.st_uid != owner
        or info.st_gid != group
        or stat.S_IMODE(info.st_mode) != mode
        or not acl_free(path)
        or not xattrs(path).issubset(allowed)
    ):
        raise SystemExit(f"installed-state filesystem disagreement: {path}")
    result: dict[str, Any] = {
        "kind": kind,
        "mode": f"{mode:04o}",
        "ownerRole": owner_role,
        "acl": False,
        "xattrs": [],
    }
    if kind == "file":
        if info.st_nlink != 1:
            raise SystemExit(f"installed-state link disagreement: {path}")
        observed_sha = sha256(path)
        if expected_sha is not None and observed_sha != expected_sha:
            raise SystemExit(f"installed-state hash disagreement: {path}")
        result.update({"bytes": info.st_size, "sha256": observed_sha, "linkCount": 1})
    return result


def envelope_contract(
    envelope_path: pathlib.Path, envelope_sha: str, controller_sha: str
) -> dict[str, Any]:
    if sha256(envelope_path) != envelope_sha:
        raise SystemExit("installed release envelope hash disagreement")
    envelope = json.loads(envelope_path.read_text())
    if (
        set(envelope) != {
            "schemaVersion", "artifactId", "approvedPacketSha", "projectKey",
            "principal", "members",
        }
        or envelope["schemaVersion"] != 1
        or envelope["artifactId"] != ARTIFACT
        or envelope["approvedPacketSha"] != PACKET
        or envelope["projectKey"] != "InterviewCopilot"
        or envelope["principal"] != {"user": "thirdfacedev", "uid": 501}
        or envelope["members"]["controllerBinary"]["sha256"] != controller_sha
    ):
        raise SystemExit("installed release envelope identity disagreement")
    return envelope


def manifest_entry(manifest: dict[str, Any], relative: str) -> dict[str, Any]:
    matches = [
        entry for entry in manifest["members"]
        if entry.get("path") == relative and entry.get("kind") == "file"
    ]
    if len(matches) != 1:
        raise SystemExit(f"payload manifest member disagreement: {relative}")
    return matches[0]


def context(args: argparse.Namespace) -> dict[str, Any]:
    root = args.controller_root.resolve()
    install = root / "payload"
    metadata_parent = root / "metadata"
    metadata = metadata_parent / ARTIFACT
    receipt_root = args.receipt_root.resolve()
    envelope_path = metadata / "release-envelope.json"
    manifest_path = metadata / "expected-install-manifest.json"
    self_test = metadata / "installed-self-test.json"
    approved = metadata / "approved-envelope.sha256"
    envelope = envelope_contract(envelope_path, args.envelope, args.controller_sha)
    expected_manifest_sha = envelope["members"]["expectedInstallManifest"]["sha256"]
    if sha256(manifest_path) != expected_manifest_sha:
        raise SystemExit("installed manifest bytes disagree with envelope")
    manifest = json.loads(manifest_path.read_text())
    manifest_tool = install / "libexec/manifest.py"
    receipt_tool = install / "libexec/receipt.py"
    admission_tool = install / "libexec/admission.py"
    journal_tool = install / "libexec/journal.py"
    for path, relative in [
        (manifest_tool, "libexec/manifest.py"),
        (receipt_tool, "libexec/receipt.py"),
        (admission_tool, "libexec/admission.py"),
        (journal_tool, "libexec/journal.py"),
    ]:
        if sha256(path) != manifest_entry(manifest, relative)["sha256"]:
            raise SystemExit(f"installed bootstrap tool disagreement: {relative}")
    verify_command = [
        "/usr/bin/python3", str(manifest_tool), "verify", str(install),
        str(manifest_path),
    ]
    if args.allow_provenance:
        verify_command.append("--allow-source-provenance")
    else:
        verify_command.extend(["--require-uid", str(args.root_owner)])
    subprocess.run(verify_command, check=True)
    if approved.read_bytes() != (args.envelope + "\n").encode():
        raise SystemExit("approved envelope metadata bytes disagreement")
    expected_self_test_sha = envelope["members"]["nativeSelfTest"]["sha256"]
    entries = {
        "controllerRoot": facts(
            root, "directory", 0o755, args.root_owner, args.root_group,
            args.allow_provenance,
        ),
        "installRoot": facts(
            install, "directory", 0o555, args.root_owner, args.root_group,
            args.allow_provenance,
        ),
        "metadataParent": facts(
            metadata_parent, "directory", 0o555, args.root_owner, args.root_group,
            args.allow_provenance,
        ),
        "metadataRoot": facts(
            metadata, "directory", 0o555, args.root_owner, args.root_group,
            args.allow_provenance,
        ),
        "locksRoot": facts(
            root / "locks", "directory", 0o700, args.root_owner, args.root_group,
            args.allow_provenance,
        ),
        "noncesRoot": facts(
            root / "nonces", "directory", 0o700, args.root_owner, args.root_group,
            args.allow_provenance,
        ),
        "requestsRoot": facts(
            root / "requests", "directory", 0o555, args.root_owner, args.root_group,
            args.allow_provenance,
        ),
        "principalRequestRoot": facts(
            root / "requests/501", "directory", 0o700,
            args.request_owner, args.request_group, args.allow_provenance,
            owner_role="request",
        ),
        "expectedInstallManifest": facts(
            manifest_path, "file", 0o444, args.root_owner, args.root_group,
            args.allow_provenance, expected_manifest_sha,
        ),
        "releaseEnvelope": facts(
            envelope_path, "file", 0o444, args.root_owner, args.root_group,
            args.allow_provenance, args.envelope,
        ),
        "approvedEnvelope": facts(
            approved, "file", 0o444, args.root_owner, args.root_group,
            args.allow_provenance, hashlib.sha256((args.envelope + "\n").encode()).hexdigest(),
        ),
        "installedSelfTest": facts(
            self_test, "file", 0o444, args.root_owner, args.root_group,
            args.allow_provenance, expected_self_test_sha,
        ),
    }
    metadata_members = sorted(path.name for path in metadata.iterdir())
    if metadata_members != [
        "approved-envelope.sha256", "expected-install-manifest.json",
        "installed-self-test.json", "release-envelope.json",
    ]:
        raise SystemExit("installed metadata member set disagreement")
    return {
        "root": root, "install": install, "metadata": metadata,
        "receipt_root": receipt_root, "receipt_tool": receipt_tool,
        "journal": receipt_root / f"{ARTIFACT}-activation.in-progress",
        "receipt": receipt_root / f"{ARTIFACT}-activation.json",
        "state": receipt_root / f"{ARTIFACT}-installed-state.json",
        "envelope": envelope, "entries": entries,
    }


def state_document(args: argparse.Namespace, value: dict[str, Any]) -> dict[str, Any]:
    sudoers_sha = value["envelope"]["members"]["sudoers"]["sha256"]
    entries = dict(value["entries"])
    entries["sudoers"] = facts(
        args.sudoers, "file", 0o440, args.root_owner, args.root_group,
        args.allow_provenance, sudoers_sha,
    )
    return {
        "schemaVersion": 1,
        "artifactId": ARTIFACT,
        "candidateRevision": CANDIDATE,
        "envelopeSha256": args.envelope,
        "installedControllerSha256": args.controller_sha,
        "entries": entries,
        "payloadVerification": {
            "manifestSha256": value["envelope"]["members"][
                "expectedInstallManifest"
            ]["sha256"],
            "closedTreeVerified": True,
        },
    }


def verify_state_file(
    args: argparse.Namespace, value: dict[str, Any], expected: dict[str, Any]
) -> str:
    state_path = value["state"]
    state_sha = sha256(state_path)
    facts(
        state_path, "file", 0o444, args.root_owner, args.root_group,
        args.allow_provenance, state_sha,
    )
    raw = state_path.read_bytes()
    if raw != canonical(expected) or json.loads(raw) != expected:
        raise SystemExit("installed-state manifest disagreement")
    return state_sha


def publish_state(args: argparse.Namespace, value: dict[str, Any]) -> str:
    expected = state_document(args, value)
    path = value["state"]
    descriptor = os.open(
        path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600
    )
    try:
        os.write(descriptor, canonical(expected))
        os.fsync(descriptor)
    finally:
        os.close(descriptor)
    subprocess.run(["/bin/chmod", "-N", str(path)], check=True)
    subprocess.run(["/usr/bin/xattr", "-c", str(path)], check=True)
    path.chmod(0o444)
    directory = os.open(path.parent, os.O_RDONLY)
    try:
        os.fsync(directory)
    finally:
        os.close(directory)
    return verify_state_file(args, value, expected)


def verify_receipt(
    args: argparse.Namespace, value: dict[str, Any], state_sha: str
) -> None:
    command = [
        "/usr/bin/python3", str(value["receipt_tool"]), "verify",
        str(value["receipt"]), args.envelope,
        "--expected-controller-sha", args.controller_sha,
        "--owner", str(args.root_owner),
        "--group", str(args.root_group),
    ]
    if args.allow_provenance:
        command.append("--allow-provenance")
    result = subprocess.run(command, text=True, capture_output=True, check=True)
    receipt = json.loads(result.stdout)
    if receipt["status"] != "SUCCESS" or receipt["installedStateSha256"] != state_sha:
        raise SystemExit("activation receipt installed-state binding disagreement")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "operation",
        choices=[
            "pre-authorization", "create-state", "verify-committing",
            "verify-success", "verify-revoking",
        ],
    )
    parser.add_argument("--controller-root", type=pathlib.Path, required=True)
    parser.add_argument("--receipt-root", type=pathlib.Path, required=True)
    parser.add_argument("--sudoers", type=pathlib.Path, required=True)
    parser.add_argument("--envelope", required=True)
    parser.add_argument("--controller-sha", required=True)
    parser.add_argument("--root-owner", type=int, required=True)
    parser.add_argument("--root-group", type=int, required=True)
    parser.add_argument("--request-owner", type=int, required=True)
    parser.add_argument("--request-group", type=int, required=True)
    parser.add_argument("--allow-provenance", action="store_true")
    args = parser.parse_args()
    value = context(args)
    if args.operation == "pre-authorization":
        if args.sudoers.exists() or value["state"].exists() or value["receipt"].exists():
            raise SystemExit("pre-authorization state is not fresh")
        print("A04 installed state is closed before authorization")
        return
    expected = state_document(args, value)
    if args.operation == "create-state":
        if not value["journal"].exists() or value["receipt"].exists():
            raise SystemExit("state publication requires journal and no receipt")
        print(publish_state(args, value))
        return
    state_sha = verify_state_file(args, value, expected)
    verify_receipt(args, value, state_sha)
    if args.operation == "verify-committing":
        if not value["journal"].exists():
            raise SystemExit("committing admission requires journal")
    elif value["journal"].exists():
        raise SystemExit("activation journal still exists")
    print(state_sha)


if __name__ == "__main__":
    main()
