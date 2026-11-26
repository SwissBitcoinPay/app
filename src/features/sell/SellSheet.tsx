import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode
} from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { AppState } from "react-native";

import { CountryPicker } from "@/components/CountryPicker";
import { CurrencyPicker } from "@/components/CurrencyPicker";
import { IconButton } from "@/components/ui/IconButton";
import { Sheet } from "@/components/ui/Sheet";
import { MTPELERIN_POLL_MS, SELL_CURRENCIES, type SellCurrency } from "@/config/mtpelerin";
import type { PayoutCurrency } from "@/config/payout-currencies";
import { usePos } from "@/features/terminal/pos";
import type { AmountUnit } from "@/features/wallet/send/amount";
import { holdActivity } from "@/lib/activity";
import type { MtpBankAccount } from "@/lib/mtpelerin/types";
import { ownerProfile } from "@/lib/terminal/model";

import { accountSellFlow } from "./account-flow";
import { AccountFormPage } from "./AccountFormPage";
import { AccountsPage } from "./AccountsPage";
import { SELL_STARTING, setupStep, type SaleQuote, type SellFlow, type SellState } from "./flow";
import { HistoryPage } from "./HistoryPage";
import { LimitsPage } from "./LimitsPage";
import { SellLoginContext, type CountryRequest } from "./login-context";
import { OrderPage } from "./OrderPage";
import { ChooseAccountPage, QuotePage, SalePage } from "./SalePage";
import { SettingsPage } from "./SettingsPage";
import { SetupPage } from "./SetupPage";

/*
 * "Sell": every step in one panel over "Wallet", from
 * the tap on "Sell" to the sale sent, its settings, sales and limits included. Its content
 * changes, the panel stays: the steps before a first sale (SetupPage: the Mt Pelerin account, the
 * Lightning address proven by 1 sat, a bank account), then the sale (SalePage), each page pushed
 * on top of it (a bank account to add, the account of the sale, the quote, the sale sold, the
 * settings…) with the header's arrow back to the one under it. The close button closes the panel
 * whatever the page, but while a payment is asked or sent (`lock`). Mt Pelerin keeps the merchant's
 * progress: reopened, "Sell" starts where Mt Pelerin is. Desktop: the same panel, a dialog.
 *
 * Its flow (flow.ts) is made once for the open merchant's account (account-flow.ts). While the
 * panel shows a payment awaited by Mt Pelerin (the 1-sat invoice's sync), it reads again every
 * MTPELERIN_POLL_MS and when the app comes back to the front, quietly.
 */

/** A page pushed over the panel's first one (the steps, or the sale). */
export type SellPage =
  /** `currency`: the bank step's, to begin with. */
  | { name: "accountForm"; currency?: SellCurrency }
  /** "Edit the account": an account of "Bank accounts", as last read. */
  | { name: "accountEdit"; account: MtpBankAccount }
  | { name: "chooseAccount" }
  | { name: "quote"; quote: SaleQuote }
  /** The quote paid at `paidAt` (Unix ms): the sale sold, its progress. */
  | { name: "sold"; quote: SaleQuote; paidAt: number }
  | { name: "settings" }
  | { name: "accounts" }
  | { name: "history" }
  | { name: "limits" }
  /**
   * A sale's progress: one of "Your sales", or a sale of "Wallet" (its "Track the
   * sale"), made at `fromMs` (Unix ms; absent: this year).
   */
  | { name: "order"; orderId: string; fromMs?: number };

export type { CountryRequest };

/** What a currency is picked for: a bank account's (AccountFormPage), among SELL_CURRENCIES. */
export type CurrencyRequest = {
  title: string;
  value: string;
  onSelect: (currency: PayoutCurrency) => void;
};

/** The panel shown over "Sell"'s, while it shows. */
type Picker =
  { kind: "country"; request: CountryRequest } | { kind: "currency"; request: CurrencyRequest };

/** The sale being typed: kept while the quote or another page shows on top of it. */
export type SaleDraft = {
  text: string;
  unit: AmountUnit | null;
  accountId: string | null;
  /**
   * How the sale is wired, the merchant's choice: at once (false),
   * or with the bank account's other deferred sells, without a transfer fee.
   */
  deferred: boolean;
};

const EMPTY_DRAFT: SaleDraft = { text: "", unit: null, accountId: null, deferred: false };

export type SellNav = {
  flow: SellFlow;
  state: SellState;
  push(page: SellPage): void;
  /** Back to the page under this one. */
  pop(): void;
  /** `page` in place of the one shown (the quote paid: its sale sold). */
  replace(page: SellPage): void;
  close(): void;
  /** While true, the panel stays: neither its close button nor its arrow closes it. */
  lock(locked: boolean): void;
  draft: SaleDraft;
  setDraft(next: SaleDraft): void;
  /** The countries, in a panel over this one (Sheet's `over`): `request.onSelect` gets the one chosen. */
  pickCountry(request: CountryRequest): void;
  /** The currencies of a sale, in a panel over this one, as `pickCountry`. */
  pickCurrency(request: CurrencyRequest): void;
  /** A sale sent: "Wallet" reads its balance again. */
  onSold(): void;
};

