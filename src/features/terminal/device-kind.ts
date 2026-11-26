import { useEffect } from "react";

import {
  getAccountSettings,
  getAccountWalletId,
  whenAccountSynced
} from "@/features/account/session";
import { useUnlocked } from "@/features/navigation/lock";
import { logFailure } from "@/lib/log/log";
import type { CardHolderProfile } from "@/lib/terminal/model";

import { prepareThisDevice, refreshTerminalDetails } from "./activate";

/**
 * A card holder's device, once its account is open (the passkey), from the settings as the relays
 * left them: an account that "Create my merchant profile" made a
 * merchant's on another device gets its point of sale here (activateTerminal, which connects the
 * account's wallet, created there); otherwise the device follows its display currency. A merchant's
 * account never becomes a card holder's again: a point of sale is never prepared the other way (a
 * merchant's device follows its settings in useTeamChannelsSync). The navigation follows the
 * profile saved.
 */
export function useDeviceKindSync(profile: CardHolderProfile): void {
  const { walletId } = profile;
  const unlocked = useUnlocked(walletId);
  useEffect(() => {
    if (!unlocked) return;
    void whenAccountSynced()
      .then(async () => {
        const settings = getAccountSettings();
        if (
          !settings ||
          settings.signUp !== "done" ||
          getAccountWalletId()?.toLowerCase() !== walletId.toLowerCase()
        ) {
          return;
        }
        if (settings.usage === "merchant") await prepareThisDevice(settings);
        else await refreshTerminalDetails(settings);
      })
      .catch((error: unknown) => {
        logFailure("Preparing this device for its account failed", error);
      });
  }, [unlocked, walletId]);
}
