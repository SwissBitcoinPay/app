import { engineRuntimeHost } from "../host";

/*
 * What the engine's bundle takes for `expo-file-system` (scripts/extension-engine.js): the files of
 * the app group's container only (card-files.ts), through the host, which refuses a path out of it
 * and any write but to the extension's own files. File and Directory as the app uses them
 * (payment-log.ts, payees.ts, card-files.engine.ts): synchronous reads and writes of text, a file
 * moved over another, a directory made or removed. No documents nor cache directory: the app's own,
 * which the extension does not reach. Only these: src/__tests__/extension-engine.test.ts.
 */

const SCHEME = "sattleme-group:";

/** The container itself, which `Paths.appleSharedContainers` names by the app group. */
const CONTAINER: unique symbol = Symbol("the app group's container");

type Part = Directory | File | string;

/** The path in the container of `parts`: a Directory or File first, then names. */
function pathOf(parts: Part[]): string {
  const [first, ...rest] = parts;
  if (!(first instanceof Directory) && !(first instanceof File)) {
    throw new TypeError("A path in the app group's container only");
  }
  const segments = [
    first.path,
    ...rest.map((part) => (typeof part === "string" ? part : part.path))
  ]
    .flatMap((part) => part.split("/"))
    .filter((segment) => segment !== "");
  if (segments.some((segment) => segment === "." || segment === "..")) {
    throw new TypeError("No relative segment in a path here");
  }
  return segments.join("/");
}

export class Directory {
  /** The path in the container ("" for the container itself). */
  readonly path: string;

  constructor(...parts: Part[] | [typeof CONTAINER]) {
    this.path = parts[0] === CONTAINER ? "" : pathOf(parts as Part[]);
  }

  get uri(): string {
    return `${SCHEME}/${this.path}`;
  }

  get name(): string {
    return this.path.slice(this.path.lastIndexOf("/") + 1);
  }

  get exists(): boolean {
    return engineRuntimeHost().files.isDirectory(this.path);
  }

  create(options: { intermediates?: boolean; idempotent?: boolean } = {}): void {
    const files = engineRuntimeHost().files;
    if (files.isDirectory(this.path)) {
      if (options.idempotent) return;
      throw new Error(`${this.uri} already exists`);
    }
    if (!options.intermediates) throw new Error("Directories are made with their parents here");
    files.makeDirectory(this.path);
  }

  delete(): void {
    engineRuntimeHost().files.remove(this.path);
  }
}

export class File {
  path: string;

  constructor(...parts: Part[]) {
    this.path = pathOf(parts);
  }

  get uri(): string {
    return `${SCHEME}/${this.path}`;
  }

  get name(): string {
    return this.path.slice(this.path.lastIndexOf("/") + 1);
  }

  get exists(): boolean {
    const files = engineRuntimeHost().files;
    return files.exists(this.path) && !files.isDirectory(this.path);
  }

  textSync(): string {
    return engineRuntimeHost().files.read(this.path);
  }

  writeSync(content: unknown, options?: { append?: boolean }): void {
    if (typeof content !== "string") throw new TypeError("Text only here");
    if (options?.append) throw new TypeError("No append here");
    engineRuntimeHost().files.write(this.path, content);
  }

  moveSync(destination: File, options: { overwrite?: boolean } = {}): void {
    if (!(destination instanceof File)) throw new TypeError("A file is moved to a file here");
    engineRuntimeHost().files.move(this.path, destination.path, options.overwrite === true);
    this.path = destination.path;
  }

  delete(): void {
    engineRuntimeHost().files.remove(this.path);
  }
}

function appGroup(): string | null {
  try {
    const value: unknown = JSON.parse(engineRuntimeHost().config());
    const group = (value as { cardAppGroup?: unknown } | null)?.cardAppGroup;
    return typeof group === "string" ? group : null;
  } catch {
    return null;
  }
}

export const Paths = {
  get appleSharedContainers(): Record<string, Directory> {
    const group = appGroup();
    return group ? { [group]: new Directory(CONTAINER) } : {};
  },
  get document(): Directory {
    throw new Error("The app's documents are not the extension's");
  },
  get cache(): Directory {
    throw new Error("The app's cache is not the extension's");
  }
};
