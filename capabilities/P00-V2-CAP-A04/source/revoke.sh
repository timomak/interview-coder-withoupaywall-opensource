#!/bin/zsh
set -euo pipefail

[[ $# -eq 0 ]] || { print -u2 "revoke-controller accepts no arguments"; exit 64; }
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
  [[ $EUID -eq 0 ]] || { print -u2 "live revocation requires root"; exit 77; }
  shared_root=/Users/Shared/InterviewCopilot
  sudoers_target=/etc/sudoers.d/interviewcopilot-verification-controller-a04
  receipt_owner=0
  verify_options=(--require-uid 0)
  receipt_options=()
fi

controller_root=$shared_root/verification-controller-a04
install_root=$controller_root/payload
metadata_root=$controller_root/metadata/P00-V2-CAP-A04
activation_receipt=$shared_root/verification-controller-a04-receipts/P00-V2-CAP-A04-activation.json
retention_root=$shared_root/verification-controller-a04-retained/P00-V2-CAP-A04
tombstone=$shared_root/verification-controller-a04-retained/P00-V2-CAP-A04-revoked.json
legacy_root=$shared_root/verification-controller
legacy_controller=$legacy_root/v2/libexec/verify-phase-core
legacy_receipt=$legacy_root/recovery-receipts/P00-V2-CAP-A03-RECOVERY-03.json
legacy_sudoers=${sudoers_target:h}/interviewcopilot-verification-controller
removed_sudoers=$shared_root/verification-controller-a04-retained/.sudoers.removed.$$
expected_legacy_controller_sha=73eda1532baa3044cf4feb989d2ec58d15304c86c31a298ed3d73a1a75c7494d
expected_legacy_receipt_sha=5da6d108e0fde1583bc09ecef806d591847c2c26c69bef461c5813390d36f5b8
expected_manifest_tool_sha=f2c3c8b02793f4f432baa1b12bff2abcaca17fdf2aaa65b1339c0c2dd6fb1abd
expected_receipt_tool_sha=199d8df097074fbb99b89098c2bac237dccdfcdeaddf1f0b84a566f593a4da32
expected_quiesce_tool_sha=c383487f6efa3a24b9ca33a07aeec243b19b70b0b664526f56a29cd501d1212e

hash_file() { /usr/bin/shasum -a 256 "$1" | /usr/bin/awk '{print $1}'; }
legacy_preflight() {
  [[ -f "$legacy_controller" &&
      "$(hash_file "$legacy_controller")" == "$expected_legacy_controller_sha" &&
      -f "$legacy_receipt" &&
      "$(hash_file "$legacy_receipt")" == "$expected_legacy_receipt_sha" &&
      ! -e "$legacy_sudoers" ]]
}

# Authorization is removed before any installed or metadata byte is trusted.
/bin/mkdir -p "${removed_sudoers:h}"
if [[ -e "$sudoers_target" ]]; then
  /bin/mv "$sudoers_target" "$removed_sudoers"
fi
[[ ! -e "$sudoers_target" ]] || { print -u2 "authorization removal failed"; exit 74; }
if [[ ! -e "$controller_root" && -f "$tombstone" ]]; then
  print "P00-V2-CAP-A04 already revoked"
  exit 0
fi
[[ -d "$controller_root" && -d "$install_root" && -d "$metadata_root" ]] || {
  print -u2 "authorization removed; A04 identity is incomplete and state was preserved"; exit 65
}
legacy_preflight || {
  print -u2 "authorization removed; legacy identity disagreement and A04 state was preserved"; exit 65
}
manifest_tool=$install_root/libexec/manifest.py
receipt_tool=$install_root/libexec/receipt.py
quiesce_tool=$install_root/libexec/quiesce.py
manifest=$metadata_root/expected-install-manifest.json
envelope=$metadata_root/release-envelope.json
[[ "$(hash_file "$manifest_tool")" == "$expected_manifest_tool_sha" &&
    "$(hash_file "$receipt_tool")" == "$expected_receipt_tool_sha" &&
    "$(hash_file "$quiesce_tool")" == "$expected_quiesce_tool_sha" ]] || {
  print -u2 "authorization removed; verifier identity disagreement and state was preserved"; exit 65
}
approved_envelope_sha=$(
  /usr/bin/python3 - "$activation_receipt" <<'PY'
import json, sys
value = json.load(open(sys.argv[1])).get("envelopeSha256", "")
if not isinstance(value, str) or len(value) != 64 or any(c not in "0123456789abcdef" for c in value):
    raise SystemExit("activation receipt envelope identity disagreement")
print(value)
PY
)
[[ "$(/usr/bin/tr -d '[:space:]' < "$metadata_root/approved-envelope.sha256")" == "$approved_envelope_sha" ]] || {
  print -u2 "authorization removed; approved envelope metadata disagreement and state was preserved"; exit 65
}
[[ "$(hash_file "$envelope")" == "$approved_envelope_sha" ]] || {
  print -u2 "authorization removed; envelope identity disagreement and state was preserved"; exit 65
}
/usr/bin/python3 "$receipt_tool" verify "$activation_receipt" "$approved_envelope_sha" \
  --owner "$receipt_owner" "${receipt_options[@]}" >/dev/null
/usr/bin/python3 "$manifest_tool" verify "$install_root" "$manifest" "${verify_options[@]}" || {
  print -u2 "authorization removed; installed drift was preserved"; exit 65
}
expected_sudoers_sha=$(
  /usr/bin/python3 - "$envelope" <<'PY'
import json, sys
print(json.load(open(sys.argv[1]))["members"]["sudoers"]["sha256"])
PY
)
if [[ -e "$removed_sudoers" && "$(hash_file "$removed_sudoers")" != "$expected_sudoers_sha" ]]; then
  print -u2 "authorization removed; sudoers drift was preserved"; exit 65
fi
/bin/mkdir -p "$controller_root/revocation-in-progress"
/bin/chmod 0500 "$controller_root/revocation-in-progress"
[[ -n "$test_root" ]] || /usr/sbin/chown root:wheel "$controller_root/revocation-in-progress"
/usr/bin/python3 "$quiesce_tool" "$controller_root" "$install_root" || {
  print -u2 "authorization removed; active A04 work prevents cleanup"; exit 75
}

[[ ! -e "$retention_root" && ! -e "$tombstone" ]] || {
  print -u2 "authorization removed; retention collision preserved A04 state"; exit 73
}
/bin/mkdir -p "$retention_root/state"
index=$retention_root/retention-index.tsv
print -r -- $'name\tarchive_sha256' > "$index"
for name in anchors runs receipts metadata; do
  [[ -e "$controller_root/$name" ]] || continue
  archive=$retention_root/state/$name.tar.gz
  COPYFILE_DISABLE=1 /usr/bin/tar -czf "$archive" --format pax \
    -C "$controller_root" "$name"
  print -r -- "$name"$'\t'"$(hash_file "$archive")" >> "$index"
done
print -r -- "activationReceipt"$'\t'"$(hash_file "$activation_receipt")" >> "$index"
[[ ! -e "$removed_sudoers" ]] || /bin/mv "$removed_sudoers" "$retention_root/sudoers.removed"
/bin/chmod -R go-w "$retention_root"
[[ -n "$test_root" ]] || /usr/sbin/chown -R root:wheel "$retention_root"

if [[ -n "$test_root" ]]; then
  /bin/chmod -R u+w "$controller_root" 2>/dev/null || true
fi
/bin/rm -rf "$controller_root"
legacy_preflight || { print -u2 "legacy identity changed during A04 revocation"; exit 74; }
temporary=$tombstone.tmp.$$
print -r -- \
  "{\"activationReceiptSha256\":\"$(hash_file "$activation_receipt")\",\"artifactId\":\"P00-V2-CAP-A04\",\"authorizationRemovedFirst\":true,\"retentionIndexSha256\":\"$(hash_file "$index")\",\"schemaVersion\":1}" \
  > "$temporary"
/bin/chmod 0444 "$temporary"
[[ -n "$test_root" ]] || /usr/sbin/chown root:wheel "$temporary"
/bin/mv "$temporary" "$tombstone"
print "P00-V2-CAP-A04 revoked; authorization removed, evidence retained, legacy unchanged"
