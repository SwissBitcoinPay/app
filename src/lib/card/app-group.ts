import { Paths, type Directory } from "expo-file-system";
import { Platform } from "react-native";

import { cardAppGroup } from "./app-group-name";

/*
 * The app group the app shares with its iOS notification service extension
 * (plugins/card-notification-extension, app.config.ts `cardNotificationExtension`): a container of
 * files and a keychain access group, both readable by the extension. Only a build with the
 * extension has one (a variant's `cardExtension`), and only on iOS. The extension's own:
 * app-group.engine.ts.
 */

export { cardAppGroup };

/**
 * The app group and its container, on an iPhone whose app holds the group: Expo lists the groups
 * of the app's entitlements (Paths.appleSharedContainers), which the extension's plugin writes.
 * The keychain access group of the same name is then the app's too (Apple, "Sharing access to
 * keychain items among a collection of apps": an app group's name is a keychain access group's,
 * without the keychain entitlement). Null on another platform, or a build without the group.
 */
export function cardSharedContainer(): { group: string; container: Directory } | null {
  if (Platform.OS !== "ios") return null;
  const group = cardAppGroup();
  if (!group) return null;
  const container = Paths.appleSharedContainers[group];
  return container ? { group, container } : null;
}
