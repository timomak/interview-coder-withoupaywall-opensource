export type StorageErrorCode =
  | "KEYCHAIN_LOCKED"
  | "KEYCHAIN_UNAVAILABLE"
  | "KEYCHAIN_ACCESS_DENIED"
  | "INSTALLATION_KEY_CORRUPT"
  | "ENVELOPE_CORRUPT"
  | "ENVELOPE_AUTHENTICATION_FAILED"
  | "ENVELOPE_METADATA_MISMATCH"
  | "UNSUPPORTED_ENVELOPE_VERSION"
  | "PATH_OUTSIDE_ROOT"
  | "PATH_SYMLINK_REJECTED"
  | "PATH_CASE_COLLISION"
  | "PATH_INVALID"
  | "FILE_MODE_UNSAFE"
  | "ATOMIC_WRITE_FAILED"
  | "RAW_AUDIO_REJECTED"
  | "MIGRATION_FAILED"
  | "MIGRATION_ROLLBACK_UNAVAILABLE";

export class StorageError extends Error {
  readonly code: StorageErrorCode;
  readonly cause?: unknown;
  readonly recovery:
    | "unlock-keychain"
    | "use-original-user"
    | "repair-one-record"
    | "free-disk-space"
    | "inspect-migration"
    | "none";

  constructor(
    code: StorageErrorCode,
    message: string,
    options: {
      cause?: unknown;
      recovery?: StorageError["recovery"];
    } = {},
  ) {
    super(message);
    this.name = "StorageError";
    this.code = code;
    this.cause = options.cause;
    this.recovery = options.recovery ?? "none";
  }
}

export function asStorageError(
  error: unknown,
  code: StorageErrorCode,
  message: string,
  recovery: StorageError["recovery"] = "none",
): StorageError {
  return error instanceof StorageError
    ? error
    : new StorageError(code, message, { cause: error, recovery });
}
