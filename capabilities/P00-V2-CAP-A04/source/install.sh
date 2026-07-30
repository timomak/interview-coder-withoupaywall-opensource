#!/bin/zsh
set -euo pipefail

[[ $# -eq 2 ]] || { print -u2 "usage: install.sh BUNDLE_ROOT APPROVED_ENVELOPE_SHA256"; exit 64; }
bundle_root=${1:A}
approved_envelope_sha=$2
test_root=${P00_V2_TEST_ROOT:-}
if [[ -n "$test_root" ]]; then
  [[ $EUID -ne 0 ]] || { print -u2 "test-root mode is forbidden to root"; exit 77; }
  test_root=${test_root:A}
  shared_root=$test_root/Users/Shared/InterviewCopilot
  sudoers_target=$test_root/etc/sudoers.d/interviewcopilot-verification-controller-a04
  receipt_owner=$EUID
  verify_options=(--allow-source-provenance)
  receipt_options=(--allow-provenance)
else
  [[ $EUID -eq 0 ]] || { print -u2 "live installation requires root"; exit 77; }
  shared_root=/Users/Shared/InterviewCopilot
  sudoers_target=/etc/sudoers.d/interviewcopilot-verification-controller-a04
  receipt_owner=0
  verify_options=(--require-uid 0)
  receipt_options=()
fi

controller_root=$shared_root/verification-controller-a04
install_root=$controller_root/payload
metadata_root=$controller_root/metadata/P00-V2-CAP-A04
request_root=$controller_root/requests/501
receipt_root=$shared_root/verification-controller-a04-receipts
receipt=$receipt_root/P00-V2-CAP-A04-activation.json
journal=$receipt_root/P00-V2-CAP-A04-activation.in-progress
legacy_root=$shared_root/verification-controller
legacy_controller=$legacy_root/v2/libexec/verify-phase-core
legacy_recovery_receipt=$legacy_root/recovery-receipts/P00-V2-CAP-A03-RECOVERY-03.json
legacy_sudoers=${sudoers_target:h}/interviewcopilot-verification-controller
staging_root=$shared_root/.verification-controller-a04-stage.$$
payload_archive=$bundle_root/build/payload.tar.gz
manifest=$bundle_root/build/expected-install-manifest.json
envelope=$bundle_root/build/release-envelope.json
sudoers_source=$bundle_root/config/sudoers
manifest_tool=$bundle_root/tools/manifest.py
envelope_tool=$bundle_root/tools/envelope.py
receipt_tool=$bundle_root/tools/receipt.py
expected_legacy_controller_sha=73eda1532baa3044cf4feb989d2ec58d15304c86c31a298ed3d73a1a75c7494d
expected_legacy_receipt_sha=5da6d108e0fde1583bc09ecef806d591847c2c26c69bef461c5813390d36f5b8

hash_file() { /usr/bin/shasum -a 256 "$1" | /usr/bin/awk '{print $1}'; }
legacy_preflight() {
  [[ -f "$legacy_controller" &&
      "$(hash_file "$legacy_controller")" == "$expected_legacy_controller_sha" ]] || {
    print -u2 "legacy A02 controller identity disagreement"; return 65
  }
  [[ -f "$legacy_recovery_receipt" &&
      "$(hash_file "$legacy_recovery_receipt")" == "$expected_legacy_receipt_sha" ]] || {
    print -u2 "legacy Recovery03 receipt identity disagreement"; return 65
  }
  [[ ! -e "$legacy_sudoers" ]] || {
    print -u2 "legacy authorization unexpectedly present"; return 65
  }
}
validate_installed_success() {
  [[ -d "$install_root" && -d "$metadata_root" && -f "$sudoers_target" ]] || return 1
  /usr/bin/python3 "$manifest_tool" verify "$install_root" "$manifest" "${verify_options[@]}" || return 1
  [[ "$(hash_file "$sudoers_target")" == "$expected_sudoers_sha" ]] || return 1
}
publish_receipt() {
  /bin/chmod -N "$receipt_root"
  /usr/bin/xattr -c "$receipt_root"
  /usr/bin/python3 "$receipt_tool" publish "$receipt" "$approved_envelope_sha" \
    --owner "$receipt_owner" --status "$1" --exit-code "$2" \
    --checkpoint "$3" --controller-sha "$4" "${receipt_options[@]}"
}
make_writable() {
  [[ -n "$test_root" && -e "$1" ]] || return 0
  /bin/chmod -R u+w "$1" 2>/dev/null || true
}

[[ "$approved_envelope_sha" != *[^a-f0-9]* && ${#approved_envelope_sha} -eq 64 ]] || {
  print -u2 "approved envelope SHA must be 64 lowercase hexadecimal characters"; exit 64
}
[[ -f "$envelope" && "$(hash_file "$envelope")" == "$approved_envelope_sha" ]] || {
  print -u2 "release envelope hash disagreement"; exit 65
}
/usr/bin/python3 "$envelope_tool" verify "$bundle_root" "$envelope"
legacy_preflight
expected_sudoers_sha=$(
  /usr/bin/python3 - "$envelope" <<'PY'
import json, sys
print(json.load(open(sys.argv[1]))["members"]["sudoers"]["sha256"])
PY
)
expected_controller_sha=$(
  /usr/bin/python3 - "$envelope" <<'PY'
import json, sys
print(json.load(open(sys.argv[1]))["members"]["controllerBinary"]["sha256"])
PY
)
[[ "$(hash_file "$sudoers_source")" == "$expected_sudoers_sha" ]] || {
  print -u2 "sudoers source hash disagreement"; exit 65
}
/usr/sbin/visudo -cf "$sudoers_source"

if [[ -e "$receipt" ]]; then
  receipt_status=$(/usr/bin/python3 "$receipt_tool" verify "$receipt" "$approved_envelope_sha" \
    --owner "$receipt_owner" "${receipt_options[@]}" |
    /usr/bin/python3 -c 'import json,sys; print(json.load(sys.stdin)["status"])')
  if [[ "$receipt_status" == SUCCESS ]] && validate_installed_success; then
    if [[ -e "$journal" && "$(<"$journal")" == "$approved_envelope_sha" ]]; then
      /bin/rm -f "$journal"
    fi
    print "P00-V2-CAP-A04 already installed exactly"
    exit 0
  fi
  print -u2 "terminal A04 receipt forbids reuse or installed state disagrees"
  exit 65
fi

# A surviving journal is proof of an interrupted transaction. Recover only the
# fresh A04 namespace, then permanently close this artifact with FAILURE.
if [[ -e "$journal" ]]; then
  [[ "$(<"$journal")" == "$approved_envelope_sha" ]] || {
    print -u2 "activation journal identity disagreement"; exit 65
  }
  /bin/rm -f "$sudoers_target"
  make_writable "$controller_root"
  /bin/rm -rf "$controller_root"
  legacy_preflight
  publish_receipt FAILURE 92 crash_replay_rollback "$expected_controller_sha"
  /bin/rm -f "$journal"
  print -u2 "interrupted A04 transaction rolled back; artifact is terminal"
  exit 92
fi

[[ ! -e "$controller_root" && ! -e "$sudoers_target" && ! -e "$staging_root" ]] || {
  print -u2 "fresh A04 namespace or authorization already exists"; exit 73
}
if [[ -z "$test_root" ]]; then
  [[ "$(/usr/bin/id -u thirdfacedev)" == 501 ]] || { print -u2 "principal UID disagreement"; exit 78; }
  [[ "$(/usr/bin/id -u _interviewcopilotverify)" == 499 &&
      "$(/usr/bin/id -g _interviewcopilotverify)" == 499 ]] || {
    print -u2 "execution identity disagreement"; exit 78
  }
fi

/bin/mkdir -p "$receipt_root"
/bin/chmod 0711 "$receipt_root"
/bin/chmod -N "$receipt_root"
/usr/bin/xattr -c "$receipt_root"
[[ -n "$test_root" ]] || /usr/sbin/chown root:wheel "$receipt_root"
print -rn -- "$approved_envelope_sha" > "$journal"
/bin/chmod 0400 "$journal"
[[ -n "$test_root" ]] || /usr/sbin/chown root:wheel "$journal"
transaction_started=1
authorized=0
cleanup() {
  result=$?
  if (( result != 0 && transaction_started == 1 )); then
    /bin/rm -f "$sudoers_target"
    authorized=0
    make_writable "$controller_root"
    make_writable "$staging_root"
    /bin/rm -rf "$controller_root" "$staging_root"
    if legacy_preflight; then
      publish_receipt FAILURE "$result" install_rollback "$expected_controller_sha" || true
    fi
    /bin/rm -f "$journal"
  fi
}
trap cleanup EXIT

/bin/mkdir -p "$staging_root/payload"
COPYFILE_DISABLE=1 /usr/bin/tar -xzf "$payload_archive" --strip-components 1 \
  -C "$staging_root/payload"
/bin/chmod 0555 "$staging_root/payload"
if [[ -z "$test_root" ]]; then
  /usr/sbin/chown -R root:wheel "$staging_root"
  /usr/bin/xattr -cr "$staging_root"
fi
/usr/bin/python3 "$manifest_tool" verify "$staging_root/payload" "$manifest" "${verify_options[@]}"

/bin/mkdir -p "$install_root" "$controller_root/metadata" "$metadata_root" \
  "$controller_root/locks" "$controller_root/nonces" "$controller_root/requests" \
  "$request_root"
COPYFILE_DISABLE=1 /usr/bin/tar -xzf "$payload_archive" --strip-components 1 \
  -C "$install_root"
if [[ -z "$test_root" ]]; then
  /usr/sbin/chown -R root:wheel "$install_root"
  /usr/bin/xattr -cr "$install_root"
fi
/bin/chmod 0555 "$install_root"
/usr/bin/python3 "$manifest_tool" verify "$install_root" "$manifest" "${verify_options[@]}"
make_writable "$staging_root"
/bin/rm -rf "$staging_root"
for file in expected-install-manifest.json release-envelope.json; do
  source=$manifest
  [[ "$file" == release-envelope.json ]] && source=$envelope
  /usr/bin/install -m 0444 "$source" "$metadata_root/$file"
done
print -r -- "$approved_envelope_sha" > "$metadata_root/approved-envelope.sha256"
/bin/chmod 0444 "$metadata_root/approved-envelope.sha256"
if [[ -z "$test_root" ]]; then
  /usr/sbin/chown -R root:wheel "$controller_root"
  /usr/sbin/chown thirdfacedev:staff "$request_root"
  /usr/bin/xattr -cr "$controller_root"
fi
/usr/bin/python3 "$manifest_tool" verify "$install_root" \
  "$metadata_root/expected-install-manifest.json" "${verify_options[@]}"
P00_V2_SELF_TEST_TIMESTAMP=1970-01-01T00:00:00Z \
  "$install_root/libexec/controller-self-test" --self-test \
  --evidence "$metadata_root/installed-self-test.json"
/bin/chmod 0444 "$metadata_root/installed-self-test.json"
[[ -n "$test_root" ]] || /usr/sbin/chown root:wheel "$metadata_root/installed-self-test.json"
/bin/chmod 0755 "$controller_root"
/bin/chmod 0555 "$controller_root/metadata" "$metadata_root" "$controller_root/requests"
/bin/chmod 0700 "$controller_root/locks" "$controller_root/nonces"
/bin/chmod 0700 "$request_root"
legacy_preflight

/bin/mkdir -p "${sudoers_target:h}"
/usr/bin/install -m 0440 "$sudoers_source" "$sudoers_target"
[[ -n "$test_root" ]] || /usr/sbin/chown root:wheel "$sudoers_target"
authorized=1
[[ "$(hash_file "$sudoers_target")" == "$expected_sudoers_sha" ]] || exit 65
if [[ -n "$test_root" && "${P00_V2_TEST_HARD_STOP_AFTER_AUTH:-0}" == 1 ]]; then
  trap - EXIT
  print -u2 "injected hard stop after authorization"
  exit 92
fi
if [[ -n "$test_root" && "${P00_V2_TEST_FAIL_AFTER_AUTH:-0}" == 1 ]]; then
  print -u2 "injected failure after authorization"
  exit 91
fi

publish_receipt SUCCESS 0 installed "$expected_controller_sha"
/bin/rm -f "$journal"
transaction_started=0
trap - EXIT
legacy_preflight
validate_installed_success || exit 65
print "P00-V2-CAP-A04 installed exactly"
