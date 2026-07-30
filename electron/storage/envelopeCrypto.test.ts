import { expect, it } from "vitest";
import {
  decryptEnvelope,
  encryptEnvelope,
  EncryptedEnvelopeV1,
} from "./envelope";
import { StorageError } from "./errors";

it("authenticates envelope metadata and rejects tampering", () => {
  const key = Buffer.alloc(32, 0x71);
  const metadata = {
    kind: "record" as const,
    id: "record-01",
    contentType: "application/json",
  };
  const plaintext = Buffer.from("authenticated plaintext");
  const first = encryptEnvelope(key, metadata, plaintext);
  const second = encryptEnvelope(key, metadata, plaintext);
  expect(first.nonce).not.toBe(second.nonce);
  expect(decryptEnvelope(key, first, metadata).equals(plaintext)).toBe(true);

  const tampered: EncryptedEnvelopeV1[] = [
    {
      ...first,
      ciphertext: Buffer.from("changed ciphertext").toString("base64"),
    },
    { ...first, kind: "blob" },
    { ...first, id: "record-02" },
    { ...first, contentType: "text/plain" },
  ];
  for (const envelope of tampered) {
    expect(() => decryptEnvelope(key, envelope)).toThrow(StorageError);
  }
  const wrongVersion = { ...first, version: 2 };
  expect(() =>
    decryptEnvelope(
      key,
      wrongVersion as unknown as EncryptedEnvelopeV1,
    ),
  ).toThrow(StorageError);
  key.fill(0);
  plaintext.fill(0);
});
