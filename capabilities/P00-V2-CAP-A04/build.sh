#!/bin/zsh
set -euo pipefail

bundle_root=${0:A:h}
build_root=$bundle_root/build
payload=$build_root/payload
a03_controller=$bundle_root/../P00-V2-CAP-A03/build/Controller.swift
node_source=/opt/homebrew/Cellar/node@20/20.20.2/bin/node
npm_source=/opt/homebrew/Cellar/node@20/20.20.2/lib/node_modules/npm
expected_a03_controller_sha=55e5ad28c31de53beb0389646be07e1bd7547c4539bbbd094a62f88120550903
expected_node_sha=edc0c98fee8947a04913cb45cf80e7341653b0ea9e907ff3dc50d7fdaedda1d2
expected_npm_cli_sha=8e5f6f3429f8cdbe693cdc29904e9d5a7b127a494bd15c804bd54c7403bfcbe7

hash_file() { /usr/bin/shasum -a 256 "$1" | /usr/bin/awk '{print $1}'; }
require_hash() {
  [[ -f "$1" && "$(hash_file "$1")" == "$2" ]] || {
    print -u2 "build input identity disagreement: $1"
    exit 65
  }
}
require_hash "$a03_controller" "$expected_a03_controller_sha"
require_hash "$node_source" "$expected_node_sha"
require_hash "$npm_source/bin/npm-cli.js" "$expected_npm_cli_sha"

[[ ! -d "$payload" ]] || /bin/chmod -R u+w "$payload"
/bin/rm -rf "$build_root"
/bin/mkdir -p "$payload/bin" "$payload/libexec" "$payload/config" \
  "$payload/toolchain/bin" "$payload/toolchain/lib/node_modules"

/usr/bin/python3 "$bundle_root/source/render-controller.py" \
  "$a03_controller" "$build_root/Controller.swift"
xcrun swiftc -parse-as-library -O -framework Security -framework CryptoKit \
  "$build_root/Controller.swift" -o "$build_root/controller"

for path in bin/arm-phase bin/verify-phase libexec/arm-phase-core \
  libexec/verify-phase-core libexec/controller-self-test; do
  /usr/bin/install -m 0555 "$build_root/controller" "$payload/$path"
done
/usr/bin/install -m 0555 "$build_root/controller" "$payload/toolchain/bin/npm"
/usr/bin/install -m 0555 "$node_source" "$payload/toolchain/bin/node"
/bin/cp -R "$npm_source" "$payload/toolchain/lib/node_modules/npm"
for file in npmrc capability-registry.json request-schema.json; do
  /usr/bin/install -m 0444 "$bundle_root/config/$file" "$payload/config/$file"
done
/usr/bin/install -m 0555 "$bundle_root/source/revoke.sh" "$payload/libexec/revoke-controller"
/usr/bin/install -m 0555 "$bundle_root/tools/manifest.py" "$payload/libexec/manifest.py"
/usr/bin/install -m 0555 "$bundle_root/tools/quiesce.py" "$payload/libexec/quiesce.py"
/usr/bin/install -m 0555 "$bundle_root/tools/receipt.py" "$payload/libexec/receipt.py"

/bin/chmod -R u+w "$payload"
/usr/bin/find "$payload" -type d -exec /bin/chmod 0555 {} +
/usr/bin/find "$payload" -type f -exec /bin/chmod 0444 {} +
/bin/chmod 0555 "$payload"/bin/* "$payload"/libexec/* "$payload"/toolchain/bin/*

P00_V2_SELF_TEST_TIMESTAMP=1970-01-01T00:00:00Z \
  "$build_root/controller" --self-test --evidence "$build_root/native-self-test.json"
/bin/chmod 0444 "$build_root/Controller.swift" "$build_root/controller" \
  "$build_root/native-self-test.json"

/usr/bin/python3 "$bundle_root/tools/manifest.py" generate \
  "$payload" "$build_root/expected-install-manifest.json" --allow-source-provenance
/bin/chmod 0444 "$build_root/expected-install-manifest.json"
/usr/bin/python3 "$bundle_root/tools/manifest.py" verify \
  "$payload" "$build_root/expected-install-manifest.json" --allow-source-provenance

/usr/bin/find "$payload" -exec /usr/bin/touch -h -t 198001010000 {} +
(
  cd "$build_root"
  /usr/bin/find payload -print | LC_ALL=C /usr/bin/sort > payload-files.txt
  COPYFILE_DISABLE=1 /usr/bin/tar -cf payload.tar --format ustar --no-recursion -T payload-files.txt
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

print "artifact_id=P00-V2-CAP-A04"
print "controller_sha256=$(hash_file "$build_root/controller")"
print "manifest_sha256=$(hash_file "$build_root/expected-install-manifest.json")"
print "envelope_sha256=$(hash_file "$build_root/release-envelope.json")"
