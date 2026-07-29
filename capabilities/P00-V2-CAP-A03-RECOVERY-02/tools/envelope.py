#!/usr/bin/env python3
"""Create and verify the closed one-shot A02-to-A03 recovery envelope."""

from __future__ import annotations

import argparse
import hashlib
import json
import pathlib


ARTIFACT_ID = "P00-V2-CAP-A03-RECOVERY-02"
PACKET_SHA = "02ee6ddec78d6e4ea9e2de3c0303ffd6bc9f45bf"
MEMBER_ROOTS = ("source", "tools", "vendor")


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


def observed_members(bundle: pathlib.Path) -> dict[str, dict[str, str]]:
    members: dict[str, dict[str, str]] = {}
    for root_name in MEMBER_ROOTS:
        root = bundle / root_name
        if not root.is_dir():
            raise SystemExit(f"missing recovery member root: {root_name}")
        for path in sorted(root.rglob("*")):
            if path.is_symlink() or (not path.is_file() and not path.is_dir()):
                raise SystemExit(f"unsupported recovery member: {path}")
            if path.is_file():
                relative = path.relative_to(bundle).as_posix()
                members[relative] = {"sha256": sha256(path)}
    return members


def create(bundle: pathlib.Path, output: pathlib.Path) -> None:
    document = {
        "schemaVersion": 1,
        "artifactId": ARTIFACT_ID,
        "approvedPacketSha": PACKET_SHA,
        "projectKey": "InterviewCopilot",
        "principal": {"user": "thirdfacedev", "uid": 501},
        "predecessor": {
            "capability": "P00-V2-CAP-A02",
            "authorization": "ABSENT",
            "manifestSha256": "945ffda713b5e9a02d2472d6f4e9e91340111384a6cdeab40890a5f3b572768b",
        },
        "target": {
            "capability": "P00-V2-CAP-A03",
            "envelopeSha256": "00ea8696be7af50cfadd9035f9d7b44cb9d560b96c1f563c9ded0f6197a1af41",
            "manifestSha256": "d94f06f0d6f585ed6ce368cfc933e5ec4fe4c9914621a39ce2544baa97f0ad39",
        },
        "recoveryState": {
            "candidateRevision": "2e5045116db6e3c5f6e6cc18b70df6d7fa021baf",
            "historicalDependencyTree": (
                "/Users/Shared/InterviewCopilot/verification-controller/runs/"
                "1ff0881b9bd59f243146c93b6709be57d58ee17a/P01/"
                "70acd85a0202cc85f65e176a995a248f/repo/node_modules"
            ),
            "quarantine": (
                "/Users/Shared/InterviewCopilot/verification-controller/quarantine/"
                "P00-V2-CAP-A03-RECOVERY-02/"
                "1ff0881b9bd59f243146c93b6709be57d58ee17a-P01-"
                "70acd85a0202cc85f65e176a995a248f-repo-node_modules"
            ),
            "receipt": (
                "/Users/Shared/InterviewCopilot/verification-controller/"
                "recovery-receipts/P00-V2-CAP-A03-RECOVERY-02.json"
            ),
        },
        "members": observed_members(bundle),
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
        "predecessor",
        "target",
        "recoveryState",
        "members",
    }:
        raise SystemExit("recovery envelope schema is not closed")
    if (
        document["schemaVersion"] != 1
        or document["artifactId"] != ARTIFACT_ID
        or document["approvedPacketSha"] != PACKET_SHA
        or document["projectKey"] != "InterviewCopilot"
        or document["principal"] != {"user": "thirdfacedev", "uid": 501}
        or document["predecessor"]
        != {
            "capability": "P00-V2-CAP-A02",
            "authorization": "ABSENT",
            "manifestSha256": "945ffda713b5e9a02d2472d6f4e9e91340111384a6cdeab40890a5f3b572768b",
        }
        or document["target"]
        != {
            "capability": "P00-V2-CAP-A03",
            "envelopeSha256": "00ea8696be7af50cfadd9035f9d7b44cb9d560b96c1f563c9ded0f6197a1af41",
            "manifestSha256": "d94f06f0d6f585ed6ce368cfc933e5ec4fe4c9914621a39ce2544baa97f0ad39",
        }
        or document["recoveryState"]
        != {
            "candidateRevision": "2e5045116db6e3c5f6e6cc18b70df6d7fa021baf",
            "historicalDependencyTree": (
                "/Users/Shared/InterviewCopilot/verification-controller/runs/"
                "1ff0881b9bd59f243146c93b6709be57d58ee17a/P01/"
                "70acd85a0202cc85f65e176a995a248f/repo/node_modules"
            ),
            "quarantine": (
                "/Users/Shared/InterviewCopilot/verification-controller/quarantine/"
                "P00-V2-CAP-A03-RECOVERY-02/"
                "1ff0881b9bd59f243146c93b6709be57d58ee17a-P01-"
                "70acd85a0202cc85f65e176a995a248f-repo-node_modules"
            ),
            "receipt": (
                "/Users/Shared/InterviewCopilot/verification-controller/"
                "recovery-receipts/P00-V2-CAP-A03-RECOVERY-02.json"
            ),
        }
    ):
        raise SystemExit("recovery envelope identity disagreement")
    observed = observed_members(bundle)
    if document["members"] != observed:
        raise SystemExit("recovery envelope member set or hash disagreement")


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
