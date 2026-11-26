import { Platform, type ViewProps } from "react-native";

/**
 * Props that take a view faded out or moved off screen, and all it holds, out of reach while
 * `hidden`: screen readers skip it (`accessibilityElementsHidden` on iOS,
 * `importantForAccessibility` on Android) and, on the web, `inert` takes it out of the
 * accessibility tree, of the keyboard's tab order and of clicks. There, react-native-web ignores
 * the two native props, and `pointerEvents: "none"` still leaves Tab and Enter.
 */
export function outOfReach(hidden: boolean): ViewProps & { inert?: boolean } {
  return {
    accessibilityElementsHidden: hidden,
    importantForAccessibility: hidden ? "no-hide-descendants" : "auto",
    // Forwarded to the DOM by react-native-web; React Native's types do not list it.
    ...(Platform.OS === "web" ? { inert: hidden } : {})
  };
}
