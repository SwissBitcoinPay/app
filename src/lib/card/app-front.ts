import { Directory, File } from "expo-file-system";

import { cardSharedContainer } from "./app-group";

/*
 * The marker of the app in front, which the iOS notification service extension reads before it
 * takes a card's wake (docs/ios-card-payments.md, "Who takes a wake"): the app shown takes a
 * wake itself (useCardWakes.ts), the extension then leaves it to the app. Written by the app only,
 * in the app group's container (app-group.ts), while it is active: at once, then every
 * APP_FRONT_REFRESH_MS; removed as soon as it is not. A marker older than APP_FRONT_FRESH_MS is
 * none (an app ended without removing it). Nowhere but on an iPhone whose build has the extension.
 *
 * IRREVERSIBLE: the directory's and the file's names, which installed extensions read. A change
 * of format needs a new version: a reader takes no marker of another version for one.
 */

export const APP_FRONT_DIR_NAME = "card-app";
const FILE_NAME = "front.json";
const FORMAT_VERSION = 1;

/** How often the app writes its marker again while active. */
export const APP_FRONT_REFRESH_MS = 5_000;
/**
 * How long a marker holds: two refreshes and a margin. A marker an app left (ended while active)
 * keeps the extension off a wake that long at most: the app opened takes it then.
 */
export const APP_FRONT_FRESH_MS = 12_000;
/** A marker written this far ahead of the reader's clock is none (the clock moved back). */
const MAX_AHEAD_MS = 2_000;

function directory(): Directory | null {
  const shared = cardSharedContainer();
  return shared ? new Directory(shared.container, APP_FRONT_DIR_NAME) : null;
}

/** Writes the marker, dated `now` (written beside, then moved over: never read half written). */
export function markAppInFront(now: number): void {
  const dir = directory();
  if (!dir) return;
  dir.create({ intermediates: true, idempotent: true });
  const draft = new File(dir, `${FILE_NAME}.tmp`);
  draft.writeSync(JSON.stringify({ version: FORMAT_VERSION, at: now }));
  draft.moveSync(new File(dir, FILE_NAME), { overwrite: true });
}

/** Removes the marker: the app is no longer in front. */
export function clearAppInFront(): void {
  const dir = directory();
  if (!dir) return;
  const file = new File(dir, FILE_NAME);
  if (file.exists) file.delete();
}

/** Whether a fresh marker says the app is in front at `now`; false when none is readable. */
export function appInFront(now: number): boolean {
  const dir = directory();
  if (!dir) return false;
  try {
    const file = new File(dir, FILE_NAME);
    if (!file.exists) return false;
    const value = JSON.parse(file.textSync()) as { version?: unknown; at?: unknown };
    if (value.version !== FORMAT_VERSION) return false;
    const at = value.at;
    if (typeof at !== "number" || !Number.isSafeInteger(at)) return false;
    return at <= now + MAX_AHEAD_MS && now - at <= APP_FRONT_FRESH_MS;
  } catch {
    return false;
  }
}
