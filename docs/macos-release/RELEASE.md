# macOS release and Google Meet qualification

InterviewCopilot ships for macOS on Apple silicon and Intel only. The build
produces one DMG for each architecture. Windows, Linux, browser-tab sharing,
other meeting applications, Practice scoring, custom named modes, and a generic
setup certification surface are deferred and are not release claims.

## Qualified privacy wording

On a listed tuple, the notarized InterviewCopilot window was absent from the
remote Google Meet presentation while the ordinary control window remained
visible. This is a narrow compatibility result, not a security boundary or a
guarantee for a neighboring OS, browser, Meet build, display, architecture,
package, or share scope. A local preview never establishes the result.

The supported matrix is committed at
`docs/qualification/macos-google-meet.json` only after exact arm64 and x64
hardware is available. Each row freezes macOS ProductVersion and BuildVersion,
Chrome's four-part version, the visible Meet build, display geometry/scaling,
architecture, and both independently run scopes. Until that file exists with a
valid closed matrix, detached release statement, two complete remote-observed
bundles per row, and detached independent reviews, the release state is **Not
verified** and no tuple is supported.

## Entitlements and permissions

The parent app has exactly these entitlements, each boolean true:

- `com.apple.security.cs.allow-jit`
- `com.apple.security.cs.allow-unsigned-executable-memory`
- `com.apple.security.cs.disable-library-validation`
- `com.apple.security.device.audio-input`
- `com.apple.security.personal-information.speech-recognition`

Nested executables inherit only the first three code-signing entitlements.
Screen capture and microphone access use explicit macOS usage descriptions and
TCC. App Sandbox, development debugging, camera, location, contacts, calendar,
automation, network, USB, Bluetooth, iCloud, application groups, and keychain
groups are not added to either entitlement file.

## Guided qualification and stale state

Privacy & Capture guides **Entire display** and **Specific window** separately.
The local operator starts a fresh two-party Meet and the independent observer
uses a second physical device. The observer confirms the received presentation,
not the local preview, for a continuous 120-second moving-marker interval.
Browser-tab sharing is explicitly outside the procedure.

M-10 stores the exact tuple, both scope results, date, evidence-manifest digest,
and final bundle-manifest digest in the existing authenticated encrypted store.
A missing or older record is Not verified. Any tuple or package change is Retest
required. A failed scope is Failed. Rollback never carries Verified to another
build.

## Evidence and trust boundary

The committed matrix is pre-build policy only. The release controller pins a
clean detached commit before reading artifacts and hashes the exact matrix bytes.
The root-owned external release statement binds that commit, matrix digest,
application version, sealed arm64/x64 package hashes, Developer ID certificate,
accepted notarization ticket, staple, Gatekeeper result, and a purpose-separated
Ed25519 release key. Artifacts never select a checkout, matrix, or trust key.

Each scope bundle uses canonical closed JSON, exact manifest membership, two
independent role attestations, bundle metadata, a final bundle manifest, and an
optional purpose-separated bundle signature. The exact 16-node/28-edge graph is
acyclic. A detached independent-review record binds the final bundle digest.
Missing, extra, noncanonical, untrusted, local-only, or byte-mismatched evidence
fails closed. The collector enforces first-touch/write-once history; the offline
validator claims only observable final state.

## Diagnostics and recovery

Diagnostics remain on the local Mac. The preview excludes transcripts, audio,
screenshots, prompts, responses, profiles, opportunities, credentials, tokens,
and device identifiers. Export is a manual write of the exact displayed
redacted preview; there is no upload path. Provider, microphone, system-audio,
and screen-capture failures disable only the affected action. Repair and retry
preserve the active session.

## Installation, update, and rollback

Install only a Developer ID signed, notarized, stapled DMG whose identity passes
the release validator. Update by installing a newly qualified DMG. Uninstall by
moving InterviewCopilot to Trash; remove its Application Support directory only
when encrypted local data is no longer needed. Roll back to the last accepted
package and mark M-10 Retest required. No package is published automatically.

## SBOM and vulnerability disposition

The release includes [SPDX SBOM](sbom.spdx.json) generated from the locked npm
dependency graph. [Vulnerability disposition](VULNERABILITY-DISPOSITION.md)
records the audit date, command, runtime exposure, and release decision. The
AGPL license and complete corresponding source remain available in this
repository.
