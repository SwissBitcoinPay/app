import { Directory, File, Paths } from "expo-file-system";

import { logFailure } from "@/lib/log/log";

import { cardSharedContainer } from "./app-group";

export { EXTENSION_DIR_NAME } from "./extension-dir";

/*
 * The directories of the card files the iOS notification service extension reads too (the phone's
 * log of card payments, the approved merchants: docs/ios-card-payments.md, "Shared state"). On an
 * iPhone whose build shares an app group with the extension (app-group.ts), they are in its
 * container, under the same names; elsewhere (Android, a build without the extension), in the
 * app's documents directory.
 *
 * Moved, not copied: the first use of a directory there moves its file from the documents
 * directory into the container, then removes what is left of the former directory (a draft
 * `.tmp`), which is used as long as its file could not be moved. All synchronous: nothing comes
 * in between. Never read by an app that would look in the documents directory only: these files
 * are in the native fingerprint (fingerprint.config.js), no update of before reaches a build that
 * moved them.
 */

/**
 * The directory `name` of the card files, holding the file `fileName` (its only file: a draft
 * aside), moved into the shared container first when it is still in the documents directory.
 */
export function cardDirectory(name: string, fileName: string): Directory {
  const own = new Directory(Paths.document, name);
  const shared = cardSharedContainer();
  if (!shared) return own;
  const directory = new Directory(shared.container, name);
  if (!own.exists) return directory;
  try {
    const from = new File(own, fileName);
    if (from.exists) {
      directory.create({ intermediates: true, idempotent: true });
      const to = new File(directory, fileName);
      // A file there already is the app's since: the former one is older.
      if (!to.exists) from.moveSync(to);
    }
    own.delete();
  } catch (error) {
    logFailure("Moving card files to the extension's container failed", error);
    // Not moved: used where it is, moved at a next use.
    if (new File(own, fileName).exists && !new File(directory, fileName).exists) return own;
  }
  return directory;
}

/** Removes the directories `names` from the shared container (Log out: device-wipe.ts). */
export function forgetSharedCardDirectories(names: readonly string[]): void {
  const shared = cardSharedContainer();
  if (!shared) return;
  for (const name of names) {
    const directory = new Directory(shared.container, name);
    if (directory.exists) directory.delete();
  }
}
