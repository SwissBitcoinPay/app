import { Stack } from "expo-router";

import { LockedCards } from "@/features/card/LockedCards";
import { useUnlocked } from "@/features/navigation/lock";
import { usePos } from "@/features/terminal/pos";
import { isCardHolderProfile } from "@/lib/terminal/model";
import { useTheme } from "@/theme";

/**
 * "Cards" (src/features/card/CardsScreen.tsx), a destination of the navigation ("Manage"), then
 * what it opens on top: the pairing of a card, "Where to pay with your card" and the
 * staging app's tests. They take the whole window: no side bar nor dock (AppShell,
 * `isFullScreenRoute`), but "Where to pay with your card" beside a computer's side bar
 * (`isMobileFullScreenRoute`). On a card holder's device, where "Cards" opens in till mode,
 * none of them shows before the passkey: LockedCards asks it, in
 * place of the stack, so that the screen a link named (a computer's code: "Add a card")
 * shows once the account is open.
 */
export default function CardsLayout() {
  const { colors } = useTheme();
  const { profile } = usePos();
  const cardHolder = isCardHolderProfile(profile);
  const unlocked = useUnlocked(cardHolder ? profile.walletId : "");
  if (cardHolder && !unlocked) return <LockedCards />;
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background.app }
      }}
    />
  );
}
