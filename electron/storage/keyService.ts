import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { AtomicFileWriter, StoragePaths } from "./paths";
import { StorageError, asStorageError } from "./errors";

const INSTALLATION_KEY_BYTES = 32;

export interface InstallationKeyProtector {
  protect(key: Buffer): Promise<Buffer>;
  unprotect(protectedKey: Buffer): Promise<Buffer>;
}

export interface SafeStorageBoundary {
  isEncryptionAvailable(): boolean;
  encryptString(plaintext: string): Buffer;
  decryptString(ciphertext: Buffer): string;
}

/**
 * Production boundary. Electron safeStorage is backed by the login Keychain on
 * macOS. Electron is injected so repositories and tests never import Electron.
 */
export class ElectronSafeStorageKeyProtector implements InstallationKeyProtector {
  constructor(
    private readonly safeStorage: SafeStorageBoundary,
    private readonly platform: NodeJS.Platform = process.platform,
  ) {}

  async protect(key: Buffer): Promise<Buffer> {
    this.requireAvailable();
    try {
      return this.safeStorage.encryptString(key.toString("base64"));
    } catch (error) {
      throw new StorageError(
        "KEYCHAIN_ACCESS_DENIED",
        "macOS Keychain refused installation-key protection.",
        { cause: error, recovery: "unlock-keychain" },
      );
    }
  }

  async unprotect(protectedKey: Buffer): Promise<Buffer> {
    this.requireAvailable();
    try {
      const value = Buffer.from(
        this.safeStorage.decryptString(protectedKey),
        "base64",
      );
      if (value.byteLength !== INSTALLATION_KEY_BYTES) {
        value.fill(0);
        throw new StorageError(
          "INSTALLATION_KEY_CORRUPT",
          "Protected installation key has an invalid length.",
          { recovery: "use-original-user" },
        );
      }
      return value;
    } catch (error) {
      throw asStorageError(
        error,
        "KEYCHAIN_ACCESS_DENIED",
        "The installation key belongs to another user or cannot be decrypted.",
        "use-original-user",
      );
    }
  }

  private requireAvailable(): void {
    if (this.platform !== "darwin") {
      throw new StorageError(
        "KEYCHAIN_UNAVAILABLE",
        "Production encrypted storage requires macOS Keychain.",
        { recovery: "none" },
      );
    }
    if (!this.safeStorage.isEncryptionAvailable()) {
      throw new StorageError(
        "KEYCHAIN_LOCKED",
        "Unlock macOS Keychain to open encrypted Interview Copilot data.",
        { recovery: "unlock-keychain" },
      );
    }
  }
}

export class InstallationKeyService {
  private pending?: Promise<Buffer>;
  private readonly keyRelativePath = "key/installation-key.protected";

  constructor(
    private readonly paths: StoragePaths,
    private readonly protector: InstallationKeyProtector,
    private readonly writer: AtomicFileWriter = new AtomicFileWriter(paths),
    private readonly random: (size: number) => Buffer = randomBytes,
  ) {}

  get(): Promise<Buffer> {
    this.pending ??= this.loadOrCreate().finally(() => {
      this.pending = undefined;
    });
    return this.pending.then((key) => Buffer.from(key));
  }

  private async loadOrCreate(): Promise<Buffer> {
    await this.paths.directory("key");
    const target = this.paths.resolve(this.keyRelativePath);
    try {
      const protectedKey = await readFile(await this.paths.checkedFile(this.keyRelativePath));
      try {
        return await this.protector.unprotect(protectedKey);
      } finally {
        protectedKey.fill(0);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }

    const key = this.random(INSTALLATION_KEY_BYTES);
    if (key.byteLength !== INSTALLATION_KEY_BYTES) {
      key.fill(0);
      throw new StorageError(
        "INSTALLATION_KEY_CORRUPT",
        "Random source did not return a 256-bit installation key.",
      );
    }
    let protectedKey: Buffer | undefined;
    try {
      protectedKey = await this.protector.protect(key);
      await this.writer.write(this.keyRelativePath, protectedKey);
      // Reopen through the production boundary before accepting the lifecycle.
      const stored = await readFile(target);
      const reopened = await this.protector.unprotect(stored);
      stored.fill(0);
      if (!reopened.equals(key)) {
        reopened.fill(0);
        throw new StorageError(
          "INSTALLATION_KEY_CORRUPT",
          "Protected installation key did not round-trip.",
        );
      }
      reopened.fill(0);
      return key;
    } catch (error) {
      key.fill(0);
      throw error;
    } finally {
      protectedKey?.fill(0);
    }
  }
}
