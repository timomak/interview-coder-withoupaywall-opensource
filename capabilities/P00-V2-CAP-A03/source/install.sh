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
  state_uid=$EUID
  state_gid=$(/usr/bin/id -g)
  request_uid=$EUID
  request_gid=$state_gid
  previous_metadata_mode=0755
  allow_source_xattrs=1
else
  [[ $EUID -eq 0 ]] || {
    print -u2 "live installation requires root"
    exit 77
  }
  shared_root=/Users/Shared/InterviewCopilot
  sudoers_target=/etc/sudoers.d/interviewcopilot-verification-controller
  verify_options=(--require-uid 0)
  state_uid=0
  state_gid=0
  request_uid=501
  request_gid=20
  previous_metadata_mode=0700
  allow_source_xattrs=0
fi

controller_root=$shared_root/verification-controller
install_root=$controller_root/v2
legacy_root=$controller_root/v1
metadata_root=$controller_root/metadata/P00-V2-CAP-A03
previous_metadata_root=$controller_root/metadata/P00-V2-CAP-A02
staging_root=$shared_root/.verification-controller-v2-stage.$$
previous_install_root=$controller_root/.v2-before-P00-V2-CAP-A03.$$
quiescence_root=$shared_root/.verification-controller-v2-quiescence.$$
legacy_sudoers_quarantine=$controller_root/quarantine/v1-sudoers
previous_sudoers_quarantine=$controller_root/quarantine/P00-V2-CAP-A02-sudoers
payload_archive=$bundle_root/build/payload.tar.gz
manifest=$bundle_root/build/expected-install-manifest.json
legacy_manifest=$bundle_root/build/legacy-v1-observed-manifest.json
envelope=$bundle_root/build/release-envelope.json
sudoers_source=$bundle_root/config/sudoers
manifest_tool=$bundle_root/tools/manifest.py
envelope_tool=$bundle_root/tools/envelope.py
upgrade_state_tool=$bundle_root/tools/upgrade_state.py
previous_manifest_sha=945ffda713b5e9a02d2472d6f4e9e91340111384a6cdeab40890a5f3b572768b
previous_envelope_sha=69f88512f7b2740326346c57593ed428812a2e278eb86b62a005b17b9e56286f
previous_sudoers_sha=7fe7480026d425056231200a518c26c0e40b79ef59c130d6924d5af30e23170b

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
upgrading=1
[[ -d "$install_root" && -d "$previous_metadata_root" ]] || {
  print -u2 "A03 requires the exact installed A02 capability"
  exit 65
}
[[ "$(hash_file "$previous_metadata_root/expected-install-manifest.json")" == "$previous_manifest_sha" &&
    "$(hash_file "$previous_metadata_root/release-envelope.json")" == "$previous_envelope_sha" &&
    "$(/usr/bin/tr -d '[:space:]' < "$previous_metadata_root/approved-envelope.sha256")" == "$previous_envelope_sha" ]] || {
  print -u2 "installed A02 metadata identity disagreement"
  exit 65
}
/usr/bin/python3 "$upgrade_state_tool" a02-admission \
  "$previous_metadata_root" "$sudoers_target" "$state_uid" "$state_gid" \
  "$previous_metadata_mode" "$allow_source_xattrs"
/usr/bin/python3 "$manifest_tool" verify "$install_root" \
  "$previous_metadata_root/expected-install-manifest.json" "${verify_options[@]}"
[[ ! -e "$staging_root" && ! -e "$metadata_root" &&
    ! -e "$previous_install_root" && ! -e "$quiescence_root" ]] || {
  print -u2 "A03 stage, metadata, rollback, or quiescence root already exists"
  exit 73
}
request_snapshot_before=
if (( upgrading == 1 )); then
  request_snapshot_before=$(
    /usr/bin/python3 "$upgrade_state_tool" request-snapshot \
      "$controller_root/requests" "$state_uid" "$state_gid" \
      "$request_uid" "$request_gid"
  )
