#!/usr/bin/env python3
"""Write one sanitized immutable recovery outcome receipt."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import pathlib
import tempfile


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


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", required=True, type=pathlib.Path)
    parser.add_argument("--artifact", required=True)
    parser.add_argument("--envelope", required=True)
    parser.add_argument("--status", required=True, choices=("SUCCESS", "FAILURE"))
    parser.add_argument("--exit-code", required=True, type=int)
    parser.add_argument("--checkpoint", required=True)
    parser.add_argument("--relocation", required=True)
    parser.add_argument("--candidate", required=True)
    parser.add_argument("--install-root", required=True, type=pathlib.Path)
    parser.add_argument("--sudoers", required=True, type=pathlib.Path)
    parser.add_argument("--stage", required=True, type=pathlib.Path)
    arguments = parser.parse_args()
    arguments.root.mkdir(parents=True, mode=0o755)
    arguments.root.chmod(0o755)
    target = arguments.root / f"{arguments.artifact}.json"
    if target.exists():
        raise SystemExit("recovery receipt already exists")
    controller = arguments.install_root / "libexec/verify-phase-core"
    document = {
        "schemaVersion": 1,
        "artifactId": arguments.artifact,
        "envelopeSha256": arguments.envelope,
        "status": arguments.status,
        "exitCode": arguments.exit_code,
        "checkpoint": arguments.checkpoint,
        "relocation": arguments.relocation,
        "candidateRevision": arguments.candidate,
        "installedControllerSha256": sha256(controller)
        if controller.is_file()
        else None,
        "authorizationPresent": arguments.sudoers.exists(),
        "stagePresentAtReceipt": arguments.stage.exists(),
    }
    descriptor, temporary_name = tempfile.mkstemp(
        prefix=f".{arguments.artifact}.", dir=arguments.root
    )
    temporary = pathlib.Path(temporary_name)
    try:
        with os.fdopen(descriptor, "wb") as handle:
            handle.write(canonical(document))
            handle.flush()
            os.fsync(handle.fileno())
        temporary.chmod(0o444)
        os.rename(temporary, target)
    finally:
        temporary.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
