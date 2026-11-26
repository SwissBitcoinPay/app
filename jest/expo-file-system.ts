/**
 * In-memory fake of expo-file-system for Jest (jest.setup.ts): what the app uses of the SDK 58
 * API, with the app sandbox as file:// URIs like on a device. Its synchronous writes and reads
 * only (`writeSync`, `readBytesSync`, `writeBytesSync`): since SDK 58, `write`, `readBytes` and
 * `writeBytes` return a promise, which a file moved or read right after would not wait for. The
 * app uses none of them: a call fails here, as it would leave a file half written there. Files and directories live in the
 * maps below; `resetFileSystem()` empties them between tests. The app groups' containers
 * (`Paths.appleSharedContainers`, iOS) are those a test gives (`setSharedContainers`): none, as on
 * Android and in an app without app groups.
 */

import { bytesToBase64 } from "../src/lib/base64";

const DOCUMENT_URI = "file:///data/user/0/ch.swissbitcoinpay.checkout.staging/files/";
const CACHE_URI = "file:///data/user/0/ch.swissbitcoinpay.checkout.staging/cache/";

function trimSlashes(uri: string): string {
  return uri.replace(/\/+$/, "");
}

/** Like `Paths.join`: the first part is a URI, the others are path segments. */
function join(parts: (string | { uri: string })[]): string {
  return parts
    .map((part, index) => {
      const segment = trimSlashes(typeof part === "string" ? part : part.uri);
      return index === 0 ? segment : segment.replace(/^\/+/, "");
    })
    .join("/");
}

function parentOf(path: string): string {
  return path.slice(0, path.lastIndexOf("/"));
}

/** Contents of the files, by URI (without a trailing slash). */
export const files = new Map<string, string>();
/** Contents of the files written as bytes (`File.writeSync` of a Uint8Array), by URI. */
export const binaries = new Map<string, Uint8Array>();
const directories = new Set<string>();
/** The app groups' containers, by group (Paths.appleSharedContainers). */
const sharedContainers = new Map<string, string>();

export function resetFileSystem() {
  files.clear();
  binaries.clear();
  directories.clear();
  sharedContainers.clear();
  directories.add(trimSlashes(DOCUMENT_URI));
  directories.add(trimSlashes(CACHE_URI));
}
resetFileSystem();

/** The app's app groups, each with its container (as iOS makes them, outside the sandbox). */
export function setSharedContainers(groups: string[]): void {
  sharedContainers.clear();
  groups.forEach((group, index) => {
    const uri = `file:///private/var/mobile/Containers/Shared/AppGroup/0000000${index}-FAKE`;
    sharedContainers.set(group, uri);
    directories.add(uri);
  });
}

function nameOf(uri: string): string {
  const path = trimSlashes(uri);
  return path.slice(path.lastIndexOf("/") + 1);
}

export class Directory {
  readonly uri: string;

  constructor(...uris: (string | { uri: string })[]) {
    this.uri = `${join(uris)}/`;
  }

  get exists(): boolean {
    return directories.has(trimSlashes(this.uri));
  }

  get name(): string {
    return nameOf(this.uri);
  }

  /** Its files and directories (not theirs), as the SDK's `list()`: it must exist. */
  list(): (Directory | File)[] {
    const path = trimSlashes(this.uri);
    if (!directories.has(path)) throw new Error(`Directory ${path} does not exist`);
    const child = (uri: string) => parentOf(uri) === path;
    return [
      ...[...directories].filter(child).map((dir) => new Directory(dir)),
      ...[...files.keys()].filter(child).map((file) => new File(file))
    ];
  }

  create(options: { intermediates?: boolean; idempotent?: boolean } = {}) {
    const path = trimSlashes(this.uri);
    if (directories.has(path)) {
      if (options.idempotent) return;
      throw new Error(`Directory ${path} already exists`);
    }
    if (!directories.has(parentOf(path)) && !options.intermediates) {
      throw new Error(`Parent of ${path} does not exist`);
    }
    for (let dir = path; dir && !directories.has(dir); dir = parentOf(dir)) directories.add(dir);
  }

  /** Removes the directory and everything under it, as the SDK's `Directory.delete()`. */
  delete() {
    const path = trimSlashes(this.uri);
    if (!directories.has(path)) throw new Error(`Directory ${path} does not exist`);
    for (const dir of [...directories]) {
      if (dir === path || dir.startsWith(`${path}/`)) directories.delete(dir);
    }
    for (const file of [...files.keys()]) {
      if (file.startsWith(`${path}/`)) files.delete(file);
    }
  }
}

