import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { getAccountBackupKey } from "@/features/account/session";
import { settingsHaveMainWallet } from "@/features/account/main-wallet";
import { MigrationFrame } from "@/features/migration/MigrationFrame";
import { ActivityDetector } from "@/features/navigation/ActivityDetector";
import { useIdleLock } from "@/features/navigation/auto-lock";
import { NotificationsProvider } from "@/features/notifications/NotificationsProvider";
import { PosProvider } from "@/features/terminal/pos";
import { detectPayoutCurrency } from "@/lib/currencies";
import { getDeviceLocale } from "@/lib/locale/device";
import {
  CARD_HOLDER_PROFILE_VERSION,
  TERMINAL_PROFILE_VERSION,
  type TerminalProfile
} from "@/lib/terminal/model";

import { closeRescue, RESCUE_IDLE_CLOSE_MS, type RescueOpening } from "./rescue";
import { RescueFundsView } from "./RescueFunds";
import { RescueWords } from "./RescueWords";

/**
 * "Open with my 12 words" (src/features/rescue/rescue.ts):
 * the words, then the funds of what they opened. Whatever they opened closes as this screen goes
 * ("Close", the system's back, the app leaving it): nothing of the words stays behind it, and the
 * app behind it never unlocks with them (lock.ts). In the migration's frame (the logo over one
 * column).
 *
 * Left alone: once a word is typed, RESCUE_IDLE_CLOSE_MS without
 * any activity, the time in the background included, closes what the words opened and empties the
 * field: a device left with its rescue open would send its funds anywhere without asking (the words
 * confirm its payments, rescue.ts). The field still empty, nothing counts: nothing to forget. Never
 * while a payment is confirmed or sent (useDrain's holdActivity), nor while the words open the
 * account (RescueWords). Its warning counts down as the till's auto-lock does (useIdleLock).
 */
export function RescueScreen() {
  const router = useRouter();
  const [opening, setOpening] = useState<RescueOpening | null>(null);
  // A word in the field: the time without activity counts.
  const [typing, setTyping] = useState(false);
  // Closed after a while without activity: the field shows again, empty (`round` mounts it anew),
  // with why it is.
  const [round, setRound] = useState(0);
  const [idleClosed, setIdleClosed] = useState(false);
  useEffect(
    () => () => {
      void closeRescue();
    },
    []
  );
  const close = () => {
    void closeRescue();
    if (router.canGoBack()) router.back();
    else router.replace("/");
  };
  const closeIdle = () => {
    void closeRescue();
    setOpening(null);
    setTyping(false);
    setRound((current) => current + 1);
    setIdleClosed(true);
  };
  return (
    // The user's activity, for the closing after a while without any: every touch, the panels' and
    // the notifications' included.
    <ActivityDetector>
      <NotificationsProvider>
        <RescueIdleClose active={opening !== null || typing} onClose={closeIdle} />
        <MigrationFrame testID="rescue">
          {opening ? (
            // The amounts, the drain and the export read the point of sale's context: this
            // account's, in memory only, never saved (no device is prepared with the words).
            <PosProvider profile={rescueProfile(opening)}>
              <RescueFundsView opening={opening} onClose={close} />
            </PosProvider>
          ) : (
            <RescueWords
              key={round}
              idleClosed={idleClosed}
              onTyping={(next) => {
                setTyping(next);
                if (next) setIdleClosed(false);
              }}
              onOpened={setOpening}
            />
          )}
        </MigrationFrame>
      </NotificationsProvider>
    </ActivityDetector>
  );
}

/** The rescue's closing after RESCUE_IDLE_CLOSE_MS without activity, while `active`. */
function RescueIdleClose({ active, onClose }: { active: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  useIdleLock(active, onClose, {
    afterMs: RESCUE_IDLE_CLOSE_MS,
    title: (seconds) => t("rescue.idle.title", { seconds }),
    body: t("rescue.idle.body")
  });
  return null;
}

/**
 * The point of sale's profile the rescue's screens read, never saved: a merchant's account's,
 * without its Lightning address (empty: never asked of the Breez LNURL server, which may be gone;
 * the export then tells the business's links by its keys alone, load.ts), a card holder's, or, for
 * the wallet alone, one in the device's currency.
 */
function rescueProfile(opening: RescueOpening): TerminalProfile {
  const backupKey = getAccountBackupKey() ?? "";
  if (opening.kind === "account" && settingsHaveMainWallet(opening.settings)) {
    return {
      version: TERMINAL_PROFILE_VERSION,
      walletId: opening.walletId,
      backupKey,
      lightningAddress: "",
      businessName: opening.settings.businessName,
      currency: opening.settings.displayCurrency
    };
  }
  return {
    version: CARD_HOLDER_PROFILE_VERSION,
    walletId: opening.walletId,
    backupKey,
    businessName: opening.kind === "account" ? opening.settings.businessName : "",
    currency:
      opening.kind === "account"
        ? opening.settings.displayCurrency
        : detectPayoutCurrency(getDeviceLocale())
  };
}
