import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import { settingsHaveMainWallet } from "@/features/account/main-wallet";
import { useCanScanBarcodes } from "@/features/catalog/camera-available";
import { useAccountSettings } from "@/features/settings/useAccountSettings";
import type { CatalogEntry } from "@/lib/catalog/article";
import { getDeviceLocale } from "@/lib/locale/device";
import { logFailure } from "@/lib/log/log";
import { currencyDigits } from "@/lib/terminal/amount";
import { changeQuantity, keptLines, type Basket, type RateOf } from "@/lib/terminal/basket";
import {
  isCardHolderProfile,
  isMemberProfile,
  type MemberTerminalProfile,
  type OwnerTerminalProfile,
  type TerminalProfile
} from "@/lib/terminal/model";

import { usePosCatalog, type PosCatalog } from "./pos-catalog";
import type { PosMode } from "./pos-mode-format";
import { loadPosMode, savePosMode } from "./pos-mode-store";
import { useRate, type RateState } from "./useRate";

/**
 * What the invoice screen's sale still waits for: its payment ("open": being created, open,
 * checked, underpaid) or its on-chain payment's confirmations ("unconfirmed"); null without one
 * (paid, expired, failed, or no invoice screen). The navigation's dot on "Charge" shows it.
 */
export type InvoiceWait = "open" | "unconfirmed" | null;

/** The sale being charged: fixed when "Charge" is tapped. */
export type Sale = {
  /** Fiat amount, in minor units of the profile's currency. */
  minor: number;
  /**
   * The amount at the point of the hour it was charged in (fiatToSats): shown until the screen
   * knows the amount due now, which follows the hour (useSale.ts).
   */
  sats: bigint;
  note: string;
  /**
   * When "Charge" was tapped, in milliseconds of this device's clock (Date.now). Its start in
   * Unix seconds follows the clock's correction (issuerSeconds, src/lib/clock.ts): the first sale
   * of a launch is tapped before any invoice tells how far off this device's clock is.
   */
  tappedAt: number;
  /**
   * The sale's own key (32 random bytes): its invoices are declared with the keys it gives
   * (src/lib/registry/), and its payment link carries it. A new request makes a new one.
   */
  key: Uint8Array;
  /**
   * The relays of the sale, the device's when it was tapped: its invoices are declared there and
   * its payment link names them, whatever list the device has meanwhile.
   */
  relays: readonly string[];
  /**
   * The basket's lines the sale was charged from ("Items", the scan, the basket), null for the
   * keypad's amount: the lines its payment empties, and gives back if it is replaced (RBF).
   */
  basket: Basket | null;
};

type PosState = {
  profile: TerminalProfile;
  /** Decimal digits of the currency's minor unit. */
  digits: number;
  /** BCP 47 tag of the device, for numbers. */
  languageTag: string;
  rate: RateState;
  /** The keypad's value, in minor units: kept while an invoice is shown, to create it again. */
  minor: number;
  setMinor: (minor: number) => void;
  note: string;
  setNote: (note: string) => void;
  sale: Sale | null;
  setSale: (sale: Sale | null) => void;
  /**
   * Sets what the invoice screen's sale still waits for (`InvoiceWait`), by that screen only. Read
   * with `useInvoiceWait`, not here: a change of it renders again only what shows it.
   */
  setInvoiceWait: (wait: InvoiceWait) => void;
  /** After a payment: a fresh keypad. */
  reset: () => void;
  /** The business's articles (pos-catalog.ts): none until read, or when unreadable. */
  catalog: PosCatalog;
  /**
   * An article this device added, changed or removed, once a majority of the relays took it: in
   * `catalog` at once
   * (usePosCatalog's noteEntry).
   */
  noteCatalogEntry: (entry: CatalogEntry) => void;
  /**
   * The keypad, the articles or the scan, one of `views`
   * (the first one when the view chosen is not offered).
   */
  mode: PosMode;
  /** The views offered, in the selector's order (`posViewsOf`). */
  views: readonly PosMode[];
  /** Remembered on this device, the scan too (pos-mode-format.ts). */
  setMode: (mode: PosMode) => void;
  /** The articles chosen ("Items", the scan), of the catalogue only. */
  basket: Basket;
  /** `delta` more units of article `id` (fewer when negative; 0 leaves the basket). */
  changeBasket: (id: string, delta: number) => void;
  /** The basket as `basket` (a sale's lines given back, src/app/(app)/pos/charge.tsx). */
  setBasket: (basket: Basket) => void;
  clearBasket: () => void;
  /**
   * The rate shown of a currency, the profile's or an article's (src/lib/terminal/basket.ts): the
   * point of the last render. What an amount is fixed with is `currentRateOf`.
   */
  rateOf: RateOf;
  /** The rate of a currency at this instant (RateState.current): undefined when none is known. */
  currentRateOf: RateOf;
};

