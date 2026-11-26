import type { PressableProps } from "react-native";

/**
 * Same API as external-link.ts: in a new tab, without telling it the web app's page (no opener, no
 * referrer), the web app staying in this one. Within a press's handler: browsers only open a tab
 * right after a user gesture.
 */
export function openExternal(url: string): void {
  window.open(url, "_blank", "noopener,noreferrer");
}

/**
 * Same API as external-link.ts: a real anchor in a new tab (react-native-web renders a Pressable
 * with `href` as an `<a>`), so that Enter opens it (react-native-web leaves a `role="link"` to the
 * browser, which only activates an `<a>`), and so do a middle click and "Copy link address".
 */
export function externalLinkProps(url: string): PressableProps {
  const anchor = { href: url, hrefAttrs: { target: "_blank", rel: "noopener noreferrer" } };
  return anchor as PressableProps;
}
