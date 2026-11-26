import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";

import { getAccountSettings } from "@/features/account/session";
import { useNotifications } from "@/features/notifications/NotificationsProvider";
import { activateTerminal } from "@/features/terminal/activate";
import { logFailure } from "@/lib/log/log";

import { becomeMerchant } from "./account-settings";
import { useSettingsFailure } from "./parts";

export type MerchantAnswers = {
  bitcoinPercent: number;
  payoutCurrency: string;
  /** The Mt Pelerin bank account of the fiat share (its id), null at 100 % bitcoin. */
  payoutAccountId: string | null;
};

/**
 * "Create my merchant profile", a card holder's: the account
 * becomes a merchant's (its failure notified as any change of the settings), then this device's
 * point of sale is prepared and opens, a notification saying so. Its preparation failed, it says
 * so, the account a merchant's already: the same button tries again (becomeMerchant only saves the
 * split then), and the next unlock prepares it otherwise (device-kind.ts). Resolves with whether it
 * opened.
 */
export function useCreateMerchantProfile(): (answers: MerchantAnswers) => Promise<boolean> {
  const { t } = useTranslation();
  const router = useRouter();
  const { notify } = useNotifications();
  const fail = useSettingsFailure();
  return async (answers) => {
    try {
      await becomeMerchant(answers);
    } catch (error) {
      fail(error);
      return false;
    }
    try {
      const settings = getAccountSettings();
      if (!settings) throw new Error("No account is open");
      await activateTerminal(settings);
    } catch (error) {
      logFailure("Preparing the point of sale failed", error);
      notify({
        tone: "error",
        title: t("settings.merchant.failedTitle"),
        body: t("account.errors.terminalFailed"),
        key: "settings"
      });
      return false;
    }
    notify({
      tone: "success",
      title: t("settings.merchant.doneTitle"),
      body: t("settings.merchant.doneBody"),
      key: "settings"
    });
    // "Settings" back to its first screen, then the point of sale. Kept open, a screen of its
    // stack would be mounted again as the navigation becomes a point of sale's (Expo Router 58),
    // now on a point of sale, and lead back to "Settings" over the point of sale (the Redirect of
    // PayoutScreens.tsx).
    router.dismissTo("/settings");
    router.replace("/pos");
    return true;
  };
}