/** The SDK's modes of `File.open` the app uses. */
export enum FileMode {
  ReadOnly = "r",
  Append = "wa"
}

/** The UTF-8 bytes of `text`, and back. */
const bytesOf = (text: string) => new TextEncoder().encode(text);
const textOf = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

/** As the SDK's `FileHandle`, over the file's contents: read from its start, or appended to. */
class FileHandle {
  private open = true;
  private offset = 0;

  constructor(
    private readonly uri: string,
    private readonly mode: FileMode
  ) {
    if (!files.has(uri)) throw new Error(`${uri} does not exist`);
  }

  private bytes(): Uint8Array {
    if (!this.open) throw new Error("The file handle is closed");
    return bytesOf(files.get(this.uri) ?? "");
  }

  readBytesSync(length: number): Uint8Array {
    if (this.mode !== FileMode.ReadOnly) throw new Error("File opened write-only");
    const read = this.bytes().slice(this.offset, this.offset + length);
    this.offset += read.length;
    return read;
  }

  writeBytesSync(bytes: Uint8Array) {
    if (this.mode !== FileMode.Append) throw new Error("File opened read-only");
    this.bytes();
    files.set(this.uri, (files.get(this.uri) ?? "") + textOf(bytes));
  }

  get size(): number | null {
    return this.open ? this.bytes().length : null;
  }

  close() {
    this.open = false;
  }
}

export class File {
  uri: string;

  constructor(...uris: (string | { uri: string })[]) {
    this.uri = join(uris);
  }

  get exists(): boolean {
    return files.has(this.uri) || binaries.has(this.uri);
  }

  get name(): string {
    return nameOf(this.uri);
  }

  /**
   * As the SDK's `File.writeSync`: text, which `append` adds to the end of the file, or bytes (kept
   * apart, never appended to).
   */
  writeSync(content: string | Uint8Array, options: { append?: boolean } = {}) {
    if (!directories.has(parentOf(this.uri))) throw new Error(`No directory for ${this.uri}`);
    if (typeof content !== "string") {
      if (options.append) throw new Error("Appending bytes is not faked");
      files.delete(this.uri);
      binaries.set(this.uri, content.slice());
      return;
    }
    binaries.delete(this.uri);
    files.set(this.uri, options.append ? (files.get(this.uri) ?? "") + content : content);
  }

  /** Its size in bytes; 0 when it does not exist, as the SDK's. */
  get size(): number {
    return binaries.get(this.uri)?.length ?? bytesOf(files.get(this.uri) ?? "").length;
  }

  bytesSync(): Uint8Array {
    const bytes = binaries.get(this.uri);
    if (bytes) return bytes.slice();
    return bytesOf(this.textSync());
  }

  open(mode: FileMode): FileHandle {
    return new FileHandle(this.uri, mode);
  }

  textSync(): string {
    const content = files.get(this.uri);
    if (content === undefined) throw new Error(`${this.uri} does not exist`);
    return content;
  }

  async text(): Promise<string> {
    return this.textSync();
  }

  /** Its bytes in base64, as the SDK's `File.base64()`: it must exist. */
  async base64(): Promise<string> {
    if (!this.exists) throw new Error(`${this.uri} does not exist`);
    return bytesToBase64(this.bytesSync());
  }

  /** Removes the file, as the SDK's `File.delete()`: it must exist. */
  delete() {
    if (!files.delete(this.uri) && !binaries.delete(this.uri)) {
      throw new Error(`${this.uri} does not exist`);
    }
  }

  moveSync(destination: File, options: { overwrite?: boolean } = {}) {
    const content = this.textSync();
    if (destination.exists && !options.overwrite) {
      throw new Error(`${destination.uri} already exists`);
    }
    files.set(destination.uri, content);
    files.delete(this.uri);
    this.uri = destination.uri;
  }
}

export const Paths = {
  document: new Directory(DOCUMENT_URI),
  cache: new Directory(CACHE_URI),
  get appleSharedContainers(): Record<string, Directory> {
    return Object.fromEntries(
      [...sharedContainers].map(([group, uri]) => [group, new Directory(uri)])
    );
  }
};
