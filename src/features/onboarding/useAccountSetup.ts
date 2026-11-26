import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { BackHandler } from "react-native";

import { getAccountSettings, getAccountWalletId } from "@/features/account/session";
import { migrationCreated } from "@/features/migration/flow";
import { prepareThisDevice } from "@/features/terminal/activate";
import { logFailure } from "@/lib/log/log";

import { useOnboarding } from "./state";
import { accountHome } from "./steps";

/** The last preparation started: the next one waits for it to end. */
let preparation: Promise<unknown> = Promise.resolve();

/**
 * Prepares this device for the open account (prepareThisDevice: a merchant's point of sale, a card
 * holder's device without a wallet), once the previous
 * preparation ended, whatever its outcome: two never run at once (the setup screen left on the web
 * while one runs, then opened again), and each reads the settings as they are when it starts.
 */
function prepareTerminal(): Promise<unknown> {
  const run = preparation
    .catch(() => undefined)
    .then(() => {
      const settings = getAccountSettings();
      if (!settings) throw new Error("No account is open");
      return prepareThisDevice(settings);
    });
  preparation = run;
  return run;
}

/**
 * The setup screen after "Start accepting payments" or the card step
 * (src/app/onboarding/setup.tsx):
 * prepares this device as soon as it shows (a merchant's point of sale: its Lightning address, its
 * on-chain addresses, activateTerminal; a card holder's device: prepareCardHolder), then opens it in place of the whole history: "back" must not lead into the
 * steps again. Only for an account whose sign-up is done (the screen leads elsewhere otherwise).
 *
 * Until it fails, the screen cannot be left from the app: the header's back button is greyed,
 * iOS's swipe off (`gestureEnabled` of the screen) and Android's back button held. A failure shows
 * until `retry`; the header's back button then leads to the last step. A screen left meanwhile (the
 * browser's back button) leads nowhere: its preparation goes on, the next one waits for it.
 */
export function useAccountSetup(): { failed: boolean; retry: () => void } {
  const router = useRouter();
  const { setupFailed, setSetupFailed } = useOnboarding();
  const [attempt, setAttempt] = useState(0);
  // The card step's "Top up the card" (src/app/onboarding/card.tsx): its card's id.
  const { recharge } = useLocalSearchParams<{ recharge?: string }>();

  useEffect(() => {
    if (getAccountSettings()?.signUp !== "done") return;
    let active = true;
    prepareTerminal().then(
      () => {
        if (!active) return;
        router.dismissTo("/");
        // The account's home; a card holder's sign-up ended with the card paired: on to their
        // cards, its "Top up" open when asked (CardsScreen.tsx).
        const usage = getAccountSettings()?.usage ?? null;
        // A v2 owner's migration ends on its last screen (src/app/migration/done.tsx).
        if (migrationCreated(getAccountWalletId())) router.replace("/migration/done");
        else if (usage === "card" && recharge) {
          router.replace({
            pathname: "/cards",
            params: { added: recharge, open: "recharge", at: String(Date.now()) }
          });
        } else router.replace(accountHome({ usage }));
      },
      (error: unknown) => {
        logFailure("Preparing the point of sale failed", error);
        if (active) setSetupFailed(true);
      }
    );
    return () => {
      active = false;
    };
  }, [attempt, recharge, router, setSetupFailed]);

  // A step finished again after a failure starts afresh.
  useEffect(() => () => setSetupFailed(false), [setSetupFailed]);

  useEffect(() => {
    if (setupFailed) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => true);
    return () => subscription.remove();
  }, [setupFailed]);

  return {
    failed: setupFailed,
    retry: () => {
      setSetupFailed(false);
      setAttempt((count) => count + 1);
    }
  };
}
