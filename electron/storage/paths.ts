import { createHash, randomBytes } from "node:crypto";
import {
  chmod,
  lstat,
  mkdir,
  open,
  readdir,
  realpath,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import path from "node:path";
import { StorageError, asStorageError } from "./errors";

export const DIRECTORY_MODE = 0o700;
export const FILE_MODE = 0o600;

export type AtomicStage =
  | "opened"
  | "written"
  | "synced"
  | "before-rename"
  | "renamed";

export type AtomicFaultHook = (
  stage: AtomicStage,
  target: string,
) => void | Promise<void>;

function assertRelative(relativePath: string): string {
  if (
    relativePath.length === 0 ||
    path.isAbsolute(relativePath) ||
    relativePath.includes("\0")
  ) {
    throw new StorageError("PATH_INVALID", "Storage path must be a relative path.");
  }
  const normalized = path.normalize(relativePath);
  if (
    normalized === ".." ||
    normalized.startsWith(`..${path.sep}`) ||
    normalized !== relativePath
  ) {
    throw new StorageError("PATH_OUTSIDE_ROOT", "Storage path escapes its root.");
  }
  return normalized;
}

async function rejectSymlinks(root: string, target: string): Promise<void> {
  const relative = path.relative(root, target);
  let current = root;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    try {
      const info = await lstat(current);
      if (info.isSymbolicLink()) {
        throw new StorageError(
          "PATH_SYMLINK_REJECTED",
          "Symbolic links are not allowed in encrypted storage.",
        );
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      break;
    }
  }
}

export class StoragePaths {
  root: string;
  private initialized = false;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    try {
      const existing = await lstat(this.root).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return undefined;
        throw error;
      });
      if (existing?.isSymbolicLink()) {
        throw new StorageError(
          "PATH_SYMLINK_REJECTED",
          "The encrypted storage root cannot be a symbolic link.",
        );
      }
      await mkdir(this.root, { recursive: true, mode: DIRECTORY_MODE });
      await chmod(this.root, DIRECTORY_MODE);
      const canonical = await realpath(this.root);
      // macOS exposes /tmp through the system /private symlink. The requested
      // root itself was checked above; retain its real canonical identity for
      // every subsequent confinement comparison.
      this.root = canonical;
      this.initialized = true;
    } catch (error) {
      throw asStorageError(error, "PATH_INVALID", "Could not initialize storage root.");
    }
  }

  async directory(relativePath: string): Promise<string> {
    await this.initialize();
    const relative = assertRelative(relativePath);
    const target = this.resolve(relative);
    await rejectSymlinks(this.root, target);
    await mkdir(target, { recursive: true, mode: DIRECTORY_MODE });
    await chmod(target, DIRECTORY_MODE);
    const canonical = await realpath(target);
    if (canonical !== target) {
      throw new StorageError(
        "PATH_SYMLINK_REJECTED",
        "Storage directory resolved through a symbolic link.",
      );
    }
    return target;
  }

  resolve(relativePath: string): string {
    const relative = assertRelative(relativePath);
    const target = path.resolve(this.root, relative);
    if (path.relative(this.root, target).startsWith("..")) {
      throw new StorageError("PATH_OUTSIDE_ROOT", "Storage path escapes its root.");
    }
    return target;
  }

  async checkedFile(relativePath: string): Promise<string> {
    await this.initialize();
    const target = this.resolve(relativePath);
    await rejectSymlinks(this.root, target);
    const info = await lstat(target);
    if (!info.isFile()) {
      throw new StorageError("PATH_INVALID", "Encrypted storage entry is not a file.");
    }
    if ((info.mode & 0o077) !== 0) {
      throw new StorageError(
        "FILE_MODE_UNSAFE",
        "Encrypted storage entry is accessible by another user.",
      );
    }
    return target;
  }
}

export function opaqueFileName(namespace: string, id: string): string {
  if (
    id.length === 0 ||
    id.length > 512 ||
    id.includes("\0") ||
    id.includes("/") ||
    id.includes("\\")
  ) {
    throw new StorageError("PATH_INVALID", "Invalid encrypted storage identifier.");
  }
  return `${createHash("sha256").update(namespace).update("\0").update(id).digest("hex")}.enc`;
}

export class AtomicFileWriter {
  constructor(
    private readonly paths: StoragePaths,
    private readonly faultHook?: AtomicFaultHook,
  ) {}

  async write(relativePath: string, bytes: Buffer): Promise<void> {
    await this.paths.initialize();
    const parentRelative = path.dirname(relativePath);
    if (parentRelative !== ".") await this.paths.directory(parentRelative);
    const target = this.paths.resolve(relativePath);
    await rejectSymlinks(this.paths.root, target);
    const temp = `${target}.tmp-${randomBytes(12).toString("hex")}`;
    let renamed = false;
    let handle: Awaited<ReturnType<typeof open>> | undefined;
    try {
      handle = await open(temp, "wx", FILE_MODE);
      await this.faultHook?.("opened", target);
      await handle.writeFile(bytes);
      await this.faultHook?.("written", target);
      await handle.sync();
      await this.faultHook?.("synced", target);
      await handle.close();
      handle = undefined;
      await this.faultHook?.("before-rename", target);
      await rename(temp, target);
      renamed = true;
      await chmod(target, FILE_MODE);
      await this.faultHook?.("renamed", target);
      const directoryHandle = await open(path.dirname(target), "r");
      try {
        await directoryHandle.sync();
      } finally {
        await directoryHandle.close();
      }
    } catch (error) {
      await handle?.close().catch(() => undefined);
      if (!renamed) await rm(temp, { force: true }).catch(() => undefined);
      throw asStorageError(
        error,
        "ATOMIC_WRITE_FAILED",
        "Atomic encrypted write failed; the prior record was preserved.",
        "free-disk-space",
      );
    }
  }
}

export async function assertNoCaseFoldedDuplicates(directory: string): Promise<void> {
  const entries = await readdir(directory);
  const folded = new Set<string>();
  for (const entry of entries) {
    const key = entry.normalize("NFC").toLocaleLowerCase("en-US");
    if (folded.has(key)) {
      throw new StorageError(
        "PATH_CASE_COLLISION",
        "Case-insensitive storage name collision detected.",
      );
    }
    folded.add(key);
  }
}

export async function isOwnerOnly(target: string): Promise<boolean> {
  const info = await stat(target);
  return (info.mode & 0o077) === 0;
}