/**
 * The views offered. The owner's device (till mode included):
 * all of them, articles or not, the owner adding articles from there (the scan's "New
 * item"). An employee's device: the articles and the scan only with an article in the
 * catalogue (an unreadable catalogue is as an empty one). The scan only where there is a camera to
 * scan with (`canScan`, useCanScanBarcodes: the apps; the web app where the browser has one, a
 * computer's webcam included).
 */
export function posViewsOf(
  profile: TerminalProfile,
  articles: number,
  canScan: boolean
): readonly PosMode[] {
  if (isCardHolderProfile(profile)) return ["amount"];
  if (isMemberProfile(profile) && articles === 0) return ["amount"];
  return canScan ? ["amount", "articles", "scan"] : ["amount", "articles"];
}

const PosContext = createContext<PosState | null>(null);
/** Apart from `PosContext`: the navigation reads it without rendering again at each keypad key. */
const InvoiceWaitContext = createContext<InvoiceWait>(null);

/**
 * State shared by the point of sale's screens (keypad, invoice). Held around the navigation: another
 * account mounts it again (its key), another currency does not, the side bar and the screens stay.
 */
export function PosProvider({
  profile,
  children
}: {
  profile: TerminalProfile;
  children: ReactNode;
}) {
  const rate = useRate(profile.currency);
  const [minor, setMinor] = useState(0);
  const [note, setNote] = useState("");
  const [sale, setSale] = useState<Sale | null>(null);
  const [invoiceWait, setInvoiceWait] = useState<InvoiceWait>(null);
  const digits = currencyDigits(profile.currency);
  const [languageTag] = useState(() => getDeviceLocale().languageTag);
  const { catalog, noteEntry } = usePosCatalog(profile);
  const [chosenMode, setChosenMode] = useState<PosMode>("amount");
  useEffect(() => {
    let alive = true;
    void loadPosMode().then((stored) => {
      if (alive && stored) setChosenMode(stored);
    });
    return () => {
      alive = false;
    };
  }, []);
  const setMode = (next: PosMode) => {
    setChosenMode(next);
    savePosMode(next).catch((error: unknown) => {
      logFailure("Saving the point of sale's mode failed", error);
    });
  };
  const canScan = useCanScanBarcodes();
  const views = posViewsOf(profile, catalog.articles.length, canScan);
  const [lines, setLines] = useState<Basket>([]);
  // An article removed from the catalogue since leaves the basket.
  const basket = keptLines(lines, catalog.articles);
  const changeBasket = (id: string, delta: number) =>
    setLines((current) => changeQuantity(current, id, delta));
  const clearBasket = () => setLines([]);
  // The rates of the articles' other currencies (an article keeps the currency it was typed in).
  const [foreign, setForeign] = useState<Record<string, RateState>>({});
  const others = [
    ...new Set(
      catalog.articles
        .map(({ price }) => price.currency)
        .filter((currency) => currency !== profile.currency)
    )
  ].sort();
  const rateStateOf = (currency: string): RateState | undefined =>
    currency === profile.currency ? rate : foreign[currency];
  /** A fresh keypad, without a sale: after a payment, or in another currency. */
  const reset = () => {
    setMinor(0);
    setNote("");
    setSale(null);
    setLines([]);
  };
  // The keypad's amount and the sale are in minor units of the profile's currency, which the sale
  // is charged in (its invoice screen reads the profile's): another one ("Settings", an employee's
  // channel) starts a fresh keypad and ends the sale, whose screen gives way. Adjusted while
  // rendering: no screen ever renders the new currency with the old amount.
  const [currency, setCurrency] = useState(profile.currency);
  if (currency !== profile.currency) {
    setCurrency(profile.currency);
    reset();
  }

  const value: PosState = {
    profile,
    digits,
    languageTag,
    rate,
    minor,
    setMinor,
    note,
    setNote,
    sale,
    setSale,
    setInvoiceWait,
    reset,
    catalog,
    noteCatalogEntry: noteEntry,
    mode: views.includes(chosenMode) ? chosenMode : "amount",
    views,
    setMode,
    basket,
    changeBasket,
    setBasket: setLines,
    clearBasket,
    // Another currency's point only with the profile's of the same hour: never a price of two hours.
    rateOf: (currency) => {
      const state = rateStateOf(currency);
      return state && state.hour !== undefined && state.hour === rate.hour ? state.rate : undefined;
    },
    currentRateOf: (currency) => rateStateOf(currency)?.current()
  };

  return (
    <PosContext.Provider value={value}>
      {others.map((currency) => (
        <RateFeed
          key={currency}
          currency={currency}
          onState={(state) => setForeign((held) => ({ ...held, [currency]: state }))}
          onEnd={() =>
            setForeign(({ [currency]: _ended, ...kept }) => {
              void _ended;
              return kept;
            })
          }
        />
      ))}
      <InvoiceWaitContext.Provider value={invoiceWait}>{children}</InvoiceWaitContext.Provider>
    </PosContext.Provider>
  );
}

