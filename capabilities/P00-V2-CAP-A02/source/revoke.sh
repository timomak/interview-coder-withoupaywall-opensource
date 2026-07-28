#!/bin/zsh
set -euo pipefail

if [[ $# -ne 0 ]]; then
  print -u2 "revoke-controller accepts no arguments"
  exit 64
fi

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
    print -u2 "live revocation requires root"
    exit 77
  }
  shared_root=/Users/Shared/InterviewCopilot
  sudoers_target=/etc/sudoers.d/interviewcopilot-verification-controller
  verify_options=(--require-uid 0)
fi

controller_root=$shared_root/verification-controller
install_root=$controller_root/v2
legacy_root=$controller_root/v1
metadata_root=$controller_root/metadata/P00-V2-CAP-A02
receipt_root=$shared_root/revocation-receipts
manifest_tool=$install_root/libexec/manifest.py
quiesce_tool=$install_root/libexec/quiesce.py
revocation_marker=$controller_root/revocation-in-progress

hash_file() {
  /usr/bin/shasum -a 256 "$1" | /usr/bin/awk '{print $1}'
}

/bin/mkdir -p "$receipt_root"
# Authorization is removed before reading or trusting any drift-prone
# installation, metadata, verifier, or sudoers bytes.
removed_sudoers=$receipt_root/P00-V2-CAP-A02-sudoers.removed.$$
if [[ -e "$sudoers_target" ]]; then
  /bin/mv "$sudoers_target" "$removed_sudoers"
fi
[[ ! -e "$sudoers_target" ]] || {
  print -u2 "sudoers authorization removal failed"
  exit 74
}
if [[ ! -e "$install_root" && ! -e "$legacy_root" ]]; then
  print "P00-V2-CAP-A02 already revoked"
  exit 0
fi
/bin/mkdir -p "$revocation_marker"
/bin/chmod 0500 "$revocation_marker"
[[ -n "$test_root" ]] || /usr/sbin/chown root:wheel "$revocation_marker"
/usr/bin/install -m 0555 "$0" "$receipt_root/revoke-controller"
[[ -n "$test_root" ]] || /usr/sbin/chown root:wheel "$receipt_root/revoke-controller"

[[ -d "$install_root" && -d "$legacy_root" && -d "$metadata_root" ]] || {
  print -u2 "authorization removed; revocation identity is incomplete and bytes were preserved"
  exit 65
}
[[ -f "$manifest_tool" &&
    -f "$quiesce_tool" &&
    -f "$metadata_root/expected-install-manifest.json" &&
    -f "$metadata_root/legacy-v1-observed-manifest.json" &&
    -f "$metadata_root/release-envelope.json" &&
    -f "$metadata_root/approved-envelope.sha256" ]] || {
  print -u2 "authorization removed; revocation metadata is incomplete"
  exit 65
}

expected_manifest_tool_sha=$(
  /usr/bin/python3 - "$metadata_root/expected-install-manifest.json" <<'PY'
import json, sys
document = json.load(open(sys.argv[1]))
matches = [
    member for member in document["members"]
    if member.get("path") == "libexec/manifest.py"
    and member.get("kind") == "file"
]
if len(matches) != 1:
    raise SystemExit("manifest verifier identity is absent or ambiguous")
print(matches[0]["sha256"])
PY
)
approved_envelope_sha=$(
  /usr/bin/tr -d '[:space:]' < "$metadata_root/approved-envelope.sha256"
)
[[ "$(hash_file "$metadata_root/release-envelope.json")" == "$approved_envelope_sha" ]] || {
  print -u2 "authorization removed; release envelope identity disagreement"
  exit 65
}
expected_sudoers_sha=$(
  /usr/bin/python3 - "$metadata_root/release-envelope.json" <<'PY'
import json, sys
print(json.load(open(sys.argv[1]))["members"]["sudoers"]["sha256"])
PY
)
if [[ -e "$removed_sudoers" &&
      "$(hash_file "$removed_sudoers")" != "$expected_sudoers_sha" ]]; then
  print -u2 "authorization removed; sudoers drift preserved for forensic disposition"
  exit 65
fi
[[ "$(hash_file "$manifest_tool")" == "$expected_manifest_tool_sha" ]] || {
  print -u2 "authorization removed; manifest verifier hash disagreement"
  exit 65
}
/usr/bin/python3 "$manifest_tool" verify "$install_root" \
  "$metadata_root/expected-install-manifest.json" "${verify_options[@]}"
/usr/bin/python3 "$manifest_tool" verify "$legacy_root" \
  "$metadata_root/legacy-v1-observed-manifest.json" "${verify_options[@]}"
/usr/bin/python3 "$quiesce_tool" "$controller_root" "$install_root" || {
  print -u2 "authorization removed; an active controller prevents safe cleanup"
  exit 75
}

retention_root=$receipt_root/P00-V2-CAP-A02-evidence
[[ ! -e "$retention_root" ]] || {
  print -u2 "authorization removed; retention root already exists"
  exit 73
}
/bin/mkdir -p "$retention_root/state"
retention_index=$retention_root/retention-index.tsv
print -r -- $'name\tarchive_sha256' > "$retention_index"
for name in anchors runs receipts metadata; do
  state_path=$controller_root/$name
  [[ -e "$state_path" ]] || continue
  archive_path=$retention_root/state/$name.tar.gz
  COPYFILE_DISABLE=1 /usr/bin/tar -czf "$archive_path" \
    --format pax -C "$controller_root" "$name"
  print -r -- "$name"$'\t'"$(hash_file "$archive_path")" >> "$retention_index"
done
/bin/chmod -R go-w "$retention_root"
[[ -n "$test_root" ]] || /usr/sbin/chown -R root:wheel "$retention_root"

if [[ -n "$test_root" ]]; then
  for removable in "$install_root" "$legacy_root" "$controller_root/objects" \
    "$controller_root/anchors" "$controller_root/runs" "$controller_root/receipts" \
    "$controller_root/locks" \
    "$controller_root/requests" "$controller_root/nonces" \
    "$controller_root/quarantine" "$controller_root/metadata"; do
    [[ ! -e "$removable" ]] || /bin/chmod -R u+w "$removable" 2>/dev/null || true
  done
fi
/bin/rm -rf "$install_root" "$legacy_root" \
  "$controller_root/objects" "$controller_root/anchors" "$controller_root/runs" \
  "$controller_root/receipts" "$controller_root/metadata" \
  "$controller_root/locks" "$controller_root/requests" "$controller_root/nonces" \
  "$controller_root/quarantine" "$revocation_marker"

receipt=$receipt_root/P00-V2-CAP-A02-revoked.json
temporary=$receipt.tmp.$$
retention_sha=$(hash_file "$retention_index")
print -r -- \
  "{\"artifactId\":\"P00-V2-CAP-A02\",\"envelopeSha256\":\"$approved_envelope_sha\",\"authorizationRemovedFirst\":true,\"retentionIndexSha256\":\"$retention_sha\"}" \
  > "$temporary"
/bin/chmod 0444 "$temporary"
[[ -n "$test_root" ]] || /usr/sbin/chown root:wheel "$temporary"
/bin/mv "$temporary" "$receipt"

for forbidden in "$sudoers_target" "$install_root" "$legacy_root"; do
  [[ ! -e "$forbidden" ]] || {
    print -u2 "revocation left a privileged command path: $forbidden"
    exit 74
  }
done

print "P00-V2-CAP-A02 revoked; authorization removed before executable cleanup"
