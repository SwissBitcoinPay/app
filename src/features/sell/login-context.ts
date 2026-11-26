import { createContext, useContext } from "react";

import type { SellFlow, SellState } from "./flow";

/*
 * What the Mt Pelerin login's steps need of the panel they show in (SetupPage.tsx: the number, the
 * SMS code, the account's key on dev/test, the e-mail): the flow, its state and the countries'
 * panel. "Sell"'s panel gives it (SellSheet.tsx, its SellNav holds all three), and so does the
 * merchant sign-up's login (src/features/onboarding/MtpLoginSheet.tsx): both show the very same
 * steps.
 */

/** What a country is picked for: the phone's dial code, a bank account's holder. */
export type CountryRequest = {
  title: string;
  value: string | null;
  onSelect: (code: string) => void;
  include?: (code: string) => boolean;
  detail?: (code: string) => string | null;
};

export type SellLogin = {
  flow: SellFlow;
  state: SellState;
  /** The countries, in a panel over this one: `request.onSelect` gets the one chosen. */
  pickCountry(request: CountryRequest): void;
  /**
   * The sign-up's login, opened by a button that said what it is for (mtp-gate.tsx
   * MtpLoginActions): its own title and lead in place of "Sell"'s, which the screen under the
   * panel has said already. "Sell"'s otherwise.
   */
  intro?: { title: string; lead: string };
  /**
   * False: the key's login (dev/test, `connect`) shows no button of its own, its panel having
   * started it (MtpLoginSheet.tsx): its wait, then its failure and retry, in its place. Shown
   * otherwise.
   */
  connectButton?: boolean;
};

export const SellLoginContext = createContext<SellLogin | null>(null);

/** The panel of the login's steps ("Sell"'s, or the sign-up's). */
export function useSellLogin(): SellLogin {
  const login = useContext(SellLoginContext);
  if (!login) throw new Error("useSellLogin outside of a Mt Pelerin login's panel");
  return login;
}
