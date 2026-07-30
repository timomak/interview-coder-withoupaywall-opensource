#!/usr/bin/env python3
"""Fail closed unless every controller phase is quiescent.

Authorization and the revocation-in-progress marker are established by the
caller before this verifier runs. The verifier holds every phase lock while it
checks for controller processes a second time, closing the gap between process
inspection and lock acquisition.
"""

from __future__ import annotations

import argparse
import fcntl
import os
import pathlib
import subprocess
import sys
import time


PHASES = ("P01",)


def controller_processes(install_root: pathlib.Path) -> list[str]:
    result = subprocess.run(
        ["/bin/ps", "-axo", "pid=,uid=,command="],
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    commands = (
        str(install_root / "bin/arm-phase"),
        str(install_root / "bin/verify-phase"),
        str(install_root / "libexec/arm-phase-core"),
        str(install_root / "libexec/verify-phase-core"),
    )
    matches = []
    for line in result.stdout.splitlines():
        fields = line.strip().split(maxsplit=2)
        if len(fields) != 3:
            continue
        if any(command in fields[2] for command in commands):
            matches.append(line.strip())
    return matches


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--hold-ready", type=pathlib.Path)
    parser.add_argument("--hold-release", type=pathlib.Path)
    parser.add_argument("--parent-pid", type=int)
    parser.add_argument("controller_root", type=pathlib.Path)
    parser.add_argument("install_root", type=pathlib.Path)
    arguments = parser.parse_args()
    hold_values = (
        arguments.hold_ready,
        arguments.hold_release,
        arguments.parent_pid,
    )
    if any(value is not None for value in hold_values) and not all(
        value is not None for value in hold_values
    ):
        raise SystemExit("hold mode requires ready, release, and parent PID")
    locks_root = arguments.controller_root / "locks"
    locks_root.mkdir(parents=True, exist_ok=True)

    if controller_processes(arguments.install_root):
        raise SystemExit("active controller process detected before lock acquisition")

    descriptors: list[int] = []
    try:
        for phase in PHASES:
            lock_path = locks_root / f"{phase}-local.lock"
            descriptor = os.open(lock_path, os.O_RDWR | os.O_CREAT, 0o600)
            try:
                fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                os.close(descriptor)
                raise SystemExit(f"active controller lock detected for {phase}")
            descriptors.append(descriptor)
        if controller_processes(arguments.install_root):
            raise SystemExit("active controller process detected after lock acquisition")
        if arguments.hold_ready is not None:
            ready_descriptor = os.open(
                arguments.hold_ready,
                os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                0o400,
            )
            try:
                os.write(ready_descriptor, b"ready\n")
                os.fsync(ready_descriptor)
            finally:
                os.close(ready_descriptor)
            while not arguments.hold_release.exists():
                try:
                    os.kill(arguments.parent_pid, 0)
                except ProcessLookupError:
                    raise SystemExit("upgrade parent exited before quiescence release")
                time.sleep(0.05)
    finally:
        for descriptor in descriptors:
            os.close(descriptor)
    return 0


if __name__ == "__main__":
    sys.exit(main())