const SellNavContext = createContext<SellNav | null>(null);

/** "Sell"'s panel, for its pages. */
export function useSellNav(): SellNav {
  const nav = useContext(SellNavContext);
  if (!nav) throw new Error("useSellNav outside of SellSheet");
  return nav;
}

const NONE = () => () => undefined;
const STARTING = () => SELL_STARTING;

type SellSheetProps = {
  visible: boolean;
  onClose: () => void;
  /** "Wallet"'s connection of the account's wallet, which pays Mt Pelerin. */
  openWallet: () => Promise<void>;
  onSold: () => void;
  /**
   * "Track the sale" of a sale of "Wallet": the panel opens on its progress once Mt
   * Pelerin is ready (logged in first when it must be). Absent: on the sale.
   */
  order?: { orderId: string; fromMs: number } | null;
};

export function SellSheet(props: SellSheetProps) {
  // Made at its first opening: "Wallet" holds it closed, nothing of Mt Pelerin read nor
  // made before "Sell". Each opening makes it again (its flow, its pages), so that it reads Mt
  // Pelerin afresh: a flow kept from the last opening would only read what it does not know yet
  // (flow.ts `advance`). Closed, the last one stays while its panel leaves.
  const [openings, setOpenings] = useState(props.visible ? 1 : 0);
  const [shown, setShown] = useState(props.visible);
  if (shown !== props.visible) {
    setShown(props.visible);
    if (props.visible) setOpenings((count) => count + 1);
  }
  return openings > 0 ? <SellPanel key={openings} {...props} /> : null;
}

function SellPanel({ visible, onClose, openWallet, onSold, order = null }: SellSheetProps) {
  const { t, i18n } = useTranslation();
  const owner = ownerProfile(usePos().profile);
  const [flow] = useState(() => accountSellFlow({ owner, language: i18n.language, openWallet }));
  const state = useSyncExternalStore(
    flow?.subscribe ?? NONE,
    flow?.getState ?? STARTING,
    flow?.getState ?? STARTING
  );
  const [pages, setPages] = useState<SellPage[]>([]);
  const [draft, setDraft] = useState<SaleDraft>(EMPTY_DRAFT);
  const [locked, setLocked] = useState(false);
  // The countries' or currencies' panel (Sheet's `over`: this one out of reach meanwhile), kept
  // until it has slid out after closing (`onHidden`), so that it leaves as it came.
  const [picker, setPicker] = useState<Picker | null>(null);
  const [picking, setPicking] = useState(false);

  // Each opening (a panel of its own, SellSheet) reads Mt Pelerin, from the first page; a closing
  // drops what comes later.
  useEffect(() => {
    if (!flow || !visible) return;
    void flow.start();
    return () => flow.close();
  }, [flow, visible]);

  const waits = state.view.name === "validationPending";
  useEffect(() => {
    if (!flow || !visible || !waits) return;
    const timer = setInterval(() => void flow.refresh({ quiet: true }), MTPELERIN_POLL_MS);
    const appState = AppState.addEventListener("change", (next) => {
      if (next === "active") void flow.refresh({ quiet: true });
    });
    return () => {
      clearInterval(timer);
      appState.remove();
    };
  }, [flow, visible, waits]);

  // Nor can the auto-lock close it while a payment is asked or sent: the passkey's prompt takes no
  // touch of the app, and the payment's outcome would be lost.
  const paying = locked || state.busy === "confirming" || state.busy === "paying";
  useEffect(() => {
    if (!paying) return;
    return holdActivity();
  }, [paying]);

  // The steps' pages need them done: logged out or the session lost, back to the first page. A
  // bank account's form is the bank step's too, while that step shows.
  const ready = state.view.name === "ready";
  const page = pages.at(-1) ?? null;
  const bankStep = state.view.name === "bank" && page?.name === "accountForm";
  if (page !== null && !ready && !bankStep) setPages([]);
  // The sale this opening was asked for ("Track the sale"), once Mt Pelerin is ready: once only,
  // the merchant goes back from it to "Sell".
  const [target, setTarget] = useState(order);
  if (target !== null && ready) {
    setTarget(null);
    setPages([{ name: "order", orderId: target.orderId, fromMs: target.fromMs }]);
  }

  if (!flow) return null;
  const nav: SellNav = {
    flow,
    state,
    push: (next) => setPages((current) => [...current, next]),
    pop: () => setPages((current) => current.slice(0, -1)),
    replace: (next) => setPages((current) => [...current.slice(0, -1), next]),
    close: onClose,
    lock: setLocked,
    draft,
    setDraft,
    pickCountry: (request) => {
      setPicker({ kind: "country", request });
      setPicking(true);
    },
    pickCurrency: (request) => {
      setPicker({ kind: "currency", request });
      setPicking(true);
    },
    onSold
  };
  const header = headerOf(page, state, nav, t);

  return (
    <Sheet
      title={header.title}
      closeLabel={t("sell.close")}
      visible={visible}
      onClose={onClose}
      dismissible={!paying}
      back={paying ? undefined : header.back}
      steps={header.steps}
      page={pageKey(page, state)}
      centered
      headerAction={header.action}
      dialogWidth={480}
      over={
        picker?.kind === "country" ? (
          <CountryPicker
            title={picker.request.title}
            visible={visible && picking}
            value={picker.request.value}
            suggested={null}
            include={picker.request.include}
            detail={picker.request.detail}
            onSelect={picker.request.onSelect}
            onClose={() => setPicking(false)}
            onHidden={() => setPicker(null)}
          />
        ) : picker?.kind === "currency" ? (
          <CurrencyPicker
            title={picker.request.title}
            visible={visible && picking}
            value={picker.request.value}
            currencies={SELL_CURRENCIES}
            onSelect={picker.request.onSelect}
            onClose={() => setPicking(false)}
            onHidden={() => setPicker(null)}
          />
        ) : null
      }
      testID="sell-sheet"
    >
      <SellNavContext.Provider value={nav}>
        {/* The login's steps (SetupPage.tsx) read the same flow through their own context. */}
        <SellLoginContext.Provider value={nav}>{pageOf(page)}</SellLoginContext.Provider>
      </SellNavContext.Provider>
    </Sheet>
  );
}

