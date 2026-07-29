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
a02_rollback=$quarantine_root/a02-rollback
runs_snapshot=$quarantine_root/runs-metadata-before-child.json
journal_root=$controller_root/recovery-journals
journal_path=$journal_root/$artifact_id.json
receipt_root=$controller_root/recovery-receipts
receipt_path=$receipt_root/$artifact_id.json
a02_root=$bundle_root/vendor/a02
a03_root=$bundle_root/vendor/a03
envelope=$bundle_root/build/release-envelope.json
envelope_tool=$bundle_root/tools/envelope.py
run_state_tool=$bundle_root/tools/run_state.py
journal_tool=$bundle_root/tools/journal.py
receipt_tool=$bundle_root/tools/receipt.py
a03_manifest_tool=$a03_root/tools/manifest.py
a03_upgrade_tool=$a03_root/tools/upgrade_state.py
a02_sudoers=$a02_root/config/sudoers
a03_sudoers=$a03_root/config/sudoers
a02_manifest=$a02_root/build/expected-install-manifest.json
a03_manifest=$a03_root/build/expected-install-manifest.json
a03_envelope=$a03_root/build/release-envelope.json
a03_installer=$a03_root/source/install.sh
admission_sudoers=$bundle_root/.a02-admission-sudoers

expected_a02_manifest_sha=945ffda713b5e9a02d2472d6f4e9e91340111384a6cdeab40890a5f3b572768b
expected_a02_envelope_sha=69f88512f7b2740326346c57593ed428812a2e278eb86b62a005b17b9e56286f
expected_a02_sudoers_sha=7fe7480026d425056231200a518c26c0e40b79ef59c130d6924d5af30e23170b
expected_a02_controller_sha=73eda1532baa3044cf4feb989d2ec58d15304c86c31a298ed3d73a1a75c7494d
expected_a03_manifest_sha=d94f06f0d6f585ed6ce368cfc933e5ec4fe4c9914621a39ce2544baa97f0ad39
expected_a03_envelope_sha=00ea8696be7af50cfadd9035f9d7b44cb9d560b96c1f563c9ded0f6197a1af41
expected_a03_controller_sha=d7e5b3e0e59629ae151635add38fc544d4bce5e4160eced388c44d51f84b1302

hash_file() {
  /usr/bin/shasum -a 256 "$1" | /usr/bin/awk '{print $1}'
}

