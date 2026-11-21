/**
 * File-system storage adapter. Persists each key as a JSON file under a base
 * directory, mirroring the slash-delimited key layout (`flags/{project}/{env}/…`)
 * as a tree of nested directories with a `.json` extension on the leaf. Each
 * segment is encoded ({@link encodeSegment}) so keys that differ only by case
 * stay distinct on case-insensitive file systems (macOS, Windows). Zero
 * external dependencies — uses `node:fs/promises`, which works in both Bun and
 * Node.
 *
 * @module
 */

import { watch as fsWatch } from "node:fs";
import type { Dirent } from "node:fs";
import { mkdir, readdir, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import type { StorageChangeEvent, WatchableFlagsStorage } from "./contract.ts";

/** Options for {@link createFileStorage}. */
export interface FileStorageOptions {
  /** Base directory under which key files are written. Created on demand. */
  dir: string;
}

/** Suffix appended to the leaf file for every stored key. */
const JSON_SUFFIX = ".json";

/**
 * Encode one key segment as a file name that survives case-insensitive and
 * normalization-insensitive file systems (macOS, Windows) and never escapes its
 * directory: uppercase letters become `^` + the lowercase letter, `^` becomes
 * `^^`, bytes outside `[a-z0-9._~!@,=+-]` become `%XX`, and a leading `.` is
 * `%2E` (so `.` / `..` / dotfiles cannot appear). Lowercase keys (the usual
 * `flags/default/production/…`) map to themselves.
 */
export function encodeSegment(segment: string): string {
  let out = "";
  for (const byte of new TextEncoder().encode(segment)) {
    const ch = String.fromCharCode(byte);
    if (byte >= 0x41 && byte <= 0x5a) out += `^${ch.toLowerCase()}`;
    else if (ch === "^") out += "^^";
    else if (/[a-z0-9._~!@,=+-]/.test(ch) && !(ch === "." && out === "")) out += ch;
    else out += `%${byte.toString(16).toUpperCase().padStart(2, "0")}`;
  }
  return out;
}

/** Reverse {@link encodeSegment}. A name without `^`/`%` (a legacy, unencoded one) decodes to itself. */
export function decodeSegment(name: string): string {
  const bytes: number[] = [];
  for (let i = 0; i < name.length; i++) {
    const ch = name[i] as string;
    if (ch === "^") {
      const next = name[++i] ?? "";
      bytes.push((next === "^" ? "^" : next.toUpperCase()).charCodeAt(0));
    } else if (ch === "%") {
      bytes.push(Number.parseInt(name.slice(i + 1, i + 3), 16));
      i += 2;
    } else bytes.push(ch.charCodeAt(0));
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}

/**
 * Map a storage key (e.g. `flags/default/production/snapshots/v1`) to an
 * absolute file path inside `dir`: each encoded segment becomes a directory and
 * the leaf gains a `.json` extension.
 */
function keyToPath(dir: string, key: string): string {
  return join(dir, ...key.split("/").map(encodeSegment)) + JSON_SUFFIX;
}

/**
 * The path a key had before segments were encoded (raw segments), when it
 * differs from {@link keyToPath} — i.e. the key has uppercase or special
 * characters. Read, and removed on write, so existing trees keep working.
 */
function legacyPath(dir: string, key: string): string | undefined {
  const path = join(dir, ...key.split("/")) + JSON_SUFFIX;
  return path === keyToPath(dir, key) ? undefined : path;
}

/**
 * Whether `path` (under `dir`) exists with exactly this spelling. On a
 * case-insensitive file system `flags/Acme/…` would otherwise open
 * `flags/acme/…`.
 */
async function existsExactly(dir: string, path: string): Promise<boolean> {
  let at = dir;
  for (const name of relative(dir, path).split(sep)) {
    let names: string[];
    try {
      names = await readdir(at);
    } catch {
      return false;
    }
    if (!names.includes(name)) return false;
    at = join(at, name);
  }
  return true;
}

/**
 * Reverse {@link keyToPath}: turn an absolute (or `dir`-relative) file path back
 * into the original slash-delimited storage key. Returns `null` for paths that
 * are not `.json` leaves under `dir`.
 */
function pathToKey(dir: string, filePath: string): string | null {
  const rel = relative(dir, filePath);
  if (rel.startsWith("..") || !rel.endsWith(JSON_SUFFIX)) return null;
  return rel.slice(0, -JSON_SUFFIX.length).split(sep).map(decodeSegment).join("/");
}

/** Recursively collect every `.json` leaf file path under `root`. */
async function walk(root: string): Promise<string[]> {
  const out: string[] = [];
  let entries: Dirent[];
  try {
    entries = (await readdir(root, { withFileTypes: true })) as Dirent[];
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return out;
    throw err;
  }
  for (const entry of entries) {
    const name = entry.name.toString();
    const full = join(root, name);
    if (entry.isDirectory()) {
      out.push(...(await walk(full)));
    } else if (entry.isFile() && name.endsWith(JSON_SUFFIX)) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Create a file-backed {@link WatchableFlagsStorage}. Values are serialized as
 * pretty-printed JSON. `watch` is implemented via `fs.watch` on the base
 * directory (recursive); it is best-effort and may coalesce or miss events on
 * platforms without recursive-watch support.
 *
 * @example
 * ```ts
 * import { createFileStorage } from "@xtandard/flags/storage/file";
 *
 * const storage = createFileStorage({ dir: "./data/flags" });
 * ```
 */
export function createFileStorage(options: FileStorageOptions): WatchableFlagsStorage {
  const { dir } = options;

  async function readIfExists(path: string): Promise<string | null> {
    try {
      return await readFile(path, "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  }
  async function unlinkIfExists(path: string): Promise<void> {
    try {
      await unlink(path);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
  }
  async function readLegacy(path: string | undefined): Promise<string | null> {
    return path && (await existsExactly(dir, path)) ? readIfExists(path) : null;
  }
  async function removeLegacy(path: string | undefined): Promise<void> {
    if (path && (await existsExactly(dir, path))) await unlinkIfExists(path);
  }

  return {
    async getItem<T>(key: string): Promise<T | null> {
      const raw =
        (await readIfExists(keyToPath(dir, key))) ?? (await readLegacy(legacyPath(dir, key)));
      return raw === null ? null : (JSON.parse(raw) as T);
    },

    async setItem<T>(key: string, value: T): Promise<void> {
      const path = keyToPath(dir, key);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, JSON.stringify(value, null, 2), "utf8");
      await removeLegacy(legacyPath(dir, key));
    },

    async removeItem(key: string): Promise<void> {
      await unlinkIfExists(keyToPath(dir, key));
      await removeLegacy(legacyPath(dir, key));
    },

    async getKeys(prefix: string): Promise<string[]> {
      const files = await walk(dir);
      // A Set: a legacy file and its encoded twin decode to the same key.
      const out = new Set<string>();
      for (const file of files) {
        const key = pathToKey(dir, file);
        if (key !== null && key.startsWith(prefix)) out.add(key);
      }
      return [...out];
    },

    async watch(
      prefix: string,
      callback: (event: StorageChangeEvent) => void,
    ): Promise<() => void> {
      // Ensure the watched root exists so fs.watch does not throw on a fresh dir.
      await mkdir(dir, { recursive: true });
      const watcher = fsWatch(dir, { recursive: true }, (eventType, filename) => {
        if (!filename) return;
        const key = pathToKey(dir, join(dir, filename.toString()));
        if (key === null || !key.startsWith(prefix)) return;
        // `rename` covers both creation and deletion; we cannot reliably tell
        // them apart from the event alone, so report "update" for changes and
        // "remove" only when the underlying file is gone.
        const type: StorageChangeEvent["type"] = eventType === "rename" ? "remove" : "update";
        callback({ type, key });
      });
      return () => watcher.close();
    },
  } satisfies WatchableFlagsStorage;
}

/**
 * Delete every file written by a {@link createFileStorage} instance by removing
 * its base directory. Exposed primarily for tests and cleanup tooling.
 */
export async function clearFileStorage(options: FileStorageOptions): Promise<void> {
  await rm(options.dir, { recursive: true, force: true });
}
