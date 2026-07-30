const {
  createCipheriv,
  createDecipheriv,
  createHash,
} = require("node:crypto");
const { mkdtemp, readFile, readdir, rm } = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const WRAPPING_KEY = createHash("sha256")
  .update("InterviewCopilot deterministic test-only key protector")
  .digest();
const WRAPPING_NONCE = Buffer.alloc(12, 0x5a);

class DeterministicFakeKeyProtector {
  constructor(state = "available") {
    this.state = state;
  }

  async protect(key) {
    this.requireAvailable();
    const cipher = createCipheriv("aes-256-gcm", WRAPPING_KEY, WRAPPING_NONCE);
    cipher.setAAD(Buffer.from("test-installation-key"));
    return Buffer.concat([cipher.update(key), cipher.final(), cipher.getAuthTag()]);
  }

  async unprotect(protectedKey) {
    this.requireAvailable();
    if (this.state === "wrong-user") {
      const error = new Error("Deterministic wrong-user test fixture.");
      error.code = "KEYCHAIN_ACCESS_DENIED";
      error.recovery = "use-original-user";
      throw error;
    }
    if (protectedKey.length < 16) {
      const error = new Error("Deterministic protected-key fixture is truncated.");
      error.code = "INSTALLATION_KEY_CORRUPT";
      throw error;
    }
    const decipher = createDecipheriv(
      "aes-256-gcm",
      WRAPPING_KEY,
      WRAPPING_NONCE,
    );
    decipher.setAAD(Buffer.from("test-installation-key"));
    decipher.setAuthTag(protectedKey.subarray(protectedKey.length - 16));
    return Buffer.concat([
      decipher.update(protectedKey.subarray(0, protectedKey.length - 16)),
      decipher.final(),
    ]);
  }

  requireAvailable() {
    if (this.state === "locked") {
      const error = new Error("Deterministic locked-Keychain test fixture.");
      error.code = "KEYCHAIN_LOCKED";
      error.recovery = "unlock-keychain";
      throw error;
    }
  }
}

async function withTempDirectory(run) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "ic-p03-"));
  try {
    return await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function readTree(root) {
  const result = new Map();
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(target);
      } else if (entry.isFile()) {
        result.set(path.relative(root, target), await readFile(target));
      }
    }
  }
  await visit(root);
  return result;
}

const DETERMINISTIC_INSTALLATION_KEY = Buffer.from(
  Array.from({ length: 32 }, (_, index) => index + 1),
);

module.exports = {
  DETERMINISTIC_INSTALLATION_KEY,
  DeterministicFakeKeyProtector,
  readTree,
  withTempDirectory,
};