fi

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
previous_moved=0
new_sudoers=0
legacy_rule_removed=0
quiescence_pid=0
created_state=()
test_make_writable() {
  [[ -n "$test_root" && -e "$1" ]] || return 0
  /bin/chmod -R u+w "$1" 2>/dev/null || true
}
quiescence_is_alive() {
  (( quiescence_pid != 0 )) || return 1
  /bin/kill -0 "$quiescence_pid" 2>/dev/null || return 1
  local process_state
  process_state=$(
    /bin/ps -o state= -p "$quiescence_pid" 2>/dev/null |
      /usr/bin/tr -d '[:space:]'
  )
  [[ -n "$process_state" && "$process_state" != Z* ]]
}
require_quiescence() {
  quiescence_is_alive || {
    print -u2 "A02 quiescence holder is not continuously alive"
    return 75
  }
}
require_quiescence_or_exit() {
  if ! require_quiescence; then
    exit 75
  fi
}
release_quiescence_best_effort() {
  if (( quiescence_pid != 0 )); then
    /usr/bin/touch "$quiescence_root/release"
    wait "$quiescence_pid" 2>/dev/null || true
    quiescence_pid=0
  fi
  /bin/rm -rf "$quiescence_root"
}
finish_quiescence() {
  require_quiescence || return 75
  /usr/bin/touch "$quiescence_root/release"
  local holder_status
  if wait "$quiescence_pid"; then
    holder_status=0
  else
    holder_status=$?
  fi
  quiescence_pid=0
  /bin/rm -rf "$quiescence_root"
  (( holder_status == 0 )) || {
    print -u2 "A02 quiescence holder exited with status $holder_status"
    return 75
  }
}
cleanup() {
  local result=$?
  if (( result != 0 )); then
    if (( upgrading == 1 && previous_moved == 1 )); then
      test_make_writable "$install_root"
    elif (( activated == 1 )); then
      test_make_writable "$install_root"
    fi
    test_make_writable "$staging_root"
    test_make_writable "$metadata_root"
    (( new_sudoers == 0 )) || /bin/rm -f "$sudoers_target"
    if (( upgrading == 1 && previous_moved == 1 )); then
      /bin/rm -rf "$install_root"
      /bin/mv "$previous_install_root" "$install_root"
    elif (( activated == 1 )); then
      /bin/rm -rf "$install_root"
    fi
    /bin/rm -rf "$staging_root" "$metadata_root"
    for (( index=${#created_state}; index>=1; index-- )); do
      /bin/rmdir "$created_state[$index]" 2>/dev/null || true
    done
    if (( legacy_rule_removed == 1 )); then
      print -u2 "installation rolled back; legacy wildcard authorization remains removed"
    fi
  fi
  release_quiescence_best_effort
}
trap cleanup EXIT

if [[ -e "$sudoers_target" ]]; then
  legacy_sudoers_sha=$(hash_file "$sudoers_target")
  if (( upgrading == 1 )); then
    [[ "$legacy_sudoers_sha" == "$previous_sudoers_sha" ]] || {
      print -u2 "installed A02 sudoers identity disagreement"
      exit 65
    }
    /usr/bin/install -m 0400 "$sudoers_target" "$previous_sudoers_quarantine"
    [[ -n "$test_root" ]] || /usr/sbin/chown root:wheel "$previous_sudoers_quarantine"
  else
    [[ "$legacy_sudoers_sha" == 902587eff89ddce72887aba63afcd7687ee33b8f0cbabd21f51f6f47d6e6f056 ]] || {
      print -u2 "installed legacy sudoers identity disagreement"
      exit 65
    }
    /usr/bin/install -m 0400 "$sudoers_target" "$legacy_sudoers_quarantine"
    [[ -n "$test_root" ]] || /usr/sbin/chown root:wheel "$legacy_sudoers_quarantine"
  fi
  /bin/rm -f "$sudoers_target"
  legacy_rule_removed=1
fi
if [[ -n "$test_root" && "${P00_V2_TEST_FAIL_AFTER_AUTH_REMOVAL:-0}" == 1 ]]; then
  print -u2 "injected test failure after legacy authorization removal"
  exit 91
fi

if (( upgrading == 1 )); then
  /bin/mkdir "$quiescence_root"
  /usr/bin/python3 "$staging_root/v2/libexec/quiesce.py" \
    --hold-ready "$quiescence_root/ready" \
    --hold-release "$quiescence_root/release" \
    --parent-pid $$ "$controller_root" "$install_root" &
  quiescence_pid=$!
  quiescence_ready=0
  for _ in {1..400}; do
    if [[ -f "$quiescence_root/ready" ]]; then
      quiescence_ready=1
      break
    fi
    /bin/kill -0 "$quiescence_pid" 2>/dev/null || break
    /bin/sleep 0.025
  done
  if (( quiescence_ready == 0 )); then
    if wait "$quiescence_pid"; then
      quiescence_status=0
    else
      quiescence_status=$?
    fi
    quiescence_pid=0
    print -u2 "A02 quiescence admission failed with status $quiescence_status"
    exit 75
  fi
  if [[ -n "$test_root" &&
        "${P00_V2_TEST_KILL_QUIESCENCE_BEFORE_SWAP:-0}" == 1 ]]; then
    /bin/kill -9 "$quiescence_pid"
    /bin/sleep 0.05
  fi
  require_quiescence_or_exit
  /bin/mv "$install_root" "$previous_install_root"
  previous_moved=1
  require_quiescence_or_exit
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
if (( upgrading == 1 )); then
  require_quiescence_or_exit
fi

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
  "$controller_root/receipts"
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
    "$controller_root/nonces" "$controller_root/receipts"
  /usr/sbin/chown root:wheel "$controller_root/requests"
  /usr/sbin/chown thirdfacedev:staff "$controller_root/requests/501"
fi
/bin/chmod 0700 "$controller_root/objects" "$controller_root/anchors" \
  "$controller_root/anchors/active" \
  "$controller_root/locks" "$controller_root/nonces" "$controller_root/receipts" \
  "$controller_root/requests/501"
/bin/chmod 0711 "$controller_root/requests" "$controller_root/runs"
/usr/bin/python3 "$upgrade_state_tool" normalize-runs \
  "$controller_root/runs" "$state_uid" "$state_gid"
if (( upgrading == 1 )); then
  request_snapshot_after=$(
    /usr/bin/python3 "$upgrade_state_tool" request-snapshot \
      "$controller_root/requests" "$state_uid" "$state_gid" \
      "$request_uid" "$request_gid"
  )
  [[ "$request_snapshot_after" == "$request_snapshot_before" ]] || {
    print -u2 "preserved request state changed during upgrade"
    exit 65
  }
fi

if (( upgrading == 1 )); then
  require_quiescence_or_exit
fi
/usr/bin/python3 "$manifest_tool" verify "$install_root" \
  "$metadata_root/expected-install-manifest.json" "${verify_options[@]}"

"$install_root/libexec/controller-self-test" --self-test \
  --evidence "$metadata_root/installed-self-test.json"
if [[ -z "$test_root" ]]; then
  /usr/sbin/chown root:wheel "$metadata_root/installed-self-test.json"
fi
/bin/chmod 0444 "$metadata_root/installed-self-test.json"
if [[ -n "$test_root" &&
      "${P00_V2_TEST_KILL_QUIESCENCE_BEFORE_AUTHORIZATION:-0}" == 1 ]]; then
  /bin/kill -9 "$quiescence_pid"
  /bin/sleep 0.05
fi
if (( upgrading == 1 )); then
  require_quiescence_or_exit
fi

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
if (( upgrading == 1 )); then
  require_quiescence_or_exit
fi
if [[ -n "$test_root" && "${P00_V2_TEST_FAIL_AFTER_NEW_AUTHORIZATION:-0}" == 1 ]]; then
  print -u2 "injected test failure after new authorization activation"
  exit 92
fi
if (( previous_moved == 1 )); then
  if ! finish_quiescence; then
    exit 75
  fi
  if [[ -n "$test_root" ]]; then
    test_make_writable "$previous_install_root"
  fi
  /bin/rm -rf "$previous_install_root"
  previous_moved=0
fi

print "installed P00-V2-CAP-A03 with exact empty-argument authorization"
