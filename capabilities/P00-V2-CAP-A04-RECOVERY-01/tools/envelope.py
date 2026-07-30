#!/usr/bin/env python3
"""Create and verify the immutable release envelope."""

from __future__ import annotations

import argparse
import hashlib
import json
import pathlib
import sys


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


def create(bundle: pathlib.Path, output: pathlib.Path) -> None:
    paths = {
        "expectedInstallManifest": bundle / "build/expected-install-manifest.json",
        "sudoers": bundle / "config/sudoers",
        "installer": bundle / "source/install.sh",
        "revokerSource": bundle / "source/revoke.sh",
        "registry": bundle / "config/capability-registry.json",
        "requestSchema": bundle / "config/request-schema.json",
        "requestWriter": bundle / "tools/write-request.py",
        "envelopeVerifier": bundle / "tools/envelope.py",
        "manifestVerifier": bundle / "tools/manifest.py",
        "activationReceiptTool": bundle / "tools/receipt.py",
        "activationJournalTool": bundle / "tools/journal.py",
        "installedStateAdmissionTool": bundle / "tools/admission.py",
        "quiescenceVerifier": bundle / "tools/quiesce.py",
        "renderedController": bundle / "build/Controller.swift",
        "controllerBinary": bundle / "build/controller",
        "nativeSelfTest": bundle / "build/native-self-test.json",
        "payloadArchive": bundle / "build/payload.tar.gz",
    }
    for label, path in paths.items():
        if not path.is_file():
            raise SystemExit(f"missing envelope input {label}: {path}")
    document = {
        "schemaVersion": 1,
        "artifactId": "P00-V2-CAP-A04",
        "approvedPacketSha": "02ee6ddec78d6e4ea9e2de3c0303ffd6bc9f45bf",
        "projectKey": "InterviewCopilot",
        "principal": {"user": "thirdfacedev", "uid": 501},
        "members": {
            label: {"path": path.relative_to(bundle).as_posix(), "sha256": sha256(path)}
            for label, path in sorted(paths.items())
        },
    }
    output.write_bytes(canonical(document))


def verify(bundle: pathlib.Path, envelope: pathlib.Path) -> None:
    document = json.loads(envelope.read_text())
    if set(document) != {
        "schemaVersion",
        "artifactId",
        "approvedPacketSha",
        "projectKey",
        "principal",
        "members",
    }:
        raise SystemExit("release envelope schema is not closed")
    if (
        document["schemaVersion"] != 1
        or document["artifactId"] != "P00-V2-CAP-A04"
        or document["approvedPacketSha"]
        != "02ee6ddec78d6e4ea9e2de3c0303ffd6bc9f45bf"
        or document["projectKey"] != "InterviewCopilot"
        or document["principal"] != {"user": "thirdfacedev", "uid": 501}
    ):
        raise SystemExit("release envelope identity disagreement")
    for label, entry in document["members"].items():
        if set(entry) != {"path", "sha256"}:
            raise SystemExit(f"release envelope member is not closed: {label}")
        path = (bundle / entry["path"]).resolve()
        if bundle.resolve() not in [path, *path.parents]:
            raise SystemExit(f"release envelope path escapes bundle: {label}")
        if not path.is_file() or sha256(path) != entry["sha256"]:
            raise SystemExit(f"release envelope hash disagreement: {label}")


def main() -> None:
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="command", required=True)
    creator = subparsers.add_parser("create")
    creator.add_argument("bundle", type=pathlib.Path)
    creator.add_argument("output", type=pathlib.Path)
    verifier = subparsers.add_parser("verify")
    verifier.add_argument("bundle", type=pathlib.Path)
    verifier.add_argument("envelope", type=pathlib.Path)
    args = parser.parse_args()
    if args.command == "create":
        create(args.bundle.resolve(), args.output.resolve())
    else:
        verify(args.bundle.resolve(), args.envelope.resolve())


if __name__ == "__main__":
    main()
