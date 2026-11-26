import { useRouter } from "expo-router";

import { getAccountWalletId } from "@/features/account/session";
import { usePasskeyAccount } from "@/features/account/usePasskeyAccount";
import { accountHome, accountRoutes } from "@/features/onboarding/steps";

import {
  currentPlan,
  endMigration,
  markMigrationCreated,
  migrationHoldsDeviceWallet
} from "./flow";
import { noteFreezeOwed } from "./freeze";
import { noteLegacyHistoryOwed } from "./history-import";
import { forgetLegacy } from "./legacy-state";
import { noteLegacyWalletOwner } from "./wallet-owner";

/**
 * The passkey of a v2 owner's migration (usePasskeyAccount): "Migrate" creates the account with
 * what the migration read (currentPlan); a v2 account migrated before, or an account created
 * already by this migration, logs in instead, as the welcome screen does, so that a second account
 * is never created (src/app/migration/index.tsx). As soon as the account exists, the v2 app's
 * session is forgotten (forgetLegacy): this device is then the new account's, a restart opens it as
 * any device does.
 *
 * Created with its sign-up done when the v2 server said its payout whole (prepared meanwhile, as at
 * every sign-up): the migration's last screen. Otherwise created at its split (plan.ts), whose
 * sign-up's setup leads to that screen (useAccountSetup). Logged in: the account's home, or its
 * sign-up's step; its v2 wallet, if any, is "Wallet"'s to transfer.
 */
export function useMigrationAccount() {
  const router = useRouter();
  return usePasskeyAccount(
    (settings, reached) => {
      if (reached.action === "logIn") {
        // The words the v2 app left here go to the account its owner opened (wallet-owner.ts).
        const walletId = getAccountWalletId();
        if (walletId && migrationHoldsDeviceWallet()) void noteLegacyWalletOwner(walletId);
        void forgetLegacy();
        endMigration();
      }
      if (settings.signUp === "done") {
        router.dismissTo("/");
        router.replace(reached.action === "create" ? "/migration/done" : accountHome(settings));
        return;
      }
      // The steps replace the migration's screens: "back" leads to the sign-up's own.
      const [first, ...rest] = accountRoutes(settings);
      if (first) router.replace(first);
      for (const route of rest) router.push(route);
    },
    () => router.push("/no-account"),
    {
      created: () => currentPlan()?.patch ?? null,
      // The account exists from here, its point of sale prepared or not: the v2 app's session goes
      // now, so that a restart (a preparation that failed, the app stopped) never offers to create
      // a second account. "Log in" opens this one then.
      onCreated: (walletId) => {
        markMigrationCreated(walletId);
        // The words the v2 app left here go to this account only (wallet-owner.ts).
        if (migrationHoldsDeviceWallet()) void noteLegacyWalletOwner(walletId);
        // Owed from now: "Settings" offers them if the end of the migration cannot (freeze.ts,
        // history-import.ts), the app closed before it included.
        void noteFreezeOwed(walletId);
        void noteLegacyHistoryOwed(walletId);
        void forgetLegacy();
      }
    }
  );
}
