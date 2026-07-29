#!/bin/zsh
set -euo pipefail

if [[ $# -ne 2 ]]; then
  print -u2 "usage: recover.sh BUNDLE_ROOT APPROVED_ENVELOPE_SHA256"
  exit 64
fi

artifact_id=P00-V2-CAP-A03-RECOVERY-02
candidate=2e5045116db6e3c5f6e6cc18b70df6d7fa021baf
historical_commit=1ff0881b9bd59f243146c93b6709be57d58ee17a
historical_phase=P01
historical_run=70acd85a0202cc85f65e176a995a248f
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
  execution_uid=$EUID
  execution_gid=$state_gid
  metadata_mode=0755
  allow_source_xattrs=1
else
  [[ $EUID -eq 0 ]] || {
    print -u2 "live recovery requires root"
    exit 77
  }
  shared_root=/Users/Shared/InterviewCopilot
  sudoers_target=/etc/sudoers.d/interviewcopilot-verification-controller
  verify_options=(--require-uid 0)
  state_uid=0
  state_gid=0
  execution_uid=499
  execution_gid=499
  metadata_mode=0700
  allow_source_xattrs=0
fi

controller_root=$shared_root/verification-controller
install_root=$controller_root/v2
legacy_root=$controller_root/v1
a02_metadata=$controller_root/metadata/P00-V2-CAP-A02
a03_metadata=$controller_root/metadata/P00-V2-CAP-A03
runs_root=$controller_root/runs
historical_node_modules=$runs_root/$historical_commit/$historical_phase/$historical_run/repo/node_modules
quarantine_root=$controller_root/quarantine/$artifact_id
quarantined_node_modules=$quarantine_root/$historical_commit-$historical_phase-$historical_run-repo-node_modules
relocation_manifest=$quarantine_root/relocation.json
receipt_root=$controller_root/recovery-receipts
receipt_path=$receipt_root/$artifact_id.json
a02_root=$bundle_root/vendor/a02
a03_root=$bundle_root/vendor/a03
envelope=$bundle_root/build/release-envelope.json
envelope_tool=$bundle_root/tools/envelope.py
run_state_tool=$bundle_root/tools/run_state.py
receipt_tool=$bundle_root/tools/receipt.py
a03_manifest_tool=$a03_root/tools/manifest.py
a03_upgrade_tool=$a03_root/tools/upgrade_state.py
a02_sudoers=$a02_root/config/sudoers
a02_manifest=$a02_root/build/expected-install-manifest.json
a03_manifest=$a03_root/build/expected-install-manifest.json
a03_envelope=$a03_root/build/release-envelope.json
a03_installer=$a03_root/source/install.sh
admission_sudoers=$bundle_root/.a02-admission-sudoers

expected_a02_manifest_sha=945ffda713b5e9a02d2472d6f4e9e91340111384a6cdeab40890a5f3b572768b
expected_a02_envelope_sha=69f88512f7b2740326346c57593ed428812a2e278eb86b62a005b17b9e56286f
expected_a02_sudoers_sha=7fe7480026d425056231200a518c26c0e40b79ef59c130d6924d5af30e23170b
expected_a03_manifest_sha=d94f06f0d6f585ed6ce368cfc933e5ec4fe4c9914621a39ce2544baa97f0ad39
expected_a03_envelope_sha=00ea8696be7af50cfadd9035f9d7b44cb9d560b96c1f563c9ded0f6197a1af41
expected_a03_controller_sha=d7e5b3e0e59629ae151635add38fc544d4bce5e4160eced388c44d51f84b1302

hash_file() {
  /usr/bin/shasum -a 256 "$1" | /usr/bin/awk '{print $1}'
}

[[ "$approved_envelope_sha" != *[^a-f0-9]* &&
    ${#approved_envelope_sha} -eq 64 ]] || {
  print -u2 "approved recovery envelope SHA is invalid"
  exit 64
}
[[ -f "$envelope" &&
    "$(hash_file "$envelope")" == "$approved_envelope_sha" ]] || {
  print -u2 "recovery envelope hash disagreement"
  exit 65
}
/usr/bin/python3 "$envelope_tool" verify "$bundle_root" "$envelope"

if [[ -n "$test_root" ]]; then
  expected_stage_prefix=$shared_root/verification-controller-bootstrap/
else
  expected_stage_prefix=/Users/Shared/InterviewCopilot/verification-controller-bootstrap/
fi
[[ "$bundle_root" == "$expected_stage_prefix$approved_envelope_sha" ]] || {
  print -u2 "recovery bundle path disagreement"
  exit 65
}

cleanup_stage=1
temporary_authorization=0
relocated=0
committed=0
checkpoint=stage_admitted
cleanup() {
  local result=$?
  local relocation_outcome=NOT_STARTED
  trap - EXIT

  if (( committed == 0 && temporary_authorization == 1 )); then
    /bin/rm -f "$sudoers_target"
    temporary_authorization=0
  fi
  if (( committed == 0 && relocated == 1 )); then
    if /usr/bin/python3 "$run_state_tool" restore \
      "$historical_node_modules" "$quarantined_node_modules" \
      "$relocation_manifest"; then
      relocation_outcome=RESTORED
      relocated=0
    else
      relocation_outcome=RESTORE_FAILED
      result=74
    fi
  elif (( committed == 1 && relocated == 1 )); then
    relocation_outcome=RETAINED_QUARANTINED
  fi

  if (( committed == 1 && result == 0 )); then
    receipt_status=SUCCESS
  else
    receipt_status=FAILURE
  fi
  if [[ ! -e "$receipt_path" ]]; then
    /usr/bin/python3 "$receipt_tool" \
      --root "$receipt_root" \
      --artifact "$artifact_id" \
      --envelope "$approved_envelope_sha" \
      --status "$receipt_status" \
      --exit-code "$result" \
      --checkpoint "$checkpoint" \
      --relocation "$relocation_outcome" \
      --candidate "$candidate" \
      --install-root "$install_root" \
      --sudoers "$sudoers_target" \
      --stage "$bundle_root" || {
        print -u2 "failed to write immutable recovery receipt"
        (( result == 0 )) && result=74
      }
  fi
  if (( cleanup_stage == 1 )); then
    /bin/chmod -R u+w "$bundle_root" 2>/dev/null || true
    /bin/rm -rf "$bundle_root"
  fi
  exit "$result"
}
trap cleanup EXIT

[[ ! -e "$receipt_path" && ! -e "$quarantine_root" ]] || {
  print -u2 "recovery receipt or quarantine already exists"
  exit 73
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

checkpoint=sealed_inputs
[[ "$(hash_file "$a02_manifest")" == "$expected_a02_manifest_sha" &&
    "$(hash_file "$a02_root/build/release-envelope.json")" == "$expected_a02_envelope_sha" &&
    "$(hash_file "$a02_sudoers")" == "$expected_a02_sudoers_sha" ]] || {
  print -u2 "sealed A02 recovery inputs disagree"
  exit 65
}
[[ "$(hash_file "$a03_manifest")" == "$expected_a03_manifest_sha" &&
    "$(hash_file "$a03_envelope")" == "$expected_a03_envelope_sha" ]] || {
  print -u2 "sealed A03 target inputs disagree"
  exit 65
}
/usr/bin/python3 "$a03_root/tools/envelope.py" verify "$a03_root" "$a03_envelope"
/usr/bin/python3 "$a03_manifest_tool" verify \
  "$legacy_root" "$a03_root/build/legacy-v1-observed-manifest.json" \
  "${verify_options[@]}"

checkpoint=predecessor_admission
[[ -d "$install_root" && -d "$a02_metadata" ]] || {
  print -u2 "exact A02 predecessor is absent"
  exit 65
}
[[ ! -e "$sudoers_target" && ! -e "$a03_metadata" ]] || {
  print -u2 "recovery requires exact unauthorized A02 predecessor state"
  exit 73
}
/usr/bin/python3 "$a03_manifest_tool" verify \
  "$install_root" "$a02_manifest" "${verify_options[@]}"

/usr/bin/install -m 0440 "$a02_sudoers" "$admission_sudoers"
[[ -n "$test_root" ]] || /usr/sbin/chown root:wheel "$admission_sudoers"
/usr/sbin/visudo -cf "$admission_sudoers"
[[ "$(hash_file "$admission_sudoers")" == "$expected_a02_sudoers_sha" ]] || {
  print -u2 "private A02 admission rule hash disagreement"
  exit 65
}
/usr/bin/python3 "$a03_upgrade_tool" a02-admission \
  "$a02_metadata" "$admission_sudoers" "$state_uid" "$state_gid" \
  "$metadata_mode" "$allow_source_xattrs"
/bin/rm -f "$admission_sudoers"

checkpoint=run_state_relocation
[[ -d "$historical_node_modules" ]] || {
  print -u2 "exact historical dependency tree is absent"
  exit 65
}
/usr/bin/python3 "$run_state_tool" relocate \
  "$historical_node_modules" "$quarantined_node_modules" \
  "$relocation_manifest"
relocated=1

if [[ -n "$test_root" &&
      "${P00_V2_RECOVERY_TEST_FAIL_AFTER_RELOCATION:-0}" == 1 ]]; then
  print -u2 "injected recovery failure after run-state relocation"
  exit 88
fi

checkpoint=remaining_run_state_audit
/usr/bin/python3 "$run_state_tool" audit-runs \
  "$runs_root" "$state_uid" "$state_gid" \
  "$execution_uid" "$execution_gid" "$a03_upgrade_tool"

checkpoint=transient_authorization
/bin/mkdir -p "${sudoers_target:h}"
temporary_authorization=1
/usr/bin/install -m 0440 "$a02_sudoers" "$sudoers_target"
if [[ -n "$test_root" &&
      "${P00_V2_RECOVERY_TEST_FAIL_AFTER_RULE_WRITE:-0}" == 1 ]]; then
  print -u2 "injected recovery failure after global rule write"
  exit 89
fi
[[ -n "$test_root" ]] || /usr/sbin/chown root:wheel "$sudoers_target"
/usr/sbin/visudo -cf "$sudoers_target"
[[ "$(hash_file "$sudoers_target")" == "$expected_a02_sudoers_sha" ]] || {
  print -u2 "transient A02 authorization hash disagreement"
  exit 65
}

if [[ -n "$test_root" &&
      "${P00_V2_RECOVERY_TEST_FAIL_BEFORE_A03:-0}" == 1 ]]; then
  print -u2 "injected recovery failure before A03 transition"
  exit 90
fi

checkpoint=a03_transition
/bin/zsh "$a03_installer" "$a03_root" "$expected_a03_envelope_sha"

checkpoint=installed_a03_verification
/usr/bin/python3 "$a03_manifest_tool" verify \
  "$install_root" "$a03_manifest" "${verify_options[@]}"
[[ "$(hash_file "$install_root/libexec/verify-phase-core")" ==
    "$expected_a03_controller_sha" ]] || {
  print -u2 "installed A03 controller hash disagreement"
  exit 65
}
[[ -d "$a03_metadata" &&
    "$(hash_file "$sudoers_target")" == "$expected_a02_sudoers_sha" ]] || {
  print -u2 "installed A03 metadata or authorization disagreement"
  exit 65
}

checkpoint=committed
committed=1
temporary_authorization=0
print "recovered exact unauthorized A02 predecessor to P00-V2-CAP-A03"
