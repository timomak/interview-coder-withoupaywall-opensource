import { StorageError } from "./errors";

export type RecoveryState =
  | {
      readonly kind: "keychain-locked";
      readonly destructive: false;
      readonly action: "unlock-keychain";
    }
  | {
      readonly kind: "wrong-user-or-key";
      readonly destructive: false;
      readonly action: "use-original-user";
    }
  | {
      readonly kind: "isolated-record-corruption";
      readonly destructive: false;
      readonly action: "repair-one-record";
    }
  | {
      readonly kind: "storage-unavailable";
      readonly destructive: false;
      readonly action: "none";
    };

export function recoveryFor(error: StorageError): RecoveryState {
  switch (error.code) {
    case "KEYCHAIN_LOCKED":
      return {
        kind: "keychain-locked",
        destructive: false,
        action: "unlock-keychain",
      };
    case "KEYCHAIN_ACCESS_DENIED":
    case "INSTALLATION_KEY_CORRUPT":
      return {
        kind: "wrong-user-or-key",
        destructive: false,
        action: "use-original-user",
      };
    case "ENVELOPE_AUTHENTICATION_FAILED":
    case "ENVELOPE_CORRUPT":
    case "ENVELOPE_METADATA_MISMATCH":
    case "UNSUPPORTED_ENVELOPE_VERSION":
      return {
        kind: "isolated-record-corruption",
        destructive: false,
        action: "repair-one-record",
      };
    default:
      return {
        kind: "storage-unavailable",
        destructive: false,
        action: "none",
      };
  }
}