hard_crash() {
  local point=$1
  if [[ -n "$test_root" &&
        "${P00_V2_RECOVERY_TEST_HARD_CRASH_POINT:-}" == "$point" ]]; then
    /bin/kill -9 $$
  fi
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
journal_active=0
relocation_active=0
child_started=0
child_committed=0
committed=0
terminal_receipt=0
checkpoint=stage_admitted

a02_is_exact() {
  [[ -d "$install_root" &&
      "$(hash_file "$install_root/libexec/verify-phase-core")" ==
        "$expected_a02_controller_sha" ]] || return 1
  /usr/bin/python3 "$a03_manifest_tool" verify \
    "$install_root" "$a02_manifest" "${verify_options[@]}" \
    >/dev/null 2>&1
}

a03_is_exact_without_authorization() {
  [[ -d "$install_root" && -d "$a03_metadata" &&
      "$(hash_file "$install_root/libexec/verify-phase-core")" ==
        "$expected_a03_controller_sha" &&
      "$(hash_file "$a03_metadata/expected-install-manifest.json")" ==
        "$expected_a03_manifest_sha" &&
      "$(hash_file "$a03_metadata/release-envelope.json")" ==
        "$expected_a03_envelope_sha" &&
      "$(/usr/bin/tr -d '[:space:]' < "$a03_metadata/approved-envelope.sha256")" ==
        "$expected_a03_envelope_sha" ]] || return 1
  /usr/bin/python3 "$a03_manifest_tool" verify \
    "$install_root" "$a03_manifest" "${verify_options[@]}" \
    >/dev/null 2>&1
}

publish_authorization() {
  local source=$1
  /bin/mkdir -p "${sudoers_target:h}"
  temporary_authorization=1
  /usr/bin/install -m 0440 "$source" "$sudoers_target"
  [[ -n "$test_root" ]] || /usr/sbin/chown root:wheel "$sudoers_target"
  /usr/sbin/visudo -cf "$sudoers_target"
  [[ "$(hash_file "$sudoers_target")" == "$expected_a02_sudoers_sha" ]]
}

cleanup_child_temporaries() {
  setopt local_options null_glob
  local path
  local paths=(
    "$shared_root"/.verification-controller-v2-stage.<->
    "$shared_root"/.verification-controller-v2-quiescence.<->
    "$controller_root"/.v2-before-P00-V2-CAP-A03.<->
  )
  for path in "${paths[@]}"; do
    [[ -d "$path" && ! -L "$path" ]] || {
      print -u2 "unexpected child temporary member: $path"
      return 74
    }
    /bin/chmod -R u+w "$path" 2>/dev/null || true
    /bin/rm -rf "$path"
  done
}

rollback_child_to_a02() {
  if [[ -d "$a02_rollback" ]]; then
    /usr/bin/python3 "$a03_manifest_tool" verify \
      "$a02_rollback" "$a02_manifest" "${verify_options[@]}"
    if [[ -e "$install_root" ]]; then
      [[ -d "$install_root" && ! -L "$install_root" ]] || return 74
      /bin/chmod -R u+w "$install_root" 2>/dev/null || true
      /bin/rm -rf "$install_root"
    fi
    if [[ -n "$test_root" ]]; then
      # com.apple.provenance prevents this cross-directory rename in a
      # non-root disposable root. Copy for simulation, then verify below; the
      # live root transaction uses the atomic rename.
      /usr/bin/ditto "$a02_rollback" "$install_root"
      /bin/chmod -R u+w "$a02_rollback" 2>/dev/null || true
      /bin/rm -rf "$a02_rollback"
    else
      /bin/mv "$a02_rollback" "$install_root"
    fi
  fi
  if [[ -e "$a03_metadata" ]]; then
    [[ -d "$a03_metadata" && ! -L "$a03_metadata" ]] || return 74
    /bin/chmod -R u+w "$a03_metadata" 2>/dev/null || true
    /bin/rm -rf "$a03_metadata"
  fi
  cleanup_child_temporaries
  if [[ -f "$runs_snapshot" ]]; then
    /usr/bin/python3 "$run_state_tool" restore-tree-metadata \
      "$runs_root" "$runs_snapshot"
    /bin/rm -f "$runs_snapshot"
  fi
  a02_is_exact
}

remove_journal() {
  if [[ -e "$journal_path" ]]; then
    [[ -f "$journal_path" && ! -L "$journal_path" ]] || return 74
    /bin/rm -f "$journal_path"
  fi
}

write_receipt() {
  local receipt_status=$1
  local exit_code=$2
  local relocation=$3
  /usr/bin/python3 "$receipt_tool" write \
    --root "$receipt_root" \
    --artifact "$artifact_id" \
    --envelope "$approved_envelope_sha" \
    --status "$receipt_status" \
    --exit-code "$exit_code" \
    --checkpoint "$checkpoint" \
    --relocation "$relocation" \
    --candidate "$candidate" \
    --install-root "$install_root" \
    --sudoers "$sudoers_target" \
    --stage "$bundle_root"
}

cleanup() {
  local result=$?
  local recovery_ok=1
  trap - EXIT
  if (( committed == 0 )); then
    if [[ -e "$sudoers_target" ]]; then
      /bin/rm -f "$sudoers_target"
    fi
    temporary_authorization=0
    if (( child_committed == 1 )); then
      # Exact A03 may already be irreversible. Leave the journal and
      # quarantine durable so the next exact invocation can finalize it.
      recovery_ok=0
    else
      if (( child_started == 1 )) || [[ -d "$a02_rollback" ]]; then
        rollback_child_to_a02 || recovery_ok=0
      fi
      if [[ -e "$relocation_manifest" || -e "$quarantined_node_modules" ||
            -d "$quarantine_root" ]]; then
        /usr/bin/python3 "$run_state_tool" reconcile-relocation \
          "$historical_node_modules" "$quarantined_node_modules" \
          "$relocation_manifest" || recovery_ok=0
      fi
      if (( journal_active == 1 && terminal_receipt == 0 && recovery_ok == 1 )); then
        if write_receipt FAILURE "$result" RESTORED; then
          terminal_receipt=1
          remove_journal || true
        else
          recovery_ok=0
        fi
      fi
    fi
    (( recovery_ok == 1 )) || result=74
  fi
  if (( cleanup_stage == 1 )); then
    /bin/chmod -R u+w "$bundle_root" 2>/dev/null || true
    /bin/rm -rf "$bundle_root"
  fi
  exit "$result"
}
trap cleanup EXIT

# On every replay, revoke the dedicated rule before inspecting any durable
# progress. The staged script and envelope were already verified above.
if [[ -e "$sudoers_target" ]]; then
  /bin/rm -f "$sudoers_target"
fi

checkpoint=sealed_inputs
[[ "$(hash_file "$a02_manifest")" == "$expected_a02_manifest_sha" &&
    "$(hash_file "$a02_root/build/release-envelope.json")" == "$expected_a02_envelope_sha" &&
    "$(hash_file "$a02_sudoers")" == "$expected_a02_sudoers_sha" &&
    "$(hash_file "$a03_sudoers")" == "$expected_a02_sudoers_sha" ]] || {
  print -u2 "sealed predecessor or authorization inputs disagree"
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

# A terminal success receipt can survive a crash immediately after its rename.
# Reconcile it only against exact A03 and the exact retained relocation.
if [[ -e "$receipt_path" ]]; then
  terminal_receipt=1
  if /usr/bin/python3 "$receipt_tool" verify "$receipt_path" \
    --artifact "$artifact_id" --envelope "$approved_envelope_sha" \
    --status SUCCESS --candidate "$candidate"; then
    a03_is_exact_without_authorization || {
      print -u2 "success receipt exists without exact A03"
      exit 74
    }
    /usr/bin/python3 "$run_state_tool" finalize-retained \
      "$historical_node_modules" "$quarantined_node_modules" \
      "$relocation_manifest"
    publish_authorization "$a03_sudoers"
    temporary_authorization=0
    remove_journal || true
    committed=1
    print "reconciled committed P00-V2-CAP-A03 recovery receipt"
    exit 0
  fi
  print -u2 "terminal recovery receipt forbids this artifact"
  exit 73
fi

# A durable journal means a prior process was interrupted. Refuse to race a
# still-running child; otherwise either finalize exact A03 or restore exact A02
# and the relocation before starting again.
if [[ -e "$journal_path" ]]; then
  journal_active=1
  /usr/bin/python3 "$journal_tool" verify "$journal_path" "$approved_envelope_sha"
  prior_child_pid=$(
    /usr/bin/python3 "$journal_tool" child-pid \
      "$journal_path" "$approved_envelope_sha"
  )
  if [[ -n "$prior_child_pid" ]] &&
    /bin/kill -0 "$prior_child_pid" 2>/dev/null; then
    print -u2 "recorded A03 child is still active"
    exit 75
  fi
  if a03_is_exact_without_authorization; then
    child_committed=1
    checkpoint=reconcile_committed_a03
    /usr/bin/python3 "$run_state_tool" finalize-retained \
      "$historical_node_modules" "$quarantined_node_modules" \
      "$relocation_manifest"
    publish_authorization "$a03_sudoers"
    checkpoint=committed
    write_receipt SUCCESS 0 RETAINED_QUARANTINED
    terminal_receipt=1
    /usr/bin/python3 "$journal_tool" set "$journal_path" \
      "$approved_envelope_sha" RECEIPT_COMMITTED
    remove_journal
    child_committed=0
    temporary_authorization=0
    committed=1
    print "reconciled exact committed P00-V2-CAP-A03"
    exit 0
  fi
  checkpoint=reconcile_interrupted_predecessor
  if [[ -d "$a02_rollback" ]]; then
    rollback_child_to_a02
  fi
  /usr/bin/python3 "$run_state_tool" reconcile-relocation \
    "$historical_node_modules" "$quarantined_node_modules" \
    "$relocation_manifest"
  remove_journal
  journal_active=0
fi

checkpoint=predecessor_admission
[[ -d "$install_root" && -d "$a02_metadata" &&
    ! -e "$a03_metadata" && ! -e "$sudoers_target" ]] || {
  print -u2 "recovery requires exact unauthorized A02 predecessor state"
  exit 73
}
a02_is_exact || {
  print -u2 "exact A02 predecessor payload is absent"
  exit 65
}

/usr/bin/install -m 0440 "$a02_sudoers" "$admission_sudoers"
[[ -n "$test_root" ]] || /usr/sbin/chown root:wheel "$admission_sudoers"
/usr/sbin/visudo -cf "$admission_sudoers"
/usr/bin/python3 "$a03_upgrade_tool" a02-admission \
  "$a02_metadata" "$admission_sudoers" "$state_uid" "$state_gid" \
  "$metadata_mode" "$allow_source_xattrs"
/bin/rm -f "$admission_sudoers"

/usr/bin/python3 "$journal_tool" init "$journal_path" \
  "$approved_envelope_sha" STARTED
journal_active=1

checkpoint=run_state_relocation
hard_crash before-quarantine-mkdir
/usr/bin/python3 "$run_state_tool" prepare-relocation \
  "$historical_node_modules" "$quarantined_node_modules" \
  "$relocation_manifest"
/usr/bin/python3 "$journal_tool" set "$journal_path" \
  "$approved_envelope_sha" RELOCATION_PREPARED
/usr/bin/python3 "$run_state_tool" move-relocation \
  "$historical_node_modules" "$quarantined_node_modules" \
  "$relocation_manifest"
relocation_active=1
/usr/bin/python3 "$journal_tool" set "$journal_path" \
  "$approved_envelope_sha" RELOCATION_MOVED

if [[ -n "$test_root" &&
      "${P00_V2_RECOVERY_TEST_FAIL_AFTER_RELOCATION:-0}" == 1 ]]; then
  print -u2 "injected recovery failure after run-state relocation"
  exit 88
fi

checkpoint=remaining_run_state_audit
/usr/bin/python3 "$run_state_tool" audit-runs \
  "$runs_root" "$state_uid" "$state_gid" \
  "$execution_uid" "$execution_gid" "$a03_upgrade_tool"
/usr/bin/python3 "$journal_tool" set "$journal_path" \
  "$approved_envelope_sha" RUNS_AUDITED

checkpoint=rollback_snapshot
/usr/bin/python3 "$run_state_tool" snapshot-tree "$runs_root" "$runs_snapshot"
/usr/bin/ditto "$install_root" "$a02_rollback"
/usr/bin/python3 "$a03_manifest_tool" verify \
  "$a02_rollback" "$a02_manifest" "${verify_options[@]}"
/usr/bin/python3 "$journal_tool" set "$journal_path" \
  "$approved_envelope_sha" ROLLBACK_SNAPSHOTTED

checkpoint=transient_authorization
/usr/bin/python3 "$journal_tool" set "$journal_path" \
  "$approved_envelope_sha" AUTHORIZATION_PUBLISHING
hard_crash before-sudoers-publish
publish_authorization "$a02_sudoers"
/usr/bin/python3 "$journal_tool" set "$journal_path" \
  "$approved_envelope_sha" AUTHORIZATION_PUBLISHED
hard_crash after-sudoers-publish

if [[ -n "$test_root" &&
      "${P00_V2_RECOVERY_TEST_FAIL_AFTER_RULE_WRITE:-0}" == 1 ]]; then
  print -u2 "injected recovery failure after global rule write"
  exit 89
fi
if [[ -n "$test_root" &&
      "${P00_V2_RECOVERY_TEST_FAIL_BEFORE_A03:-0}" == 1 ]]; then
  print -u2 "injected recovery failure before A03 transition"
  exit 90
fi

checkpoint=a03_transition
child_started=1
/usr/bin/python3 "$journal_tool" set "$journal_path" \
  "$approved_envelope_sha" CHILD_STARTING
hard_crash before-child-launch
/bin/zsh "$a03_installer" "$a03_root" "$expected_a03_envelope_sha" &
child_pid=$!
/usr/bin/python3 "$journal_tool" set "$journal_path" \
  "$approved_envelope_sha" CHILD_RUNNING --child-pid "$child_pid"
wait "$child_pid"

# The exact A03 installer performs its complete installed-manifest, native
# self-test, authorization, quiescence, and rollback checks before returning.
# From this point onward A03 is irreversible to the child. Do not emit a
# FAILURE receipt. The durable journal makes receipt finalization replayable.
child_committed=1
/usr/bin/python3 "$journal_tool" set "$journal_path" \
  "$approved_envelope_sha" CHILD_COMMITTED
hard_crash after-child-commit

checkpoint=committed
/usr/bin/python3 "$run_state_tool" finalize-retained \
  "$historical_node_modules" "$quarantined_node_modules" \
  "$relocation_manifest"
if ! write_receipt SUCCESS 0 RETAINED_QUARANTINED; then
  /bin/rm -f "$sudoers_target"
  temporary_authorization=0
  exit 74
fi
terminal_receipt=1
/usr/bin/python3 "$journal_tool" set "$journal_path" \
  "$approved_envelope_sha" RECEIPT_COMMITTED
remove_journal
child_committed=0
temporary_authorization=0
committed=1
print "recovered exact unauthorized A02 predecessor to P00-V2-CAP-A03"
