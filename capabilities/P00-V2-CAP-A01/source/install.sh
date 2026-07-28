#!/bin/zsh
set -euo pipefail

if [[ $# -ne 2 ]]; then
  print -u2 "usage: install.sh BUNDLE_ROOT APPROVED_ENVELOPE_SHA256"
  exit 64
fi

bundle_root=${1:A}
approved_envelope_sha=$2
test_root=${P00_V2_TEST_ROOT:-}
if [[ -n "$test_root" ]]; then
  [[ $EUID -ne 0 ]] || {
    print -u2 "test-root mode is forbidden to root"
    exit 77
  }
  test_root=${test_root:A}
  shared_root=$test_root/Users/Shared/InterviewCopilot
  sudoers_target=$test_root/etc/sudoers.d/interviewcopilot-verification-controller
  verify_options=(--allow-source-provenance)
else
  [[ $EUID -eq 0 ]] || {
    print -u2 "live installation requires root"
    exit 77
  }
  shared_root=/Users/Shared/InterviewCopilot
  sudoers_target=/etc/sudoers.d/interviewcopilot-verification-controller
  verify_options=(--require-uid 0)
fi

controller_root=$shared_root/verification-controller
install_root=$controller_root/v2
legacy_root=$controller_root/v1
metadata_root=$controller_root/metadata/P00-V2-CAP-A01
staging_root=$shared_root/.verification-controller-v2-stage.$$
legacy_sudoers_quarantine=$controller_root/quarantine/v1-sudoers
payload_archive=$bundle_root/build/payload.tar.gz
manifest=$bundle_root/build/expected-install-manifest.json
legacy_manifest=$bundle_root/build/legacy-v1-observed-manifest.json
envelope=$bundle_root/build/release-envelope.json
sudoers_source=$bundle_root/config/sudoers
manifest_tool=$bundle_root/tools/manifest.py
envelope_tool=$bundle_root/tools/envelope.py

hash_file() {
  /usr/bin/shasum -a 256 "$1" | /usr/bin/awk '{print $1}'
}

[[ "$approved_envelope_sha" != *[^a-f0-9]* ]] || {
  print -u2 "approved envelope SHA must be lowercase hexadecimal"
  exit 64
}
[[ ${#approved_envelope_sha} -eq 64 ]] || {
  print -u2 "approved envelope SHA must have 64 characters"
  exit 64
}
[[ -f "$envelope" && "$(hash_file "$envelope")" == "$approved_envelope_sha" ]] || {
  print -u2 "release envelope hash disagreement"
  exit 65
}

/usr/bin/python3 "$envelope_tool" verify "$bundle_root" "$envelope"
[[ -f "$legacy_manifest" ]] || {
  print -u2 "missing exact legacy-v1 observed manifest"
  exit 66
}

if [[ -z "$test_root" ]]; then
  [[ "$(/usr/bin/id -u thirdfacedev)" == 501 ]] || {
    print -u2 "principal UID disagreement"
    exit 78
  }
  [[ "$(/usr/bin/id -u _interviewcopilotverify)" == 499 &&
      "$(/usr/bin/id -g _interviewcopilotverify)" == 499 ]] || {
    print -u2 "execution identity disagreement"
    exit 78
  }
fi

[[ -d "$legacy_root" ]] || {
  print -u2 "quarantined v1 root is absent"
  exit 66
}
/usr/bin/python3 "$manifest_tool" verify "$legacy_root" "$legacy_manifest" "${verify_options[@]}"
[[ ! -e "$install_root" && ! -e "$staging_root" && ! -e "$metadata_root" ]] || {
  print -u2 "v2 install, stage, or metadata already exists"
  exit 73
}

/bin/mkdir -p "$staging_root" "${sudoers_target:h}" "${legacy_sudoers_quarantine:h}"
/bin/mkdir -p "$staging_root/v2"
COPYFILE_DISABLE=1 /usr/bin/tar -xzf "$payload_archive" \
  --strip-components 1 -C "$staging_root/v2"
/bin/chmod 0555 "$staging_root/v2"
if [[ -z "$test_root" ]]; then
  /usr/sbin/chown -R root:wheel "$staging_root"
  /usr/bin/xattr -cr "$staging_root"
fi
/usr/bin/python3 "$manifest_tool" verify "$staging_root/v2" "$manifest" "${verify_options[@]}"

expected_sudoers_sha=$(
  /usr/bin/python3 - "$envelope" <<'PY'
import json, sys
print(json.load(open(sys.argv[1]))["members"]["sudoers"]["sha256"])
PY
)
[[ "$(hash_file "$sudoers_source")" == "$expected_sudoers_sha" ]] || {
  print -u2 "sudoers source hash disagreement"
  exit 65
}
/usr/sbin/visudo -cf "$sudoers_source"

activated=0
new_sudoers=0
legacy_rule_removed=0
created_state=()
test_make_writable() {
  [[ -n "$test_root" && -e "$1" ]] || return 0
  /bin/chmod -R u+w "$1" 2>/dev/null || true
}
cleanup() {
  local result=$?
  if (( result != 0 )); then
    test_make_writable "$install_root"
    test_make_writable "$staging_root"
    test_make_writable "$metadata_root"
    (( new_sudoers == 0 )) || /bin/rm -f "$sudoers_target"
    (( activated == 0 )) || /bin/rm -rf "$install_root"
    /bin/rm -rf "$staging_root" "$metadata_root"
    for (( index=${#created_state}; index>=1; index-- )); do
      /bin/rmdir "$created_state[$index]" 2>/dev/null || true
    done
    if (( legacy_rule_removed == 1 )); then
      print -u2 "installation rolled back; legacy wildcard authorization remains removed"
    fi
  fi
}
trap cleanup EXIT

if [[ -e "$sudoers_target" ]]; then
  legacy_sudoers_sha=$(hash_file "$sudoers_target")
  [[ "$legacy_sudoers_sha" == 902587eff89ddce72887aba63afcd7687ee33b8f0cbabd21f51f6f47d6e6f056 ]] || {
    print -u2 "installed legacy sudoers identity disagreement"
    exit 65
  }
  /usr/bin/install -m 0400 "$sudoers_target" "$legacy_sudoers_quarantine"
  [[ -n "$test_root" ]] || /usr/sbin/chown root:wheel "$legacy_sudoers_quarantine"
  /bin/rm -f "$sudoers_target"
  legacy_rule_removed=1
fi
if [[ -n "$test_root" && "${P00_V2_TEST_FAIL_AFTER_AUTH_REMOVAL:-0}" == 1 ]]; then
  print -u2 "injected test failure after legacy authorization removal"
  exit 91
fi

if [[ -n "$test_root" ]]; then
  # com.apple.provenance prevents a non-root cross-directory rename even in a
  # disposable root. Copy for simulation; the live root transaction still
  # uses the atomic rename below. Both paths receive the same final manifest
  # verification before authorization.
  /usr/bin/ditto "$staging_root/v2" "$install_root"
  test_make_writable "$staging_root"
  /bin/rm -rf "$staging_root"
else
  /bin/mv "$staging_root/v2" "$install_root"
  /bin/rmdir "$staging_root"
fi
activated=1

/bin/mkdir -p "$metadata_root"
/usr/bin/install -m 0444 "$manifest" "$metadata_root/expected-install-manifest.json"
/usr/bin/install -m 0444 "$legacy_manifest" "$metadata_root/legacy-v1-observed-manifest.json"
/usr/bin/install -m 0444 "$envelope" "$metadata_root/release-envelope.json"
print -r -- "$approved_envelope_sha" > "$metadata_root/approved-envelope.sha256"
/bin/chmod 0444 "$metadata_root/approved-envelope.sha256"
if [[ -z "$test_root" ]]; then
  /usr/sbin/chown -R root:wheel "$metadata_root"
fi

state_paths=(
  "$controller_root/objects"
  "$controller_root/anchors"
  "$controller_root/anchors/active"
  "$controller_root/runs"
  "$controller_root/locks"
  "$controller_root/nonces"
  "$controller_root/requests"
  "$controller_root/requests/501"
)
for state_path in "${state_paths[@]}"; do
  [[ -e "$state_path" ]] || created_state+=("$state_path")
done
/bin/mkdir -p "${state_paths[@]}"
if [[ -z "$test_root" ]]; then
  /usr/sbin/chown -R root:wheel "$controller_root/objects" \
    "$controller_root/anchors" "$controller_root/runs" "$controller_root/locks" \
    "$controller_root/nonces" "$controller_root/requests"
  /usr/sbin/chown thirdfacedev:staff "$controller_root/requests/501"
fi
/bin/chmod 0700 "$controller_root/objects" "$controller_root/anchors" \
  "$controller_root/anchors/active" "$controller_root/runs" \
  "$controller_root/locks" "$controller_root/nonces" "$controller_root/requests/501"
/bin/chmod 0711 "$controller_root/requests"
if [[ -z "$test_root" ]]; then
  /usr/bin/xattr -cr "$controller_root/requests/501"
fi

/usr/bin/python3 "$manifest_tool" verify "$install_root" \
  "$metadata_root/expected-install-manifest.json" "${verify_options[@]}"

"$install_root/libexec/controller-self-test" --self-test \
  --evidence "$metadata_root/installed-self-test.json"
if [[ -z "$test_root" ]]; then
  /usr/sbin/chown root:wheel "$metadata_root/installed-self-test.json"
fi
/bin/chmod 0444 "$metadata_root/installed-self-test.json"

# Authorization is the last activation step: staged bytes, copied bytes,
# metadata, state ownership, strict installed-tree verification, and the
# native self-test have all completed before this rule can exist.
/usr/bin/install -m 0440 "$sudoers_source" "$sudoers_target"
[[ -n "$test_root" ]] || /usr/sbin/chown root:wheel "$sudoers_target"
new_sudoers=1
/usr/sbin/visudo -cf "$sudoers_target"
[[ "$(hash_file "$sudoers_target")" == "$expected_sudoers_sha" ]] || {
  print -u2 "installed sudoers hash disagreement"
  exit 65
}
if [[ -n "$test_root" && "${P00_V2_TEST_FAIL_AFTER_NEW_AUTHORIZATION:-0}" == 1 ]]; then
  print -u2 "injected test failure after new authorization activation"
  exit 92
fi

print "installed P00-V2-CAP-A01 with exact empty-argument authorization"