type Header = {
  title: string;
  back?: { label: string; onPress: () => void };
  steps?: { count: number; current: number };
  action?: ReactNode;
};

/** What the header shows over `page` (null: the first page, the steps' or the sale's). */
function headerOf(page: SellPage | null, state: SellState, nav: SellNav, t: TFunction): Header {
  const back = { label: t("sell.back"), onPress: nav.pop };
  const step = setupStep(state.view);
  const steps = step === null ? undefined : { count: 3, current: step };
  if (page === null) {
    if (state.view.name === "ready") {
      return {
        title: t("sell.title"),
        action: (
          <IconButton
            icon="gear"
            label={t("sell.sale.settings")}
            onPress={() => nav.push({ name: "settings" })}
            testID="sell-settings-open"
          />
        )
      };
    }
    // The code back to the number: the flow's own step back.
    const stepBack =
      state.view.name === "code"
        ? { label: t("sell.back"), onPress: () => nav.flow.back() }
        : undefined;
    return { title: t("sell.title"), steps, back: stepBack };
  }
  switch (page.name) {
    case "accountForm":
      return { title: t("sell.accountForm.title"), back, steps };
    case "accountEdit":
      return { title: t("sell.accountEdit.title"), back };
    case "chooseAccount":
      return { title: t("sell.sale.chooseAccount"), back };
    case "quote":
      return { title: t("sell.quote.title"), back };
    case "sold":
      return { title: t("sell.title") };
    case "settings":
      return { title: t("sell.settings.title"), back };
    case "accounts":
      return { title: t("sell.accounts.title"), back };
    case "history":
      return { title: t("sell.history.title"), back };
    case "limits":
      return { title: t("sell.limits.title"), back };
    case "order":
      return { title: t("sell.order.title"), back };
  }
}

/**
 * Which page shows, for the panel's fade from one to the next (Sheet's `page`): a page pushed, or
 * under them the step of the flow (a view that keeps its page: the 1 sat asked for and that cannot
 * be paid, the start before the account is read), then the sale. The page's own context is in what
 * the panel keeps of a page left (`SellNavContext` within its children): drawn as it was, never
 * with the new state.
 */
function pageKey(page: SellPage | null, state: SellState): string {
  if (page === null) {
    switch (state.view.name) {
      case "unread":
        return "starting";
      case "unaffordable":
        return "validation";
      default:
        return state.view.name;
    }
  }
  switch (page.name) {
    case "quote":
      return `quote:${page.quote.order.id}`;
    case "sold":
      return `sold:${page.quote.order.id}`;
    case "order":
      return `order:${page.orderId}`;
    case "accountEdit":
      return `accountEdit:${page.account.id}`;
    default:
      return page.name;
  }
}

function pageOf(page: SellPage | null): ReactNode {
  if (page === null) return <FirstPage />;
  switch (page.name) {
    case "accountForm":
      return <AccountFormPage currency={page.currency ?? null} />;
    case "accountEdit":
      return <AccountFormPage currency={null} editing={page.account} />;
    case "chooseAccount":
      return <ChooseAccountPage />;
    case "quote":
      // A new quote in an expired one's place starts afresh.
      return <QuotePage key={page.quote.order.id} quote={page.quote} />;
    case "sold":
      return <OrderPage orderId={page.quote.order.id} sold={page} />;
    case "settings":
      return <SettingsPage />;
    case "accounts":
      return <AccountsPage />;
    case "history":
      return <HistoryPage />;
    case "limits":
      return <LimitsPage />;
    case "order":
      return <OrderPage orderId={page.orderId} fromMs={page.fromMs} sold={null} />;
  }
}

/** The steps before a first sale, then the sale. */
function FirstPage() {
  const { state } = useSellNav();
  return state.view.name === "ready" ? <SalePage ready={state.view.ready} /> : <SetupPage />;
}
