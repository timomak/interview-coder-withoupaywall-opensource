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
  root_owner=$EUID
  root_group=$(/usr/bin/id -g)
  request_owner=$EUID
  request_group=$root_group
  provenance_options=(--allow-provenance)
  manifest_options=(--allow-source-provenance)
else
  [[ $EUID -eq 0 ]] || { print -u2 "live installation requires root"; exit 77; }
  shared_root=/Users/Shared/InterviewCopilot
  sudoers_target=/etc/sudoers.d/interviewcopilot-verification-controller-a04
  root_owner=0
  root_group=0
  request_owner=501
  request_group=20
  provenance_options=()
  manifest_options=(--require-uid 0)
fi

controller_root=$shared_root/verification-controller-a04
install_root=$controller_root/payload
metadata_root=$controller_root/metadata/P00-V2-CAP-A04
request_root=$controller_root/requests/501
receipt_root=$shared_root/verification-controller-a04-receipts
receipt=$receipt_root/P00-V2-CAP-A04-activation.json
journal=$receipt_root/P00-V2-CAP-A04-activation.in-progress
state_manifest=$receipt_root/P00-V2-CAP-A04-installed-state.json
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
journal_tool=$bundle_root/tools/journal.py
admission_tool=$bundle_root/tools/admission.py
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
make_writable() {
  [[ -n "$test_root" && -e "$1" ]] || return 0
  /bin/chmod -R u+w "$1" 2>/dev/null || true
}
journal_command() {
  /usr/bin/python3 "$journal_tool" "$1" "$journal" "$approved_envelope_sha" \
    --controller-sha "$expected_controller_sha" --owner "$root_owner" \
    --group "$root_group" "${provenance_options[@]}"
}
receipt_command() {
  /usr/bin/python3 "$receipt_tool" "$1" "$receipt" "$approved_envelope_sha" \
    --expected-controller-sha "$expected_controller_sha" --owner "$root_owner" \
    --group "$root_group" "${provenance_options[@]}" "${@:2}"
}
admission_command() {
  /usr/bin/python3 "$admission_tool" "$1" \
    --controller-root "$controller_root" --receipt-root "$receipt_root" \
    --sudoers "$sudoers_target" --envelope "$approved_envelope_sha" \
    --controller-sha "$expected_controller_sha" \
    --root-owner "$root_owner" --root-group "$root_group" \
    --request-owner "$request_owner" --request-group "$request_group" \
    "${provenance_options[@]}"
}
publish_receipt() {
  local receipt_status=$1
  local receipt_exit=$2
  local receipt_checkpoint=$3
  local state_sha=$4
  if [[ -n "$test_root" && "$receipt_status" == SUCCESS &&
        "${P00_V2_TEST_FAIL_SUCCESS_PUBLICATION:-0}" == 1 ]]; then
    print -u2 "injected SUCCESS publication failure"
    return 93
  fi
  if [[ -n "$test_root" && "$receipt_status" == FAILURE &&
        "${P00_V2_TEST_FAIL_FAILURE_PUBLICATION:-0}" == 1 ]]; then
    print -u2 "injected FAILURE publication failure"
    return 94
  fi
  receipt_command publish --status "$receipt_status" --exit-code "$receipt_exit" \
    --checkpoint "$receipt_checkpoint" --installed-state-sha "$state_sha"
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
  receipt_json=$(receipt_command verify)
  receipt_status=$(print -r -- "$receipt_json" |
    /usr/bin/python3 -c 'import json,sys; print(json.load(sys.stdin)["status"])')
  [[ "$receipt_status" == SUCCESS ]] || {
    print -u2 "terminal FAILURE receipt forbids A04 reuse"; exit 65
  }
  if [[ -e "$journal" ]]; then
    journal_command verify
    admission_command verify-committing >/dev/null
    journal_command remove
  fi
  admission_command verify-success >/dev/null
  legacy_preflight
  print "P00-V2-CAP-A04 already installed exactly"
  exit 0
fi

if [[ -e "$journal" ]]; then
  journal_command verify
  /bin/rm -f "$sudoers_target"
  make_writable "$controller_root"
  /bin/rm -rf "$controller_root"
  [[ ! -e "$state_manifest" ]] || {
    /bin/chmod u+w "$state_manifest" 2>/dev/null || true
    /bin/rm -f "$state_manifest"
  }
  legacy_preflight
  publish_receipt FAILURE 92 crash_replay_rollback ""
  journal_command remove
  print -u2 "interrupted A04 transaction rolled back; artifact is terminal"
  exit 92
fi

[[ ! -e "$controller_root" && ! -e "$sudoers_target" && ! -e "$staging_root" &&
    ! -e "$state_manifest" ]] || {
  print -u2 "fresh A04 namespace, state, or authorization already exists"; exit 73
}
if [[ -z "$test_root" ]]; then
  [[ "$(/usr/bin/id -u thirdfacedev)" == 501 ]] || { print -u2 "principal UID disagreement"; exit 78; }
  [[ "$(/usr/bin/id -u _interviewcopilotverify)" == 499 &&
      "$(/usr/bin/id -g _interviewcopilotverify)" == 499 ]] || {
    print -u2 "execution identity disagreement"; exit 78
  }
fi

journal_command create
transaction_started=1
receipt_committed=0
cleanup() {
  local result="${1:-$?}"
  set +e
  if (( result != 0 && transaction_started == 1 && receipt_committed == 0 )); then
    transaction_started=0
    /bin/rm -f "$sudoers_target"
    make_writable "$controller_root"
    make_writable "$staging_root"
    /bin/rm -rf "$controller_root" "$staging_root"
    [[ ! -e "$state_manifest" ]] || {
      /bin/chmod u+w "$state_manifest" 2>/dev/null
      /bin/rm -f "$state_manifest"
    }
    if legacy_preflight &&
       publish_receipt FAILURE "$result" install_rollback ""; then
      journal_command remove
    else
      print -u2 "rollback is safe but terminal publication is incomplete; journal retained"
    fi
  fi
  return "$result"
}
TRAPZERR() {
  local result=$?
  cleanup "$result"
  return "$result"
}
trap 'cleanup $?' EXIT

/bin/mkdir -p "$staging_root/payload"
COPYFILE_DISABLE=1 /usr/bin/tar -xzf "$payload_archive" --strip-components 1 \
  -C "$staging_root/payload"
/bin/chmod 0555 "$staging_root/payload"
if [[ -z "$test_root" ]]; then
  /usr/sbin/chown -R root:wheel "$staging_root"
  /bin/chmod -RN "$staging_root"
  /usr/bin/xattr -cr "$staging_root"
fi
/usr/bin/python3 "$manifest_tool" verify "$staging_root/payload" "$manifest" "${manifest_options[@]}"

/bin/mkdir -p "$install_root" "$controller_root/metadata" "$metadata_root" \
  "$controller_root/locks" "$controller_root/nonces" "$controller_root/requests" \
  "$request_root"
COPYFILE_DISABLE=1 /usr/bin/tar -xzf "$payload_archive" --strip-components 1 \
  -C "$install_root"
if [[ -z "$test_root" ]]; then
  /usr/sbin/chown -R root:wheel "$controller_root"
  /usr/sbin/chown thirdfacedev:staff "$request_root"
  /bin/chmod -RN "$controller_root"
  /usr/bin/xattr -cr "$controller_root"
fi
/bin/chmod 0555 "$install_root"
/usr/bin/python3 "$manifest_tool" verify "$install_root" "$manifest" "${manifest_options[@]}"
make_writable "$staging_root"
/bin/rm -rf "$staging_root"
for file in expected-install-manifest.json release-envelope.json; do
  source=$manifest
  [[ "$file" == release-envelope.json ]] && source=$envelope
  /usr/bin/install -m 0444 "$source" "$metadata_root/$file"
done
print -r -- "$approved_envelope_sha" > "$metadata_root/approved-envelope.sha256"
/bin/chmod 0444 "$metadata_root/approved-envelope.sha256"
P00_V2_SELF_TEST_TIMESTAMP=1970-01-01T00:00:00Z \
  "$install_root/libexec/controller-self-test" --self-test \
  --evidence "$metadata_root/installed-self-test.json"
/bin/chmod 0444 "$metadata_root/installed-self-test.json"
if [[ -z "$test_root" ]]; then
  /usr/sbin/chown -R root:wheel "$controller_root"
  /usr/sbin/chown thirdfacedev:staff "$request_root"
  /bin/chmod -RN "$controller_root"
  /usr/bin/xattr -cr "$controller_root"
fi
/bin/chmod 0755 "$controller_root"
/bin/chmod 0555 "$controller_root/metadata" "$metadata_root" "$controller_root/requests"
/bin/chmod 0700 "$controller_root/locks" "$controller_root/nonces" "$request_root"
legacy_preflight
admission_command pre-authorization >/dev/null

if [[ -n "$test_root" && "${P00_V2_TEST_HARD_STOP_BEFORE_AUTH:-0}" == 1 ]]; then
  trap - EXIT
  print -u2 "injected hard stop before authorization"
  exit 90
fi
/bin/mkdir -p "${sudoers_target:h}"
/usr/bin/install -m 0440 "$sudoers_source" "$sudoers_target"
if [[ -z "$test_root" ]]; then
  /usr/sbin/chown root:wheel "$sudoers_target"
  /bin/chmod -N "$sudoers_target"
  /usr/bin/xattr -c "$sudoers_target"
fi
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

state_sha=$(admission_command create-state)
publish_receipt SUCCESS 0 installed "$state_sha"
receipt_committed=1
if [[ -n "$test_root" && "${P00_V2_TEST_HARD_STOP_AFTER_SUCCESS_RECEIPT:-0}" == 1 ]]; then
  trap - EXIT
  print -u2 "injected hard stop after SUCCESS receipt"
  exit 93
fi
admission_command verify-committing >/dev/null
journal_command remove
admission_command verify-success >/dev/null
legacy_preflight
transaction_started=0
trap - EXIT
print "P00-V2-CAP-A04 installed exactly"
