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
metadata_root=$controller_root/metadata/P00-V2-CAP-A01
receipt_root=$shared_root/revocation-receipts
manifest_tool=$install_root/libexec/manifest.py

hash_file() {
  /usr/bin/shasum -a 256 "$1" | /usr/bin/awk '{print $1}'
}

if [[ ! -e "$sudoers_target" && ! -e "$install_root" && ! -e "$legacy_root" ]]; then
  /bin/mkdir -p "$receipt_root"
  print "P00-V2-CAP-A01 already revoked"
  exit 0
fi

[[ -d "$install_root" && -d "$legacy_root" && -d "$metadata_root" ]] || {
  print -u2 "revocation identity is incomplete; refusing cleanup"
  exit 65
}
[[ -f "$manifest_tool" &&
    -f "$metadata_root/expected-install-manifest.json" &&
    -f "$metadata_root/legacy-v1-observed-manifest.json" &&
    -f "$metadata_root/release-envelope.json" &&
    -f "$metadata_root/approved-envelope.sha256" ]] || {
  print -u2 "revocation metadata is incomplete"
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
  print -u2 "release envelope identity disagreement"
  exit 65
}

expected_sudoers_sha=$(
  /usr/bin/python3 - "$metadata_root/release-envelope.json" <<'PY'
import json, sys
print(json.load(open(sys.argv[1]))["members"]["sudoers"]["sha256"])
PY
)
[[ -f "$sudoers_target" && "$(hash_file "$sudoers_target")" == "$expected_sudoers_sha" ]] || {
  print -u2 "installed sudoers identity disagreement"
  exit 65
}

/bin/mkdir -p "$receipt_root"
/usr/bin/install -m 0555 "$0" "$receipt_root/revoke-controller"
[[ -n "$test_root" ]] || /usr/sbin/chown root:wheel "$receipt_root/revoke-controller"
receipt=$receipt_root/P00-V2-CAP-A01-revoked.json
temporary=$receipt.tmp.$$
print -r -- \
  "{\"artifactId\":\"P00-V2-CAP-A01\",\"envelopeSha256\":\"$approved_envelope_sha\",\"authorizationRemovedFirst\":true}" \
  > "$temporary"
/bin/chmod 0444 "$temporary"
[[ -n "$test_root" ]] || /usr/sbin/chown root:wheel "$temporary"

# Authorization is always removed before any executable bytes.
/bin/rm -f "$sudoers_target"
[[ ! -e "$sudoers_target" ]] || {
  print -u2 "sudoers authorization removal failed"
  exit 74
}

# After authorization is gone, exact-tree mismatches preserve bytes for
# forensic disposition while keeping every NOPASSWD command unavailable.
[[ "$(hash_file "$manifest_tool")" == "$expected_manifest_tool_sha" ]] || {
  print -u2 "manifest verifier hash disagreement; refusing execution"
  exit 65
}
/usr/bin/python3 "$manifest_tool" verify "$install_root" \
  "$metadata_root/expected-install-manifest.json" "${verify_options[@]}"
/usr/bin/python3 "$manifest_tool" verify "$legacy_root" \
  "$metadata_root/legacy-v1-observed-manifest.json" "${verify_options[@]}"

if [[ -n "$test_root" ]]; then
  for removable in "$install_root" "$legacy_root" "$controller_root/objects" \
    "$controller_root/anchors" "$controller_root/runs" "$controller_root/locks" \
    "$controller_root/requests" "$controller_root/nonces" \
    "$controller_root/quarantine" "$controller_root/metadata"; do
    [[ ! -e "$removable" ]] || /bin/chmod -R u+w "$removable" 2>/dev/null || true
  done
fi
/bin/rm -rf "$install_root" "$legacy_root" \
  "$controller_root/objects" "$controller_root/anchors" "$controller_root/runs" \
  "$controller_root/locks" "$controller_root/requests" "$controller_root/nonces" \
  "$controller_root/quarantine" "$controller_root/metadata"
/bin/mv "$temporary" "$receipt"

for forbidden in "$sudoers_target" "$install_root" "$legacy_root"; do
  [[ ! -e "$forbidden" ]] || {
    print -u2 "revocation left a privileged command path: $forbidden"
    exit 74
  }
done

print "P00-V2-CAP-A01 revoked; authorization removed before executable cleanup"
