import { Linking, type PressableProps } from "react-native";

/**
 * Opens a page outside the app: the browser, or the system's app of its scheme (mail, phone,
 * maps), through Linking (the apps). Never for a link of the app's own web app: iOS would open it
 * in Safari, not in the app (AGENTS.md, "UI"). Web: external-link.web.ts, same API. A device
 * without the app it needs rejects: nothing to show then.
 */
export function openExternal(url: string): void {
  void Linking.openURL(url).catch(() => undefined);
}

/** What makes a Pressable open a page outside the app (openExternal). */
export function externalLinkProps(url: string): PressableProps {
  return { onPress: () => openExternal(url) };
}
