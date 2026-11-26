import { Redirect } from "expo-router";
import { View } from "react-native";

import { CardPayments } from "@/features/card/CardPayments";
import { ActivityDetector } from "@/features/navigation/ActivityDetector";
import { AppShell } from "@/features/navigation/AppShell";
import { WebUpdateNotice } from "@/features/navigation/WebUpdateNotice";
import { NotificationsProvider } from "@/features/notifications/NotificationsProvider";
import { OwnerLinksFinalizer } from "@/features/payment-link/OwnerLinksFinalizer";
import { PendingLinksFinalizer } from "@/features/payment-link/PendingLinksFinalizer";
import { useRelaysMoveWatch } from "@/features/relays/moved-notice";
import { useAccountDeletionWatch } from "@/features/settings/deleted-elsewhere";
import { MemberShell } from "@/features/team/MemberShell";
import { useTeamChannelsSync } from "@/features/team/useTeamSync";
import { PosProvider } from "@/features/terminal/pos";
import { SalesFollower } from "@/features/terminal/SalesFollower";
import { useDeviceKindSync } from "@/features/terminal/device-kind";
import { useTerminalProfile } from "@/features/terminal/profile-cache";
import {
  isCardHolderProfile,
  isMemberProfile,
  profileAccount,
  type CardHolderProfile,
  type OwnerTerminalProfile
} from "@/lib/terminal/model";
import { useTheme } from "@/theme";

/**
 * The app of a prepared device: the point of sale and the other destinations, inside the
 * navigation (side bar on desktop, dock on mobile). Opens without a passkey
 * from this device's profile (activateTerminal), in till mode; without one, the welcome screen. An
 * employee's device (src/features/team/) only has the point of sale and "My activity"; a card
 * holder's (prepareCardHolder) only "Cards" and "Settings".
 */
export default function AppLayout() {
  const { colors } = useTheme();
  const profile = useTerminalProfile();
  if (profile === undefined)
    return <View style={{ flex: 1, backgroundColor: colors.background.app }} />;
  if (!profile) return <Redirect href="/" />;
  return (
    // The user's activity, for the auto-lock: every touch, the notifications' included.
    <ActivityDetector>
      {/* The notifications over the app's screens and its navigation. */}
      <NotificationsProvider>
        {/* Keyed: another account starts afresh. Not the currency ("Settings"): the provider
            starts its keypad and sale afresh itself, the navigation and the screens stay mounted
            (mounted again, the side bar's mark would slide back down from the top). */}
        <PosProvider key={profileAccount(profile)} profile={profile}>
          {isMemberProfile(profile) ? (
            <MemberShell />
          ) : isCardHolderProfile(profile) ? (
            <CardHolderShell profile={profile} />
          ) : (
            <OwnerShell profile={profile} />
          )}
        </PosProvider>
        {/* The final versions of this device's payment links, once their sales are settled. */}
        <PendingLinksFinalizer />
        {/* The verdicts of the point of sale's on-chain sales left before them (sale-follow.ts),
            for the account's own sales: another account mounts it again. */}
        <SalesFollower key={`sales:${profileAccount(profile)}`} profile={profile} />
        {/* The web app deployed again while this page is open: "Update". */}
        <WebUpdateNotice />
      </NotificationsProvider>
    </ActivityDetector>
  );
}

function OwnerShell({ profile }: { profile: OwnerTerminalProfile }) {
  useTeamChannelsSync(profile.walletId);
  // A move of the account's relays made on another of the owner's devices, also in till mode.
  useRelaysMoveWatch(profile);
  // The account deleted on another of the owner's devices: this one forgets it.
  useAccountDeletionWatch(profile);
  return (
    <>
      <AppShell profile={profile} />
      {/* The final versions of the employees' payment links their devices did not publish. */}
      <OwnerLinksFinalizer
        walletId={profile.walletId}
        lightningAddress={profile.lightningAddress}
      />
      {/* A tap of the owner's card at a point of sale: its payment, over the app. */}
      <CardPayments walletId={profile.walletId} />
    </>
  );
}

/**
 * A card holder's device: "Cards" and "Settings" (AppShell), no team, no point of sale, no
 * wallet of the account's (src/features/account/main-wallet.ts). A tap of a card pays from the
 * card's own wallet (CardPayments).
 */
function CardHolderShell({ profile }: { profile: CardHolderProfile }) {
  // An account made a merchant's on another device ("Create my merchant profile").
  useDeviceKindSync(profile);
  // The account deleted on another of the owner's devices: this one forgets it.
  useAccountDeletionWatch(profile);
  return (
    <>
      <AppShell profile={profile} />
      {/* A tap of the holder's card at a point of sale: its payment, over the app. */}
      <CardPayments walletId={profile.walletId} />
    </>
  );
}
