#!/bin/zsh
set -euo pipefail

bundle_root=${0:A:h}
capability_root=${bundle_root:h}
a02_root=$capability_root/P00-V2-CAP-A02
a03_root=$capability_root/P00-V2-CAP-A03
vendor_root=$bundle_root/vendor
build_root=$bundle_root/build

hash_file() {
  /usr/bin/shasum -a 256 "$1" | /usr/bin/awk '{print $1}'
}

require_hash() {
  local path=$1
  local expected=$2
  [[ -f "$path" && "$(hash_file "$path")" == "$expected" ]] || {
    print -u2 "build input hash disagreement: $path"
    exit 65
  }
}

require_hash "$a02_root/build/expected-install-manifest.json" \
  945ffda713b5e9a02d2472d6f4e9e91340111384a6cdeab40890a5f3b572768b
require_hash "$a02_root/build/release-envelope.json" \
  69f88512f7b2740326346c57593ed428812a2e278eb86b62a005b17b9e56286f
require_hash "$a02_root/build/legacy-v1-observed-manifest.json" \
  54997fb321b9b83e4237e23ad6914e10777f130df35ff9de8b9aae692ee7d97e
require_hash "$a02_root/config/sudoers" \
  7fe7480026d425056231200a518c26c0e40b79ef59c130d6924d5af30e23170b
require_hash "$a03_root/build/release-envelope.json" \
  00ea8696be7af50cfadd9035f9d7b44cb9d560b96c1f563c9ded0f6197a1af41
/usr/bin/python3 "$a03_root/tools/envelope.py" verify \
  "$a03_root" "$a03_root/build/release-envelope.json"

if [[ -d "$vendor_root" ]]; then
  /bin/chmod -R u+w "$vendor_root"
  /bin/rm -rf "$vendor_root"
fi
/bin/mkdir -p "$vendor_root/a02/build" "$vendor_root/a02/config" \
  "$vendor_root/a03" "$build_root"

for relative in \
  build/expected-install-manifest.json \
  build/release-envelope.json \
  build/legacy-v1-observed-manifest.json \
  config/sudoers; do
  /bin/mkdir -p "$vendor_root/a02/${relative:h}"
  /usr/bin/install -m 0444 "$a02_root/$relative" "$vendor_root/a02/$relative"
done

members=("${(@f)$(/usr/bin/python3 - "$a03_root/build/release-envelope.json" <<'PY'
import json, sys
document = json.load(open(sys.argv[1]))
print("\n".join(sorted(entry["path"] for entry in document["members"].values())))
PY
)}")
for relative in "${members[@]}" build/release-envelope.json; do
  /bin/mkdir -p "$vendor_root/a03/${relative:h}"
  /usr/bin/install -m 0444 "$a03_root/$relative" "$vendor_root/a03/$relative"
done

/usr/bin/find "$vendor_root" -type d -exec /bin/chmod 0555 {} +
/usr/bin/find "$vendor_root" -type f -exec /bin/chmod 0444 {} +

for generated in release-envelope.json admin-handoff.txt validation-report.json; do
  if [[ -e "$build_root/$generated" ]]; then
    /bin/chmod u+w "$build_root/$generated"
    /bin/rm -f "$build_root/$generated"
  fi
done
/usr/bin/python3 "$bundle_root/tools/envelope.py" create \
  "$bundle_root" "$build_root/release-envelope.json"
/bin/chmod 0444 "$build_root/release-envelope.json"
/usr/bin/python3 "$bundle_root/tools/envelope.py" verify \
  "$bundle_root" "$build_root/release-envelope.json"
/usr/bin/python3 "$bundle_root/tools/admin_handoff.py" \
  "$bundle_root" "$build_root/admin-handoff.txt"
/bin/chmod 0444 "$build_root/admin-handoff.txt"

print "artifact_id=P00-V2-CAP-A03-RECOVERY-03"
print "envelope_sha256=$(hash_file "$build_root/release-envelope.json")"
print "handoff_sha256=$(hash_file "$build_root/admin-handoff.txt")"
