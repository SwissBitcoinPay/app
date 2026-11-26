import { Stack } from "expo-router";

import { useUnlocked } from "@/features/navigation/lock";
import { PayoutDraftProvider } from "@/features/settings/payout-draft";
import { usePos } from "@/features/terminal/pos";
import { isCardHolderProfile, isMemberProfile } from "@/lib/terminal/model";
import { useTheme } from "@/theme";

/**
 * "Settings": the screen, then what it opens on top: a phone's rubrics ("Business", "Display",
 * "Payments", "Payouts", "Security", "Help"), the relays (mobile), the split and the bank account
 * (the sign-up's steps, from the settings), the recovery phrase, "Bitcoin node" (from "Network").
 * "Cards" is a destination of its own (src/app/(app)/cards/). The screens
 * above the first one take the whole window: no side bar nor dock (AppShell, `isFullScreenRoute`).
 * In till mode "Settings" opens reduced (LockedSettings.tsx), its
 * first screen and "Help" only: the others change the open account. A link to one shows the
 * first screen, and the lock takes them out of the history (Stack.Protected); an employee's device,
 * which holds no account, has none of them but its own ("Your profile", "Display", the relays
 * read only, "Help"). A card holder's has no split nor bank account to
 * change, but "Create my merchant profile" (merchant, merchant-bank); a point of sale has no such
 * profile to create. Its recovery phrase and its yearly check,
 * as an owner's: its words open its cards' wallets too (src/features/rescue/).
 */
export default function SettingsLayout() {
  const { colors } = useTheme();
  const { profile } = usePos();
  const open = useUnlocked(isMemberProfile(profile) ? "" : profile.walletId);
  const cardHolder = isCardHolderProfile(profile);
  const member = isMemberProfile(profile);
  return (
    // What the split and the bank account change, from one step to the other.
    <PayoutDraftProvider>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background.app }
        }}
      >
        {/* First: the screens declared come first, and the first is where "Settings" opens. */}
        <Stack.Screen name="index" />
        {/* "Help": the device's journal, in till mode too and on an employee's device. */}
        <Stack.Screen name="help" />
        {/* An employee's rubrics on a phone: its profile, the business's relays read only. */}
        <Stack.Protected guard={member}>
          <Stack.Screen name="profile" />
        </Stack.Protected>
        {/* "Network": an employee's, read only, or the owner's (network.tsx). */}
        <Stack.Protected guard={member || open}>
          <Stack.Screen name="network" />
        </Stack.Protected>
        <Stack.Protected guard={open}>
          <Stack.Screen name="relays" />
          {/* The recovery phrase and its yearly check: a card holder's too, its words being the
              keys of its cards' wallets. */}
          <Stack.Screen name="security" />
          <Stack.Screen name="recovery" />
          <Stack.Screen name="recovery-check" />
        </Stack.Protected>
        {/* "Display": an employee's (its device's "Theme"), or the owner's, unlocked. */}
        <Stack.Protected guard={member || open}>
          <Stack.Screen name="display" />
        </Stack.Protected>
        <Stack.Protected guard={open && !cardHolder}>
          <Stack.Screen name="business" />
          <Stack.Screen name="charging" />
          <Stack.Screen name="payouts" />
          <Stack.Screen name="node" />
          <Stack.Screen name="split" />
          <Stack.Screen name="bank" />
        </Stack.Protected>
        {/* Kept once the device became a point of sale, while "Create my merchant profile"
            ends there (it opens the point of sale itself); a point of sale opens them on nothing
            (PayoutScreens.tsx leads back to "Settings"). */}
        <Stack.Protected guard={open}>
          <Stack.Screen name="merchant" />
          <Stack.Screen name="merchant-bank" />
        </Stack.Protected>
      </Stack>
    </PayoutDraftProvider>
  );
}
