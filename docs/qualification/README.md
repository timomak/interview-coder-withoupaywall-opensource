# Qualification inputs

`macos-google-meet.json` is intentionally absent until the release operator has
both exact current-stable arm64 and x64 machines, purpose-separated production
public keys, the visible current Meet build, and each display's exact geometry.
Each tuple also pins the SHA-256 of the reviewed remote-observer helper. Signed
observer receipts whose helper digest differs from that committed value fail
before collection starts; matching two receipts to each other is not enough.
The validator treats absence as a release failure, never as a skip or an empty
supported matrix. Placeholder, wildcard, range, or `latest` values are
prohibited.

After the matrix is committed, Developer ID signing/notarization creates the
detached statement under the fixed controller-owned external root. Live M01 and
M02 evidence is collected with a second physical device and independent remote
observer. Raw evidence is retained only in encrypted release storage and is
never committed or automatically uploaded.

`npm run qualify:meet -- --collect-missing` leaves each physical run in
`awaiting-analysis-and-attestations` until the external analysis, signed role
attestations, bundle manifests, and independent review are placed in the fixed
run-specific `.artifacts/qualification-external/<matrix>/<tuple>/<M01|M02>/<run>/`
inbox. The command reads only exclusive, non-group/world-writable regular files,
validates the entire candidate in memory, and only then seals those exact bytes
into the write-once run. This ordering prevents a malformed or helper-mismatched
external packet from consuming the immutable collection.

Package inspection likewise treats the detached release statement as expected
data, not observed data. Team identity and the leaf certificate digest come
from `codesign`; the notarization-ticket digest comes from the ticket retrieved
by verbose `stapler validate`. All three must equal the signed statement before
an inspection receipt can be written.
