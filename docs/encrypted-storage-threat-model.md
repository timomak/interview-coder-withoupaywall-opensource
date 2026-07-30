# Encrypted storage threat model

## Boundary and protected assets

`electron/storage/**` is an IPC-free main-process library. Domain code sees
record/blob interfaces and typed errors, not Electron objects, filesystem paths,
keys, or ciphertext envelopes. The production composition root must inject
Electron `safeStorage` into `ElectronSafeStorageKeyProtector`; on macOS,
`safeStorage` protects its payload through the login Keychain. Production
storage fails closed on another platform, when Keychain is locked/unavailable,
or when the protected key cannot be opened by the current user.

Protected at rest:

- interview/session records, prompts, transcripts, profile text, and search
  terms;
- screenshots, diagrams, thumbnails, cache artifacts, and other blobs;
- migration journals and their source/target mappings;
- the random 256-bit installation key.

Envelope metadata (`kind`, schema version, opaque ID, and content type) is
authenticated but visible. Callers must therefore use non-sensitive opaque IDs
and must not put user content in an ID or content type. Filenames are lowercase
SHA-256 derivations of namespace and ID, so IDs do not appear in paths and
case-insensitive macOS volumes cannot alias case-distinct IDs.

This boundary does not protect plaintext already visible to the running,
unlocked process, screen capture performed elsewhere, a compromised Electron
main process, or a logged-in attacker who can ask Keychain to decrypt through
the application.

## Key lifecycle

A fresh installation generates 32 bytes with Node's operating-system CSPRNG.
Only `safeStorage.encryptString` output is written to
`key/installation-key.protected`; the raw key is never written. The protected
file is atomically created with mode `0600` below a `0700` canonical root. Each
open validates the unprotected key length and returns a temporary buffer that
repositories clear after use. Restart reopens the same protected key rather
than generating another.

`InstallationKeyProtector` is an adapter seam for deterministic tests. The
test-only adapter is a `.cjs` fixture that TypeScript does not emit into the
production Electron build. Production must use
`ElectronSafeStorageKeyProtector`; wiring the test adapter into application code
would violate this threat model.

Keychain failure never creates a replacement key or resets storage:

| Failure | Typed result | Non-destructive recovery |
|---|---|---|
| Keychain locked/unavailable | `KEYCHAIN_LOCKED` / `KEYCHAIN_UNAVAILABLE` | Unlock Keychain and retry |
| Different user or denied decrypt | `KEYCHAIN_ACCESS_DENIED` | Return to the original macOS user/key |
| Invalid unprotected length | `INSTALLATION_KEY_CORRUPT` | Preserve files and inspect protected-key recovery |

## Envelope and repository invariants

Records, blobs, and migration journals use AES-256-GCM envelope schema v1. A
fresh 96-bit CSPRNG nonce is generated for every write. AAD is the canonical
tuple:

```text
[schema, version, kind, opaque ID, content type]
```

Changing ciphertext, tag, kind/type, version, ID, or content type therefore
fails before plaintext is returned. Forward versions are rejected rather than
lossily converted. The implementation uses Node's reviewed `crypto`
primitives—there is no custom cipher, KDF, or authentication construction.

Record enumeration decrypts each file independently. One truncated, tampered,
or malformed record is returned as an isolated issue and is neither deleted nor
used to reset healthy records. Search decrypts records, constructs its
case-folded projection in memory for one call, and never creates a persisted
index, thumbnail, cache, or plaintext temporary file.

The blob API rejects `audio/*`, `application/x-raw-audio`, and the
`raw-audio` retention class before creating a directory, temporary file, or
key. This is a retention prohibition, not merely encryption of audio.

## Filesystem and crash safety

All storage-relative paths are normalized, confined below the canonical root,
and checked component-by-component with `lstat`. Existing symbolic links,
out-of-root paths, unsafe IDs, non-files, and group/world-accessible files are
rejected. Directories are forced to `0700`; files are forced to `0600`.

Writes use a same-directory exclusive `0600` temporary file, complete write,
file `fsync`, atomic rename, permission repair, and directory `fsync`.
Pre-rename interruption or `ENOSPC` removes the temporary file and leaves the
prior valid envelope. Post-rename interruption leaves the complete new
envelope. A partial file is never accepted as a valid record because envelope
structure and GCM authentication are checked on read.

Opaque lowercase hashed filenames avoid case-folding collisions. The path test
also probes the actual test volume so the authoritative macOS run records
whether it is case-insensitive.

## M-02 and M-03 migration/rollback

Both migrations use an AES-GCM-encrypted, atomically written v1 journal. Replay
must supply the exact same ordered source/ID/content-type set. Every transition
is saved before the next destructive action, making replay idempotent.

M-02 converts legacy plaintext screenshot/temp/cache artifacts:

1. Read the canonical non-symlink source into a temporary buffer and write an
   encrypted blob.
2. Reopen/decrypt the blob and compare its SHA-256 to the still-readable
   source.
3. Rename—not copy—the plaintext source into owner-only explicit rollback
   quarantine.
4. Reopen/decrypt and compare again immediately before best-effort deletion of
   the quarantine copy.
5. Mark complete. An interruption resumes from the saved stage.

No newly created plaintext copy exists. Until step 4, rollback removes the new
encrypted blob and renames the quarantine entry back to its original location.
After verified quarantine deletion, rollback is explicitly unavailable rather
than fabricating a new plaintext copy. Raw audio and symlink sources are
rejected and left untouched.

M-03 upgrades an authenticated legacy encrypted envelope to schema v1 through
an injected legacy decrypt adapter. It writes and reopens v1, renames the old
encrypted file to rollback quarantine, verifies both the unchanged rollback
hash and the reopened v1 value, then deletes quarantine. Interruption and
rollback follow the same journal rules. The adapter—not M-03—owns legacy
authentication; an unauthenticated plaintext reader is not an acceptable
production adapter.

## Deletion and residual-risk limits

Removal overwrites a file and `fsync`s before unlink as a best effort. APFS
copy-on-write, snapshots, backups, SSD wear levelling, crash timing, and
filesystem/controller caches can retain older blocks. The application cannot
promise forensic secure erasure on SSD storage. Encryption and Keychain key
custody are the primary at-rest controls; best-effort overwrite is defense in
depth. Operators needing stronger deletion must also remove snapshots/backups
and use platform device-erasure controls.

## Acceptance evidence

The eight storage-owned tests bind directly to P03:

- `keyLifecycle.test.ts` proves one protected random installation key and
  restart reopen, plus the locked production adapter boundary.
- `plaintextLeak.test.ts` byte-scans every fixture file for transcript, prompt,
  screenshot, diagram, profile, index-term, raw-key, base64-key, and hex-key
  material.
- `envelopeCrypto.test.ts` proves nonce uniqueness and ciphertext/AAD metadata
  tamper rejection.
- `atomicity.test.ts` injects interruption and disk exhaustion and observes
  exactly prior-or-new valid state.
- `pathSafety.test.ts` proves modes, traversal/symlink rejection, canonical
  roots, outside-file preservation, and volume case behavior.
- `plaintextMigration.test.ts` proves M-02 encrypted journals, interruption
  replay, decrypt-before-delete, idempotence, rollback, and M-03 quarantine
  rollback.
- `retentionPolicy.test.ts` proves raw-audio rejection and absence of temporary
  fixture bytes.
- `recovery.test.ts` proves locked/wrong-user key recovery and isolated,
  non-destructive record corruption.
