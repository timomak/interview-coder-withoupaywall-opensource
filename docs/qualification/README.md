# Qualification inputs

`macos-google-meet.json` is intentionally absent until the release operator has
both exact current-stable arm64 and x64 machines, purpose-separated production
public keys, the visible current Meet build, and each display's exact geometry.
The validator treats absence as a release failure, never as a skip or an empty
supported matrix. Placeholder, wildcard, range, or `latest` values are
prohibited.

After the matrix is committed, Developer ID signing/notarization creates the
detached statement under the fixed controller-owned external root. Live M01 and
M02 evidence is collected with a second physical device and independent remote
observer. Raw evidence is retained only in encrypted release storage and is
never committed or automatically uploaded.
