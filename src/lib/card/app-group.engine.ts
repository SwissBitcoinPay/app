import { Paths, type Directory } from "expo-file-system";

import { cardAppGroup } from "./app-group-name";

/*
 * Same API as app-group.ts, in the iOS extension's engine (src/lib/engine/): the extension is iOS
 * and holds the app group, which its host names (the build's settings). No Platform check here:
 * the engine's bundle reads `Platform.OS` as its own platform, "engine" (babel-preset-expo inlines
 * it at build time).
 */

export { cardAppGroup };

export function cardSharedContainer(): { group: string; container: Directory } | null {
  const group = cardAppGroup();
  if (!group) return null;
  const container = Paths.appleSharedContainers[group];
  return container ? { group, container } : null;
}
