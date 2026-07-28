#!/bin/zsh
set -euo pipefail

bundle_root=${0:A:h}
build_root=$bundle_root/build
payload=$build_root/payload
legacy_controller=/Users/thirdfacedev/.codex/orchestration/TimoCodes-evidence/P01-controller-P00-R9/src/Controller.swift
node_source=/opt/homebrew/Cellar/node@20/20.20.2/bin/node
npm_source=/opt/homebrew/Cellar/node@20/20.20.2/lib/node_modules/npm

expected_legacy_sha=42fd20cae6dd517a4f3fffabf1c24a38b16abdb5f4d0132c463a429271e17e77
expected_node_sha=edc0c98fee8947a04913cb45cf80e7341653b0ea9e907ff3dc50d7fdaedda1d2
expected_npm_cli_sha=8e5f6f3429f8cdbe693cdc29904e9d5a7b127a494bd15c804bd54c7403bfcbe7

hash_file() {
  /usr/bin/shasum -a 256 "$1" | /usr/bin/awk '{print $1}'
}

require_hash() {
  local file=$1
  local expected=$2
  local actual
  [[ -f "$file" ]] || {
    print -u2 "missing build input: $file"
    exit 66
  }
  actual=$(hash_file "$file")
  [[ "$actual" == "$expected" ]] || {
    print -u2 "build input hash mismatch for $file: expected $expected, got $actual"
    exit 65
  }
}

require_hash "$legacy_controller" "$expected_legacy_sha"
require_hash "$node_source" "$expected_node_sha"
require_hash "$npm_source/bin/npm-cli.js" "$expected_npm_cli_sha"

if [[ -d "$payload" ]]; then
  /bin/chmod -R u+w "$payload"
fi
/bin/rm -rf "$payload"
for generated in Controller.swift controller native-self-test.json \
  expected-install-manifest.json legacy-v1-observed-manifest.json \
  payload-files.txt payload.tar payload.tar.gz release-envelope.json \
  admin-handoff.txt; do
  if [[ -e "$build_root/$generated" ]]; then
    /bin/chmod u+w "$build_root/$generated"
    /bin/rm -f "$build_root/$generated"
  fi
done
/bin/mkdir -p "$build_root" "$payload/bin" "$payload/libexec" \
  "$payload/config" "$payload/toolchain/bin" "$payload/toolchain/lib/node_modules"

/usr/bin/python3 "$bundle_root/source/render-controller.py" \
  "$legacy_controller" "$build_root/Controller.swift"
xcrun swiftc -parse-as-library -O -framework Security -framework CryptoKit \
  "$build_root/Controller.swift" -o "$build_root/controller"

/usr/bin/install -m 0555 "$build_root/controller" "$payload/bin/arm-phase"
/usr/bin/install -m 0555 "$build_root/controller" "$payload/bin/verify-phase"
/usr/bin/install -m 0555 "$build_root/controller" "$payload/libexec/arm-phase-core"
/usr/bin/install -m 0555 "$build_root/controller" "$payload/libexec/verify-phase-core"
/usr/bin/install -m 0555 "$build_root/controller" "$payload/libexec/controller-self-test"
/usr/bin/install -m 0555 "$build_root/controller" "$payload/toolchain/bin/npm"
/usr/bin/install -m 0555 "$node_source" "$payload/toolchain/bin/node"
/bin/cp -R "$npm_source" "$payload/toolchain/lib/node_modules/npm"
/usr/bin/install -m 0444 "$bundle_root/config/npmrc" "$payload/config/npmrc"
/usr/bin/install -m 0444 "$bundle_root/config/capability-registry.json" \
  "$payload/config/capability-registry.json"
/usr/bin/install -m 0444 "$bundle_root/config/request-schema.json" \
  "$payload/config/request-schema.json"
/usr/bin/install -m 0555 "$bundle_root/source/revoke.sh" \
  "$payload/libexec/revoke-controller"
/usr/bin/install -m 0555 "$bundle_root/tools/manifest.py" \
  "$payload/libexec/manifest.py"

/bin/chmod -R u+w "$payload"
/usr/bin/find "$payload" -type d -exec /bin/chmod 0555 {} +
/usr/bin/find "$payload" -type f -exec /bin/chmod 0444 {} +
/bin/chmod 0555 "$payload/bin/arm-phase" "$payload/bin/verify-phase" \
  "$payload/libexec/arm-phase-core" "$payload/libexec/verify-phase-core" \
  "$payload/libexec/controller-self-test" "$payload/libexec/revoke-controller" \
  "$payload/libexec/manifest.py" \
  "$payload/toolchain/bin/node" "$payload/toolchain/bin/npm"

P00_V2_SELF_TEST_TIMESTAMP=1970-01-01T00:00:00Z \
  "$build_root/controller" --self-test --evidence "$build_root/native-self-test.json"
/bin/chmod 0444 "$build_root/Controller.swift" "$build_root/controller" \
  "$build_root/native-self-test.json"

/usr/bin/python3 "$bundle_root/tools/manifest.py" generate \
  "$payload" "$build_root/expected-install-manifest.json" --allow-source-provenance
/usr/bin/python3 "$bundle_root/tools/manifest.py" generate \
  /Users/Shared/InterviewCopilot/verification-controller/v1 \
  "$build_root/legacy-v1-observed-manifest.json"
/bin/chmod 0444 "$build_root/expected-install-manifest.json"
/bin/chmod 0444 "$build_root/legacy-v1-observed-manifest.json"
/usr/bin/python3 "$bundle_root/tools/manifest.py" verify \
  "$payload" "$build_root/expected-install-manifest.json" --allow-source-provenance

/usr/bin/find "$payload" -exec /usr/bin/touch -h -t 198001010000 {} +
(
  cd "$build_root"
  /usr/bin/find payload -print | LC_ALL=C /usr/bin/sort > payload-files.txt
  COPYFILE_DISABLE=1 /usr/bin/tar -cf payload.tar \
    --format ustar --no-recursion -T payload-files.txt
  /usr/bin/gzip -n -f payload.tar
)
/bin/chmod 0444 "$build_root/payload.tar.gz"

/usr/bin/python3 "$bundle_root/tools/envelope.py" create \
  "$bundle_root" "$build_root/release-envelope.json"
/bin/chmod 0444 "$build_root/release-envelope.json"
/usr/bin/python3 "$bundle_root/tools/envelope.py" verify \
  "$bundle_root" "$build_root/release-envelope.json"
/usr/bin/python3 "$bundle_root/tools/admin_handoff.py" \
  "$bundle_root" "$build_root/admin-handoff.txt"
/bin/chmod 0444 "$build_root/admin-handoff.txt"

print "artifact_id=P00-V2-CAP-A01"
print "controller_sha256=$(hash_file "$build_root/controller")"
print "manifest_sha256=$(hash_file "$build_root/expected-install-manifest.json")"
print "envelope_sha256=$(hash_file "$build_root/release-envelope.json")"
