#!/usr/bin/env python3
"""Serialize the A03 child lifecycle before it can mutate installed state."""

from __future__ import annotations

import argparse
import fcntl
import os
import pathlib
import stat
import subprocess
import sys
import time


ACTIVE_EXIT = 75


def open_lock(path: pathlib.Path) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor = os.open(
        path,
        os.O_CREAT | os.O_RDWR | getattr(os, "O_NOFOLLOW", 0),
        0o600,
    )
    info = os.fstat(descriptor)
    if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1:
        os.close(descriptor)
        raise SystemExit("child lifecycle lock is not a single regular file")
    os.fchmod(descriptor, 0o600)
    return descriptor


def acquire(descriptor: int) -> bool:
    try:
        fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        return False
    return True


def probe(path: pathlib.Path) -> int:
    descriptor = open_lock(path)
    try:
        if not acquire(descriptor):
            return ACTIVE_EXIT
        fcntl.flock(descriptor, fcntl.LOCK_UN)
        return 0
    finally:
        os.close(descriptor)


def test_pause_before_pid() -> None:
    ready_text = os.environ.get("P00_V2_RECOVERY_TEST_CHILD_BEFORE_PID_READY")
    release_text = os.environ.get("P00_V2_RECOVERY_TEST_CHILD_BEFORE_PID_RELEASE")
    if not ready_text and not release_text:
        return
    if (
        not os.environ.get("P00_V2_TEST_ROOT")
        or os.geteuid() == 0
        or not ready_text
        or not release_text
    ):
        raise SystemExit("child pre-PID pause is restricted to non-root test mode")
    ready = pathlib.Path(ready_text)
    release = pathlib.Path(release_text)
    ready.parent.mkdir(parents=True, exist_ok=True)
    temporary = ready.with_name(ready.name + f".tmp.{os.getpid()}")
    temporary.write_text(f"{os.getpid()}\n")
    os.replace(temporary, ready)
    deadline = time.monotonic() + 30
    while not release.exists():
        if time.monotonic() >= deadline:
            raise SystemExit("timed out waiting for child pre-PID test release")
        time.sleep(0.01)


def run_child(arguments: argparse.Namespace) -> int:
    descriptor = open_lock(arguments.lock)
    if not acquire(descriptor):
        os.close(descriptor)
        return ACTIVE_EXIT
    try:
        test_pause_before_pid()
        subprocess.run(
            [
                "/usr/bin/python3",
                str(arguments.journal_tool),
                "set",
                str(arguments.journal),
                arguments.envelope,
                "CHILD_RUNNING",
                "--child-pid",
                str(os.getpid()),
                "--attempt-token",
                arguments.attempt_token,
            ],
            check=True,
        )
        completed = subprocess.run(
            [
                "/bin/zsh",
                str(arguments.installer),
                str(arguments.a03_root),
                arguments.a03_envelope,
            ],
            pass_fds=(descriptor,),
            check=False,
        )
        return completed.returncode
    finally:
        fcntl.flock(descriptor, fcntl.LOCK_UN)
        os.close(descriptor)


def run_snapshot(arguments: argparse.Namespace) -> int:
    descriptor = open_lock(arguments.lock)
    if not acquire(descriptor):
        os.close(descriptor)
        return ACTIVE_EXIT
    try:
        subprocess.run(
            [
                "/usr/bin/python3",
                str(arguments.journal_tool),
                "set",
                str(arguments.journal),
                arguments.envelope,
                "ROLLBACK_SNAPSHOTTING",
                "--child-pid",
                str(os.getpid()),
                "--attempt-token",
                arguments.attempt_token,
            ],
            check=True,
        )
        completed = subprocess.run(
            ["/usr/bin/ditto", str(arguments.source), str(arguments.destination)],
            pass_fds=(descriptor,),
            check=False,
        )
        return completed.returncode
    finally:
        fcntl.flock(descriptor, fcntl.LOCK_UN)
        os.close(descriptor)


def add_journal_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("lock", type=pathlib.Path)
    parser.add_argument("journal", type=pathlib.Path)
    parser.add_argument("envelope")
    parser.add_argument("attempt_token")
    parser.add_argument("journal_tool", type=pathlib.Path)


def main() -> int:
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="command", required=True)
    probe_parser = subparsers.add_parser("probe")
    probe_parser.add_argument("lock", type=pathlib.Path)
    runner = subparsers.add_parser("run")
    add_journal_arguments(runner)
    runner.add_argument("installer", type=pathlib.Path)
    runner.add_argument("a03_root", type=pathlib.Path)
    runner.add_argument("a03_envelope")
    snapshot = subparsers.add_parser("snapshot")
    add_journal_arguments(snapshot)
    snapshot.add_argument("source", type=pathlib.Path)
    snapshot.add_argument("destination", type=pathlib.Path)
    arguments = parser.parse_args()
    if arguments.command == "probe":
        return probe(arguments.lock.resolve())
    if arguments.command == "snapshot":
        return run_snapshot(arguments)
    return run_child(arguments)


if __name__ == "__main__":
    sys.exit(main())
