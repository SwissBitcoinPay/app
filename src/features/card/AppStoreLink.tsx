import { useTranslation } from "react-i18next";
import { Pressable, Text } from "react-native";

import { externalLinkProps } from "@/components/ui/external-link";
import { Icon } from "@/components/ui/Icon";
import { ANDROID_APP_URL, IOS_APP_URL } from "@/config/app-stores";
import type { BrowserDevice } from "@/lib/browser-device";
import { control, makeStyles, sans, space, tracked, type, useTheme } from "@/theme";

/** The phones whose store the web app links to: the app programs cards there, a browser cannot. */
export type StorePhone = "android" | "iphone";

/** The phone of a browser (browser-device.ts) whose store has the app: none in the apps. */
export function storePhoneOf(device: BrowserDevice | null): StorePhone | null {
  return device === "android" || device === "iphone" ? device : null;
}

/**
 * Where to program a card, said where the web app or a device that reads no card offers to add one:
 * on a phone's browser, its own app (with AppStoreLink); elsewhere, the app on a phone.
 */
export function pairOnPhoneKey(phone: StorePhone | null) {
  return phone === "android"
    ? "cards.pairOnAndroid"
    : phone === "iphone"
      ? "cards.pairOnIphone"
      : "cards.pairOnPhone";
}

/**
 * The app's page on the phone's store, in a new tab (external-link.web.ts: the web app stays in
 * this one), where the web app says that only the app programs a card. A link as the integrations'
 * (NewIntegrationSheet.tsx).
 */
export function AppStoreLink({ phone }: { phone: StorePhone }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const android = phone === "android";
  const label = t(android ? "appStores.googlePlay" : "appStores.appStore");
  return (
    <Pressable
      {...externalLinkProps(android ? ANDROID_APP_URL : IOS_APP_URL)}
      accessibilityRole="link"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.link, pressed && styles.pressed]}
      testID="app-store-link"
    >
      <Icon name={android ? "android" : "apple"} size={14} color={colors.text.accent} />
      <Text style={styles.text}>{label}</Text>
      <Icon name="arrow-up-right-from-square" size={12} color={colors.text.accent} />
    </Pressable>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  // The 44 px touch floor is its own height (react-native-web ignores `hitSlop`).
  link: {
    minHeight: control.min,
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: space[3]
  },
  text: {
    ...sans(600),
    flexShrink: 1,
    fontSize: type.label,
    letterSpacing: tracked.label,
    color: colors.text.accent
  },
  pressed: { backgroundColor: colors.hoverOverlay }
}));
