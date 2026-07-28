#!/usr/bin/env python3
"""Generate the reviewed literal one-shot root bootstrap command."""

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
    members = sorted(entry["path"] for entry in envelope["members"].values())
    stage = (
        "/Users/Shared/InterviewCopilot/verification-controller-bootstrap/"
        + envelope_sha
    )
    lines = [
        "set -euo pipefail",
        "umask 077",
        f"source_root={shlex.quote(str(bundle))}",
        f"stage={shlex.quote(stage)}",
        '[[ ! -e "$stage" ]]',
        '/bin/mkdir -p "$stage"',
    ]
    for relative in [*members, "build/release-envelope.json"]:
        parent = pathlib.PurePosixPath(relative).parent.as_posix()
        if parent != ".":
            lines.append(f'/bin/mkdir -p "$stage/{parent}"')
        lines.append(
            f'/usr/bin/install -m 0444 "$source_root/{relative}" "$stage/{relative}"'
        )
    lines.extend(
        [
            '/bin/chmod 0555 "$stage/source/install.sh"',
            '/usr/sbin/chown -R root:wheel "$stage"',
            '/usr/bin/xattr -cr "$stage"',
        ]
    )
    critical = [
        "source/install.sh",
        "tools/envelope.py",
        "tools/manifest.py",
        "build/release-envelope.json",
        "build/payload.tar.gz",
    ]
    for relative in critical:
        lines.append(
            f'[[ "$(/usr/bin/shasum -a 256 "$stage/{relative}" '
            f'| /usr/bin/awk \'{{print $1}}\')" == "{sha256(bundle / relative)}" ]]'
        )
    lines.extend(
        [
            '/usr/bin/python3 "$stage/tools/envelope.py" verify "$stage" '
            '"$stage/build/release-envelope.json"',
            'exec "$stage/source/install.sh" "$stage" '
            f'"{envelope_sha}"',
        ]
    )
    command = "/usr/bin/sudo /bin/zsh -c " + shlex.quote("\n".join(lines)) + "\n"
    output.write_text(command)


if __name__ == "__main__":
    main()