/**
 * The rate of an article's currency other than the profile's (useRate), handed to the provider
 * whenever it changes, and taken back once no article needs it.
 */
function RateFeed({
  currency,
  onState,
  onEnd
}: {
  currency: string;
  onState: (state: RateState) => void;
  onEnd: () => void;
}) {
  const state = useRate(currency);
  useEffect(() => {
    onState(state);
    // Handed again only when what it tells changed: `current` is a new function at each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.rate, state.hour, state.loading]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => onEnd, []);
  return null;
}

export function usePos(): PosState {
  const state = useContext(PosContext);
  if (!state) throw new Error("usePos outside of PosProvider");
  return state;
}

/**
 * Whether the cards show as a card holder's: no main balance to
 * recharge from nor to send back to, their sats go elsewhere ("Send", "Empty the card"). The
 * one signal of the cards' screens: a card holder's device (CardHolderProfile), or an open account
 * whose settings give it no wallet of its own (main-wallet.ts) though this device is not converted
 * yet (its settings unread at launch, profile-cache.ts). A card holder's device whose account
 * became a merchant's stays one until its point of sale is prepared (activateTerminal): nothing
 * uses the main wallet meanwhile.
 */
export function useCardHolder(): boolean {
  const { profile } = usePos();
  const settings = useAccountSettings();
  return isCardHolderProfile(profile) || (settings !== null && !settingsHaveMainWallet(settings));
}

/**
 * Whether the open account's main balance is offered on the cards' screens ("To my main
 * balance"): a merchant's account (hasMainWallet), never on a card holder's device.
 */
export function useMainBalanceOffered(): boolean {
  const cardHolder = useCardHolder();
  const settings = useAccountSettings();
  return !cardHolder && settings !== null && settingsHaveMainWallet(settings);
}

/** The profile of a device that takes payments: an owner's point of sale, or an employee's. */
export type PointOfSaleProfile = OwnerTerminalProfile | MemberTerminalProfile;

/**
 * The point of sale's state, with its profile, for the screens of a device that takes payments.
 * A card holder's device has none (CardHolderProfile): its navigation never shows them
 * (AppShell's card holder destinations), and one shown there all the same fails loudly rather
 * than charging without a Lightning address.
 */
export function usePointOfSale(): PosState & { profile: PointOfSaleProfile } {
  const state = usePos();
  const { profile } = state;
  if (isCardHolderProfile(profile)) throw new Error("A card holder's device has no point of sale");
  return { ...state, profile };
}

/**
 * The point of sale's state on the app's screens, null on a screen shared with the sign-up, which
 * has none ("Add a card", src/features/card/AddCardFlow.tsx).
 */
export function useOptionalPos(): PosState | null {
  return useContext(PosContext);
}

/** What the invoice screen's sale still waits for (`InvoiceWait`): the navigation's dot. */
export function useInvoiceWait(): InvoiceWait {
  return useContext(InvoiceWaitContext);
}
