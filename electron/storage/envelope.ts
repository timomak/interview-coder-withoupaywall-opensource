import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";
import { StorageError, asStorageError } from "./errors";

export const ENVELOPE_SCHEMA = "interview-copilot.encrypted-envelope";
export const ENVELOPE_VERSION = 1;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

export type EnvelopeKind = "record" | "blob" | "journal";

export interface EnvelopeMetadata {
  readonly kind: EnvelopeKind;
  readonly id: string;
  readonly contentType: string;
}

export interface EncryptedEnvelopeV1 extends EnvelopeMetadata {
  readonly schema: typeof ENVELOPE_SCHEMA;
  readonly version: typeof ENVELOPE_VERSION;
  readonly nonce: string;
  readonly ciphertext: string;
  readonly authTag: string;
}

function aad(metadata: EnvelopeMetadata): Buffer {
  return Buffer.from(
    JSON.stringify([
      ENVELOPE_SCHEMA,
      ENVELOPE_VERSION,
      metadata.kind,
      metadata.id,
      metadata.contentType,
    ]),
    "utf8",
  );
}

function requireKey(key: Buffer): void {
  if (key.byteLength !== KEY_BYTES) {
    throw new StorageError(
      "INSTALLATION_KEY_CORRUPT",
      "The installation key is not a 256-bit key.",
      { recovery: "use-original-user" },
    );
  }
}

function decodeBase64(
  value: unknown,
  field: string,
  bytes?: number,
  allowEmpty = false,
): Buffer {
  if (
    typeof value !== "string" ||
    (!allowEmpty && value.length === 0) ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(value)
  ) {
    if (allowEmpty && value === "") return Buffer.alloc(0);
    throw new StorageError("ENVELOPE_CORRUPT", `Invalid ${field}.`, {
      recovery: "repair-one-record",
    });
  }
  const decoded = Buffer.from(value, "base64");
  if (
    decoded.toString("base64") !== value ||
    (bytes !== undefined && decoded.byteLength !== bytes)
  ) {
    decoded.fill(0);
    throw new StorageError("ENVELOPE_CORRUPT", `Invalid ${field} length.`, {
      recovery: "repair-one-record",
    });
  }
  return decoded;
}

export function serializeEnvelope(envelope: EncryptedEnvelopeV1): Buffer {
  return Buffer.from(JSON.stringify(envelope), "utf8");
}

export function parseEnvelope(bytes: Buffer): EncryptedEnvelopeV1 {
  let value: unknown;
  try {
    value = JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    throw new StorageError("ENVELOPE_CORRUPT", "The envelope is not valid JSON.", {
      cause: error,
      recovery: "repair-one-record",
    });
  }
  if (typeof value !== "object" || value === null) {
    throw new StorageError("ENVELOPE_CORRUPT", "The envelope is not an object.", {
      recovery: "repair-one-record",
    });
  }
  const candidate = value as Record<string, unknown>;
  if (candidate.schema !== ENVELOPE_SCHEMA) {
    throw new StorageError("ENVELOPE_CORRUPT", "Unknown envelope schema.", {
      recovery: "repair-one-record",
    });
  }
  if (candidate.version !== ENVELOPE_VERSION) {
    throw new StorageError(
      "UNSUPPORTED_ENVELOPE_VERSION",
      "This encrypted record was written by an unsupported storage version.",
      { recovery: "repair-one-record" },
    );
  }
  if (
    !["record", "blob", "journal"].includes(String(candidate.kind)) ||
    typeof candidate.id !== "string" ||
    typeof candidate.contentType !== "string"
  ) {
    throw new StorageError("ENVELOPE_CORRUPT", "Invalid envelope metadata.", {
      recovery: "repair-one-record",
    });
  }
  // Decode here as strict structural validation; decrypt performs fresh decoding.
  decodeBase64(candidate.nonce, "nonce", NONCE_BYTES).fill(0);
  decodeBase64(candidate.authTag, "authentication tag", TAG_BYTES).fill(0);
  decodeBase64(candidate.ciphertext, "ciphertext", undefined, true).fill(0);
  return candidate as unknown as EncryptedEnvelopeV1;
}

export function encryptEnvelope(
  key: Buffer,
  metadata: EnvelopeMetadata,
  plaintext: Buffer,
  nonceSource: (size: number) => Buffer = randomBytes,
): EncryptedEnvelopeV1 {
  requireKey(key);
  const nonce = nonceSource(NONCE_BYTES);
  if (nonce.byteLength !== NONCE_BYTES) {
    throw new StorageError("ENVELOPE_CORRUPT", "Nonce source returned an invalid nonce.");
  }
  const temporaryPlaintext = Buffer.from(plaintext);
  try {
    const cipher = createCipheriv("aes-256-gcm", key, nonce);
    cipher.setAAD(aad(metadata));
    const ciphertext = Buffer.concat([
      cipher.update(temporaryPlaintext),
      cipher.final(),
    ]);
    return {
      schema: ENVELOPE_SCHEMA,
      version: ENVELOPE_VERSION,
      ...metadata,
      nonce: nonce.toString("base64"),
      ciphertext: ciphertext.toString("base64"),
      authTag: cipher.getAuthTag().toString("base64"),
    };
  } finally {
    temporaryPlaintext.fill(0);
    nonce.fill(0);
  }
}

export function decryptEnvelope(
  key: Buffer,
  envelope: EncryptedEnvelopeV1,
  expected?: EnvelopeMetadata,
): Buffer {
  requireKey(key);
  if (envelope.schema !== ENVELOPE_SCHEMA) {
    throw new StorageError("ENVELOPE_CORRUPT", "Unknown envelope schema.", {
      recovery: "repair-one-record",
    });
  }
  if (envelope.version !== ENVELOPE_VERSION) {
    throw new StorageError(
      "UNSUPPORTED_ENVELOPE_VERSION",
      "This encrypted record was written by an unsupported storage version.",
      { recovery: "repair-one-record" },
    );
  }
  if (
    expected &&
    (envelope.kind !== expected.kind ||
      envelope.id !== expected.id ||
      envelope.contentType !== expected.contentType)
  ) {
    throw new StorageError(
      "ENVELOPE_METADATA_MISMATCH",
      "Encrypted record metadata does not match the requested record.",
      { recovery: "repair-one-record" },
    );
  }
  const nonce = decodeBase64(envelope.nonce, "nonce", NONCE_BYTES);
  const tag = decodeBase64(envelope.authTag, "authentication tag", TAG_BYTES);
  const ciphertext = decodeBase64(
    envelope.ciphertext,
    "ciphertext",
    undefined,
    true,
  );
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, nonce);
    decipher.setAAD(
      aad({
        kind: envelope.kind,
        id: envelope.id,
        contentType: envelope.contentType,
      }),
    );
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch (error) {
    throw asStorageError(
      error,
      "ENVELOPE_AUTHENTICATION_FAILED",
      "Encrypted record authentication failed; no plaintext was released.",
      "repair-one-record",
    );
  } finally {
    nonce.fill(0);
    tag.fill(0);
    ciphertext.fill(0);
  }
}
