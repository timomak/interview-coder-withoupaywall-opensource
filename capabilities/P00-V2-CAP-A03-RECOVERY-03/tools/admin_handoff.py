#!/usr/bin/env python3
"""Generate the literal one-shot administrator recovery command."""

from __future__ import annotations

import hashlib
import json
import pathlib
import shlex
import sys


def sha256(path: pathlib.Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: admin_handoff.py BUNDLE OUTPUT")
    bundle = pathlib.Path(sys.argv[1]).resolve()
    output = pathlib.Path(sys.argv[2]).resolve()
    envelope_path = bundle / "build/release-envelope.json"
    envelope = json.loads(envelope_path.read_text())
    envelope_sha = sha256(envelope_path)
    stage = (
        "/Users/Shared/InterviewCopilot/verification-controller-bootstrap/"
        + envelope_sha
    )
    journal_root = (
        "/Users/Shared/InterviewCopilot/verification-controller/recovery-journals"
    )
    lock_probe = (
        "import fcntl,os,sys;"
        "fd=os.open(sys.argv[1],os.O_CREAT|os.O_RDWR|"
        "getattr(os,'O_NOFOLLOW',0),0o600);"
        "fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)"
    )
    lines = [
        "set -euo pipefail",
        "umask 077",
        f"source_root={shlex.quote(str(bundle))}",
        f"stage={shlex.quote(stage)}",
        f"journal_root={shlex.quote(journal_root)}",
        # Replays remove the dedicated authorization before any other
        # reconciliation. The exact staged recovery state machine determines
        # whether to restore A02 or finalize A03.
        '/bin/rm -f "/etc/sudoers.d/interviewcopilot-verification-controller"',
        '/bin/mkdir -p "$journal_root"',
        '/usr/bin/python3 -c '
        + shlex.quote(lock_probe)
        + ' "$journal_root/P00-V2-CAP-A03-RECOVERY-03.child.lock"',
        '/usr/bin/python3 -c '
        + shlex.quote(lock_probe)
        + ' "$journal_root/P00-V2-CAP-A03-RECOVERY-03.snapshot.lock"',
        'if [[ -e "$stage" ]]; then',
        '  [[ -d "$stage" && ! -L "$stage" ]]',
        '  /bin/chmod -R u+w "$stage" 2>/dev/null || true',
        '  /bin/rm -rf "$stage"',
        "fi",
        "stage_created=0",
        "cleanup() {",
        "  result=$?",
        "  trap - EXIT",
        "  if (( stage_created == 1 )); then",
        '    /bin/chmod -R u+w "$stage" 2>/dev/null || true',
        '    /bin/rm -rf "$stage"',
        "  fi",
        '  exit "$result"',
        "}",
        "trap cleanup EXIT",
        '/bin/mkdir -p "$stage"',
        "stage_created=1",
    ]
    for relative in [*sorted(envelope["members"]), "build/release-envelope.json"]:
        parent = pathlib.PurePosixPath(relative).parent.as_posix()
        if parent != ".":
            lines.append(f'/bin/mkdir -p "$stage/{parent}"')
        lines.append(
            f'/usr/bin/install -m 0444 "$source_root/{relative}" "$stage/{relative}"'
        )
    lines.extend(
        [
            '/bin/chmod 0555 "$stage/source/recover.sh"',
            '/usr/sbin/chown -R root:wheel "$stage"',
            '/usr/bin/xattr -cr "$stage"',
        ]
    )
    for relative in [
        "source/recover.sh",
        "tools/envelope.py",
        "tools/run_state.py",
        "tools/journal.py",
        "tools/receipt.py",
        "tools/child_runner.py",
        "tools/a03_state.py",
        "vendor/a02/config/sudoers",
        "vendor/a03/source/install.sh",
        "vendor/a03/build/release-envelope.json",
        "build/release-envelope.json",
    ]:
        lines.append(
            f'[[ "$(/usr/bin/shasum -a 256 "$stage/{relative}" '
            f'| /usr/bin/awk \'{{print $1}}\')" == "{sha256(bundle / relative)}" ]]'
        )
    lines.extend(
        [
            '/usr/bin/python3 "$stage/tools/envelope.py" verify "$stage" '
            '"$stage/build/release-envelope.json"',
            "stage_created=0",
            "trap - EXIT",
            'exec "$stage/source/recover.sh" "$stage" '
            f'"{envelope_sha}"',
        ]
    )
    command = "/usr/bin/sudo /bin/zsh -c " + shlex.quote("\n".join(lines)) + "\n"
    output.write_text(command)


if __name__ == "__main__":
    main()
