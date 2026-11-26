import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";

import {
  getAccountRevision,
  getAccountSettings,
  updateAccount,
  whenAccountSynced
} from "@/features/account/session";
import { logFailure } from "@/lib/log/log";
import type { SettingsPatch } from "@/lib/settings/merchant";

import { useOnboarding } from "./state";
import { accountRoutes, setupRoutes } from "./steps";

/**
 * Saves the answers of a step in the open account's settings, then goes on (the sign-up is saved
 * as it goes, and resumes where it stopped). Once the sign-up is
 * done, going through the steps again saves nothing until "Start accepting payments" (`always`): a
 * step must not turn finished settings back into an unfinished sign-up. A failure is shown until
 * the next tap.
 *
 * A save first waits for the relays' answer at sign-in (session.ts, usually there long before the
 * tap; 15 s at most). When it brought another device's change, the answers on screen are stale:
 * nothing is saved, the merchant goes where the account now stands, as
 * after a sign-in (a sign-up done there: through the setup screen, which prepares this device's
 * point of sale).
 */
export function useSaveStep() {
  const router = useRouter();
  const { revision } = useOnboarding();
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  // A ref: a double tap must not save twice before the first re-render.
  const running = useRef(false);
  // A screen left while its save waited (back): it saves nothing, nor leads anywhere.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const save = async (
    patch: SettingsPatch,
    next: () => void,
    { always = false }: { always?: boolean } = {}
  ) => {
    if (running.current) return;
    running.current = true;
    setSaving(true);
    setFailed(false);
    try {
      await whenAccountSynced();
      if (!mounted.current) return;
      const settings = getAccountSettings();
      if (settings && getAccountRevision() !== revision) {
        router.dismissTo("/");
        // Done on another device: this one's point of sale is prepared first, as at a login.
        const routes = settings.signUp === "done" ? setupRoutes(settings) : accountRoutes(settings);
        for (const route of routes) router.push(route);
        return;
      }
      if (always || settings?.signUp !== "done") await updateAccount(patch);
      next();
    } catch (error) {
      logFailure("Saving the merchant settings failed", error);
      setFailed(true);
    } finally {
      running.current = false;
      setSaving(false);
    }
  };

  return {
    save: (...args: Parameters<typeof save>) => void save(...args),
    saving,
    /** False once the step's screen is left: what runs after its save leads nowhere then. */
    mounted,
    failed,
    errorKey: "merchantSettings.saveFailed" as const
  };
}
