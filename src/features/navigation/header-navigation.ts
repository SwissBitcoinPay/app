import { createContext, useContext } from "react";
import { useTranslation } from "react-i18next";

import type { HeaderAction } from "@/features/terminal/PosFrame";

import { DESTINATION_ICONS, type Destination } from "./destinations";

/**
 * A card holder's phone has no dock: its two destinations lead to
 * each other from their headers (AppShell's `navigate`). Null with a dock or the side bar.
 */
export const HeaderNavigationContext = createContext<((destination: Destination) => void) | null>(
  null
);

/**
 * The header's ways between "Cards" and "Settings" on a card holder's phone: `settings`, on
 * the right of "Cards" (its icon in the side bar), and `cards`, back from "Settings"; null
 * where the navigation has them (a dock, the side bar).
 */
export function useHeaderNavigation(): { settings: HeaderAction; cards: HeaderAction } | null {
  const { t } = useTranslation();
  const navigate = useContext(HeaderNavigationContext);
  if (navigate === null) return null;
  return {
    settings: {
      icon: DESTINATION_ICONS.settings,
      label: t("navigation.destinations.settings"),
      onPress: () => navigate("settings"),
      testID: "header-settings"
    },
    cards: {
      icon: "arrow-left",
      label: t("common.back"),
      onPress: () => navigate("cards"),
      testID: "header-cards"
    }
  };
}
