import { Directory } from "expo-file-system";

import { cardSharedContainer } from "./app-group";

export { EXTENSION_DIR_NAME } from "./extension-dir";

/*
 * Same API as card-files.ts, in the iOS extension's engine (src/lib/engine/): the directories of the
 * card files in the app group's container, where the app moved them. Nothing is moved here: the
 * app is their one writer (docs/ios-card-payments.md, "Shared state"); the host refuses its writes.
 */

export function cardDirectory(name: string, _fileName: string): Directory {
  const shared = cardSharedContainer();
  if (!shared) throw new Error("No app group shared with the app");
  return new Directory(shared.container, name);
}

export function forgetSharedCardDirectories(_names: readonly string[]): void {
  throw new Error("The app's card files are removed by the app only");
}
