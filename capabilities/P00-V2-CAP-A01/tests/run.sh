#!/bin/zsh
set -euo pipefail

bundle_root=${0:A:h:h}

[[ -z "${P00_V2_TEST_ROOT:-}" ]] || {
  print -u2 "caller must not predefine P00_V2_TEST_ROOT"
  exit 64
}

/usr/bin/python3 -m unittest -v "$bundle_root/tests/test_bundle.py"
