import {
  MTPELERIN_LANGUAGES,
  SELL_RATE_PROBE_SATS,
  SELL_REFERENCE,
  SPLIT_UNFUNDED_GRACE_SECONDS,
  VALIDATION_SYNC_WINDOW_MS
} from "@/config/mtpelerin";
import { normalizeLightningAddress } from "@/lib/lightning/lnurl";
import { logFailure } from "@/lib/log/log";
import {
  bankAccountChange,
  bankAccountsOf,
  changeApplied,
  knownBankAccount,
  lightningAccountsOf,
  newBankAccount,
  newLightningAccount,
  unreadableAccountError,
  unreadableAccountsOf,
  type BankAccountInput,
  type BankOwnerInput
} from "@/lib/mtpelerin/accounts";
import { ORDERS_PAGE_SIZE, type MtPelerinApi } from "@/lib/mtpelerin/api";
import type { MtpDecimal } from "@/lib/mtpelerin/decimal";
import {
  MtPelerinError,
  isAccountRefusal,
  isDuplicateAccount,
  isMtpError
} from "@/lib/mtpelerin/errors";
import type { EvmSigner } from "@/lib/mtpelerin/evm-login";
import { isE164 } from "@/lib/mtpelerin/guards";
import {
  readValidationInvoice,
  validationComment,
  type CheckedInvoice,
  type InvoiceIssue
} from "@/lib/mtpelerin/invoice";
import { createMtpSession, MtpSessionLostError, type MtpSession } from "@/lib/mtpelerin/session";
import type { PaidValidation } from "@/lib/mtpelerin/session-format";
import type { MtpSessionStore } from "@/lib/mtpelerin/session-sync";
import {
  awaitsFunds,
  checkSellOrder,
  newSellOrder,
  sellAccountsOf,
  sellAssetOf,
  type SalePayment,
  type SellAsset,
  type SellOrderIssue
} from "@/lib/mtpelerin/sale";
import { mtpSaleRecordOf, type MtpSaleRecord } from "@/lib/mtpelerin/sale-record";
import { SPLIT_CLOCK_GAP_SECONDS, unfundedSplitOrder } from "@/lib/mtpelerin/split";
import { transferFeeMinor, type ChfSide } from "@/lib/mtpelerin/transfer-fee";
import type {
  MtpBalances,
  MtpBankAccount,
  MtpEstimate,
  MtpLightningAccount,
  MtpOrder,
  MtpPerson,
  MtpSellOrder,
  MtpTransactionStatus,
  MtpUnreadableAccount
} from "@/lib/mtpelerin/types";
import { newVerificationCode } from "@/lib/mtpelerin/verification-code";
import { randomUuid } from "@/lib/random";

/*
 * "Sell": what
 * the merchant does before a first sale, in order, and what it asks of Mt Pelerin (api.ts) and of
 * the wallet (SellPayer), then the sales themselves. Three steps first: the Mt Pelerin account
 * (its login by SMS; by the account's own signature on Mt Pelerin's dev/test environment,
 * where SMS does not work; then its profile), the Lightning address proven by a 1-sat
 * invoice, a bank account. Each step is derived from Mt Pelerin's answers: a visit
 * starts where the merchant left. No identity verification: the limits of an unverified profile
 * apply.
 *
 * Each call shows what runs (`busy`) and, failed, why and what tries it again (`failure`): offline
 * is never "no"; a session lost leads back to the login. Never logged: a token, the SMS code, a
 * signature, a phone number, an e-mail, an IBAN, an address. Not React: the screens follow it
 * (context.tsx), the tests drive it as it is.
 */

/** A payment from the merchant's wallet: its invoice, checked, and its fees. */
export type PaymentQuote = { invoice: CheckedInvoice; amountSats: bigint; feeSats: bigint };

/** The payments of "Sell" from the merchant's wallet: the 1-sat invoice, then each sale's. */
export type SellPayer = {
  /** What paying `invoice` takes: its amount and the wallet's fees (its prepared payment). */
  quote(invoice: CheckedInvoice): Promise<{ amountSats: bigint; feeSats: bigint }>;
  /** Whether the wallet's balance covers `quote` (read now: never a guess). */
  covers(quote: PaymentQuote): Promise<boolean>;
  /** The wallet's balance, read now (the sale's "available" amount). */
  balance(): Promise<bigint>;
  /**
   * The payment hashes (lowercase hex) of the invoices the wallet paid or is paying since `since`
   * (Unix seconds), with where each payment stands: sale.ts `salePayments` of its payments.
   */
  paidSince(since: number): Promise<ReadonlyMap<string, SalePayment>>;
  /** The passkey, before the payment leaves (confirmAccountPasskey). Its prompt dismissed: false. */
  confirm(): Promise<boolean>;
  pay(quote: PaymentQuote): Promise<void>;
};

export type SellDeps = {
  api: MtPelerinApi;
  /** The open account's session, on this device and its relays (session-sync.ts). */
  sessions: MtpSessionStore;
  /**
   * The merchant's Lightning address (the point of sale's, getWalletLightningAddress's). Null: the
   * merchant sign-up's login (its bank step), before the point of
   * sale and its address exist: the flow stops once the Mt Pelerin profile is complete
   * (`signedIn`), never asking for a 1-sat invoice nor paying anything.
   */
  lightningAddress: string | null;
  /** `deviceInfo.version` of the SMS login's device. */
  appVersion: string;
  /** The app's language: Mt Pelerin's e-mails', Finnish as English. */
  language: string;
  /** This build's BOLT11 prefix ("bc"): an invoice of another network is refused. */
  network: string;
  payer: SellPayer;
  /**
   * Writes a sale's record (its rate, what it wires, its bank account… sale-records.ts) to a
   * majority of the account's relays, after the passkey and before its payment leaves; rejects when
   * it could not: nothing is paid then.
   */
  recordSale: (sale: MtpSaleRecord) => Promise<void>;
  /** The referral code (src/config/mtpelerin.ts): empty, none posted. */
  referralCode: string;
  /**
   * Mt Pelerin's dev/test environment (only the wallet-signature login works there): the
   * account's own signer (evm-login.ts), in place of the SMS login. Null: by SMS.
   */
  walletLogin: EvmSigner | null;
  nowMs?: () => number;
  newCode?: () => string;
  newOid?: () => string;
};

/** What the screen waits for. */
export type SellBusy =
  | "starting"
  | "reading"
  | "signingIn"
  | "sendingCode"
  | "checkingCode"
  | "savingProfile"
  | "preparingInvoice"
  | "confirming"
  | "paying"
  | "addingAccount"
  | "savingAccount"
  | "loggingOut";

export type SellFailureKind =
  /** No answer from Mt Pelerin: nothing decided. */
  | "offline"
  /** Mt Pelerin failed or answered what the app cannot read. */
  | "server"
  /** It refused what was sent. */
  | "refused"
  /** The SMS code is wrong, or its device's window ended ("Device registration expired"). */
  | "codeRefused"
  | "codeExpired"
  /** Mt Pelerin's 1-sat invoice is not one of this network (invoice.ts): nothing paid. */
  | InvoiceIssue
  /** The wallet could not prepare or send the payment. */
  | "payment"
  /** "Duplicate account" of a bank account: another profile's IBAN. */
  | "ibanTaken"
  /** The profile has that IBAN in that currency already (knownBankAccount): nothing created. */
  | "accountKnown"
  /** Mt Pelerin refused a bank account's change, or kept what it had: the list says what it has. */
  | "accountUnchanged";

export type SellFailure = { kind: SellFailureKind; retry: (() => void) | null };

/** What the merchant has once the three steps are done: what a sale needs. */
export type SellReady = {
  person: MtpPerson;
  asset: SellAsset;
  lightning: MtpLightningAccount;
  /** The bank accounts a sale may go to (sale.ts), at least one. */
  accounts: MtpBankAccount[];
};

export type SellView =
  /** The account's session being read (this device's, the relays'). */
  | { name: "starting" }
  /** Step 1 on Mt Pelerin's dev/test environment: its login by the account's signature. */
  | { name: "connect" }
  /** Step 1 in production: the number to log in with. */
  | { name: "phone" }
  | { name: "code"; phone: string }
  /** The profile's e-mail (and phone, without an SMS login), created or completed. */
  | { name: "profile"; person: MtpPerson | null; askPhone: boolean }
  /** The sign-up's login done (`lightningAddress` null): the profile is complete, nothing else read. */
  | { name: "signedIn"; person: MtpPerson }
  /** Step 2: the 1-sat payment to confirm. */
  | { name: "validation"; account: MtpLightningAccount; quote: PaymentQuote }
  /** The wallet cannot pay 1 sat and its fees. */
  | { name: "unaffordable"; account: MtpLightningAccount }
  /** Paid, Mt Pelerin's sync awaited (every ~11 minutes). */
  | { name: "validationPending"; account: MtpLightningAccount; paidAt: number; hasBank: boolean }
  /** The address proven while the merchant waited. */
  | { name: "verified"; account: MtpLightningAccount; hasBank: boolean }
  /** Step 3: no bank account yet. */
  | { name: "bank" }
  /** Everything a sale needs. */
  | { name: "ready"; ready: SellReady }
  /** The Lightning address is another profile's ("Duplicate account"). */
  | { name: "addressTaken" }
  /** Mt Pelerin's configuration lists no Lightning asset in sats (sale.ts): no sale offered. */
  | { name: "unavailable" }
  /** Mt Pelerin's answers not read yet: their read failed (`failure`) or runs (`busy`). */
  | { name: "unread" };

export type SellState = {
  view: SellView;
  busy: SellBusy | null;
  failure: SellFailure | null;
  /** The session was lost: the login says so. */
  sessionLost: boolean;
};

export const SELL_STARTING: SellState = {
  view: { name: "starting" },
  busy: "starting",
  failure: null,
  sessionLost: false
};

/** The three steps' header (StepHeader's dots), null for the others. */
export function setupStep(view: SellView): 0 | 1 | 2 | null {
  switch (view.name) {
    case "connect":
    case "phone":
    case "code":
    case "profile":
      return 0;
    case "validation":
    case "unaffordable":
    case "validationPending":
    case "verified":
      return 1;
    case "bank":
      return 2;
    default:
      return null;
  }
}

/** The phone typed, as E.164: spaces, dots and dashes out, "00" as "+". */
export function normalizePhone(text: string, dialCode = "+41"): string | null {
  const compact = text.replace(/[\s.()-]/g, "");
  if (compact === "") return null;
  let phone = compact.startsWith("00") ? `+${compact.slice(2)}` : compact;
  // A national number ("079 123 45 67", "79 123 45 67") with the dial code chosen.
  if (!phone.startsWith("+")) phone = `${dialCode}${phone.replace(/^0/, "")}`;
  return isE164(phone) ? phone : null;
}

/** A 6-digit SMS code, spaces out. */
export function normalizeCode(text: string): string | null {
  const code = text.replace(/\s/g, "");
  return /^[0-9]{6}$/.test(code) ? code : null;
}

/** The profile's `language`: the app's when Mt Pelerin has it, else English. */
export function mtpLanguage(language: string): string {
  const code = language.slice(0, 2).toLowerCase();
  return (MTPELERIN_LANGUAGES as readonly string[]).includes(code) ? code : "en";
}

/** An e-mail address, roughly (Mt Pelerin checks it and sends its own mail). */
export function isEmail(text: string): boolean {
  return /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,63}$/.test(text.trim());
}

/** What a failure of Mt Pelerin's or of its session tells the merchant. */
export function sellFailureKind(error: unknown): SellFailureKind {
  if (!(error instanceof MtPelerinError)) return "server";
  if (error.code === "offline") return "offline";
  if (error.code === "refused" || error.code === "conflict" || error.code === "forbidden") {
    return "refused";
  }
  return "server";
}

/**
 * Logs the accounts of a list the guards could not read (guards.ts `readAccounts`), once per
 * field it names: they are left out of what is offered, the journal says which field was not
 * read, never its value ("Contact support").
 */
export function logUnreadableAccounts(unreadable: readonly MtpUnreadableAccount[]): void {
  const fields = new Set(unreadable.map((account) => account.field));
  for (const field of fields) {
    logFailure(
      "Mt Pelerin listed an account the app cannot read",
      unreadableAccountError({ kind: "unreadable", field }),
      false
    );
  }
}

/** A sale's order created and checked, its invoice's payment prepared. */
export type SaleQuote = {
  order: MtpSellOrder;
  account: MtpBankAccount;
  sats: bigint;
  payment: PaymentQuote;
  /** Its francs wait at Mt Pelerin for the bank account's one transfer (SaleTerms). */
  deferred: boolean;
  /**
   * Mt Pelerin's transfer fee, in minor units of the order's currency (transfer-fee.ts): taken
   * from what the order wires, 0 for a deferred sell.
   */
  transferFeeMinor: number;
  /** The `reference` and `oid` the order was asked with (its record keeps them). */
  reference: string;
  oid: string;
};

/**
 * The estimate of a sale of "Sell" (its "about" amount): Mt Pelerin's estimate, and the same sats
 * in CHF, which tell its transfer fee (transfer-fee.ts); null when the francs could not be read.
 */
export type SaleEstimate = { estimate: MtpEstimate; chf: ChfSide | null };

/** How a sale is asked for, besides its sats and its account; none: a sale of "Sell". */
export type SaleTerms = {
  /** `oid`: the order's reference; the split's sale's carries its checkpoint (split.ts). */
  oid?: string;
  /** `withdraw: "manual"`: a deferred sell. */
  deferred?: boolean;
};

export type SaleQuoteRead =
  { ok: true; quote: SaleQuote } | { ok: false; issue: SellOrderIssue | "unaffordable" };

/** The year's orders, every page: at most this many pages, else "unknown". */
const MAX_ORDER_PAGES = 50;

/** The ISO 8601 day of `ms` (UTC), as the orders' `fromDate` / `toDate`. */
function isoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export class SellFlow {
  private state: SellState = SELL_STARTING;
  private readonly listeners = new Set<() => void>();
  private session: MtpSession | null = null;
  private paid: PaidValidation[] = [];
  private person: MtpPerson | null = null;
  private asset: SellAsset | null = null;
  private lightning: MtpLightningAccount | null = null;
  private banks: MtpBankAccount[] | null = null;
  /** The bank accounts of the last list read that the guards could not read: never offered. */
  private unreadableBanks: MtpUnreadableAccount[] = [];
  /** The device of the SMS login, registered again at each code asked. */
  private device: { id: string; phone: string } | null = null;
  /**
   * The phone of this login: the profile's by default (Mt Pelerin prefers the one used to log in).
   */
  private loginPhone: string | null = null;
  /** The pending view was shown this visit: its end shows "Address verified". */
  private awaitingValidation = false;
  /** Bumped by each action: an answer of an earlier one changes nothing. */
  private round = 0;
  private closed = false;
  private readonly now: () => number;
  private readonly newCode: () => string;
  private readonly newOid: () => string;
  /** The invoices whose sale's record a majority of the relays took (paySale): written once. */
  private readonly recorded = new Set<string>();

  constructor(private readonly deps: SellDeps) {
    // Read at each call, never a copy of `Date.now`: the panels count down with the clock in use.
    this.now = deps.nowMs ?? (() => Date.now());
    this.newCode = deps.newCode ?? (() => newVerificationCode());
    this.newOid = deps.newOid ?? randomUuid;
  }

  getState = (): SellState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** The screens left: an answer that comes later changes nothing. `start` opens it again. */
  close(): void {
    this.closed = true;
    this.round += 1;
  }

  private set(next: Partial<SellState>): void {
    if (this.closed) return;
    this.state = { ...this.state, ...next };
    for (const listener of this.listeners) listener();
  }

  /**
   * The merchant's Lightning address, for the steps after the login: never reached by the
   * sign-up's login (`lightningAddress` null), which stops at `signedIn`.
   */
  private address(): string {
    const { lightningAddress } = this.deps;
    if (lightningAddress === null) throw new Error("No Lightning address at the sign-up's login");
    return lightningAddress;
  }

  /** The login's step, for this build's Mt Pelerin. */
  private loginView(): SellView {
    return this.deps.walletLogin ? { name: "connect" } : { name: "phone" };
  }

  /** A session lost: what Mt Pelerin answered is forgotten, back to the login. */
  private lose(): void {
    this.person = null;
    this.lightning = null;
    this.banks = null;
    this.unreadableBanks = [];
    this.set({ view: this.loginView(), sessionLost: true, failure: null });
  }

  /**
   * Runs `work` as `busy`, the screen waiting; its failure kept with `retry`. A session lost leads
   * back to the login. Resolves once done, whatever happened.
   */
  private async run(
    busy: SellBusy,
    work: (isCurrent: () => boolean) => Promise<void>,
    retry: (() => void) | null,
    { quiet = false }: { quiet?: boolean } = {}
  ): Promise<void> {
    const round = ++this.round;
    const isCurrent = () => !this.closed && this.round === round;
    if (!quiet) this.set({ busy, failure: null });
    try {
      await work(isCurrent);
    } catch (error) {
      if (!isCurrent()) return;
      if (error instanceof MtpSessionLostError) {
        this.lose();
        return;
      }
      logFailure(`Selling to the bank failed (${busy})`, error, false);
      if (!quiet) this.set({ failure: { kind: sellFailureKind(error), retry } });
    } finally {
      if (isCurrent()) this.set({ busy: null });
    }
  }

  private requireSession(): MtpSession {
    this.session ??= createMtpSession(this.deps.api, this.deps.sessions, null);
    return this.session;
  }

  /**
   * Runs `call` with the session's access token (refreshed once on a 401). A session lost
   * leads back to the login whoever called (a sale's screens call without `run`), then rejects.
   */
  private async authed<T>(call: (api: MtPelerinApi, token: string) => Promise<T>): Promise<T> {
    try {
      return await this.requireSession().authed((token) => call(this.deps.api, token));
    } catch (error) {
      if (error instanceof MtpSessionLostError) this.lose();
      throw error;
    }
  }

  /**
   * Reads the account's session (this device's and the relays', session-sync.ts): with one, Mt
   * Pelerin's answers; without, the login.
   */
  start(): Promise<void> {
    this.closed = false;
    return this.run(
      "starting",
      async (isCurrent) => {
        const record = await this.deps.sessions.load();
        if (!isCurrent()) return;
        this.paid = record.paidValidations;
        this.session = createMtpSession(this.deps.api, this.deps.sessions, record.refreshToken);
        if (!this.session.open()) {
          this.set({ view: this.loginView() });
          return;
        }
        this.set({ view: { name: "unread" } });
        await this.advance(isCurrent);
      },
      () => void this.start()
    );
  }

  /**
   * Reads what is not known yet from Mt Pelerin (and what `reread` names again), in the steps'
   * order, until the view is decided. What is read again replaces what was known only once its
   * answer came: a read that fails leaves the last one, never "none". The 1-sat invoice of a
   * Lightning address not proven yet is asked for and prepared at once: its step shows what it
   * costs.
   */
  private async advance(
    isCurrent: () => boolean,
    reread: { person?: boolean; lightning?: boolean; banks?: boolean } = {}
  ): Promise<void> {
    const { api, lightningAddress } = this.deps;
    if (this.person === null || reread.person) {
      const person = await this.authed((mtp, token) => mtp.findPerson(token));
      if (!isCurrent()) return;
      this.person = person;
    }
    const person = this.person;
    if (person === null || person.email === null || person.phone === null) {
      this.set({
        view: {
          name: "profile",
          person,
          askPhone: this.loginPhone === null && person?.phone == null
        }
      });
      return;
    }
    if (lightningAddress === null) {
      this.set({ view: { name: "signedIn", person } });
      return;
    }
    if (this.asset === null) {
      const asset = sellAssetOf(await api.config());
      if (!isCurrent()) return;
      if (asset === null) {
        this.set({ view: { name: "unavailable" } });
        return;
      }
      this.asset = asset;
    }
    if (this.lightning === null || reread.lightning) {
      const accounts = await this.authed((mtp, token) =>
        mtp.listAccounts(token, { crypto_address: lightningAddress })
      );
      if (!isCurrent()) return;
      // The merchant's address only, whatever else the filter let through (Mt Pelerin's answer).
      const address = normalizeLightningAddress(lightningAddress);
      const lightning =
        lightningAccountsOf(accounts).find((account) => account.cryptoAddress === address) ?? null;
      // An account the guards could not read may be this address: "none" is never told then
      // (the step would ask Mt Pelerin to add it again, refused as another profile's).
      const [unreadable] = unreadableAccountsOf(accounts);
      if (lightning === null && unreadable) throw unreadableAccountError(unreadable);
      this.lightning = lightning;
    }
    if (this.banks === null || reread.banks) {
      const accounts = await this.authed((mtp, token) =>
        mtp.listAccounts(token, { type: "external" })
      );
      if (!isCurrent()) return;
      const banks = bankAccountsOf(accounts);
      const unreadable = unreadableAccountsOf(accounts);
      // The accounts the guards could not read are never offered. Without any other to sell to,
      // "no bank account" is never told (the bank step would add one that may be there): the
      // read fails, as it did before any could be left out.
      if (unreadable[0] && sellAccountsOf(banks).length === 0) {
        throw unreadableAccountError(unreadable[0]);
      }
      logUnreadableAccounts(unreadable);
      this.banks = banks;
      this.unreadableBanks = unreadable;
    }
    const hasBank = sellAccountsOf(this.banks).length > 0;
    const lightning = this.lightning;
    if (lightning === null || lightning.status !== "active") {
      // A payment past Mt Pelerin's sync window will never be matched: paid again.
      const syncedSince = this.now() - VALIDATION_SYNC_WINDOW_MS;
      const paid =
        lightning === null
          ? undefined
          : this.paid.find(
              (entry) => entry.accountId === lightning.id && entry.paidAt >= syncedSince
            );
      if (lightning !== null && paid) {
        this.awaitingValidation = true;
        this.set({
          view: { name: "validationPending", account: lightning, paidAt: paid.paidAt, hasBank }
        });
        return;
      }
      await this.prepareValidation(isCurrent, lightningAddress);
      return;
    }
    if (this.awaitingValidation) {
      this.awaitingValidation = false;
      this.set({ view: { name: "verified", account: lightning, hasBank } });
      return;
    }
    if (!hasBank) {
      this.set({ view: { name: "bank" } });
      return;
    }
    this.set({
      view: {
        name: "ready",
        ready: { person, asset: this.asset, lightning, accounts: sellAccountsOf(this.banks) }
      }
    });
  }

  /** Reads Mt Pelerin's answers again (the pending view's polling, back from a form). */
  refresh({ quiet = false }: { quiet?: boolean } = {}): Promise<void> {
    if (quiet && this.state.busy !== null) return Promise.resolve();
    return this.run(
      "reading",
      async (isCurrent) => {
        const { name } = this.state.view;
        await this.advance(isCurrent, {
          person: name === "profile" || name === "unread",
          lightning: true,
          banks: true
        });
      },
      () => void this.refresh(),
      { quiet }
    );
  }

  /** On Mt Pelerin's dev/test environment, the login by the account's own signature. */
  connect(): Promise<void> {
    const signer = this.deps.walletLogin;
    if (!signer) return Promise.resolve();
    return this.run(
      "signingIn",
      async (isCurrent) => {
        const { api, appVersion } = this.deps;
        const device = await api.addWalletDevice(signer.address, appVersion);
        if (!isCurrent()) return;
        await this.requireSession().login(device.id, signer.signDevice(device.id));
        if (!isCurrent()) return;
        this.set({ sessionLost: false });
        this.person = null;
        await this.advance(isCurrent);
      },
      () => void this.connect()
    );
  }

  /** Back one step among this device's own (the code, to the number): true when there was one. */
  back(): boolean {
    const { view } = this.state;
    if (view.name !== "code") return false;
    this.round += 1;
    this.set({ view: { name: "phone" }, failure: null, busy: null });
    return true;
  }

  /** The SMS login's steps 1 and 2: the device registered with `phone`, then the SMS sent. */
  submitPhone(text: string, dialCode?: string): Promise<void> {
    const phone = normalizePhone(text, dialCode);
    if (phone === null) return Promise.resolve();
    return this.run(
      "sendingCode",
      async (isCurrent) => {
        const { api, appVersion } = this.deps;
        const device = await api.addPhoneDevice(phone, appVersion);
        await api.sendSms(device.id);
        if (!isCurrent()) return;
        this.device = { id: device.id, phone };
        this.set({ view: { name: "code", phone }, sessionLost: false });
      },
      () => void this.submitPhone(text, dialCode)
    );
  }

  /** A new code: the device registered again (a device is registered at each login). */
  resendCode(): Promise<void> {
    const { view } = this.state;
    if (view.name !== "code") return Promise.resolve();
    return this.submitPhone(view.phone);
  }

  /** The SMS login's step 3, then what the profile has. The code is never logged nor kept. */
  submitCode(text: string): Promise<void> {
    const code = normalizeCode(text);
    const device = this.device;
    if (this.state.view.name !== "code" || code === null || device === null) {
      return Promise.resolve();
    }
    return this.run(
      "checkingCode",
      async (isCurrent) => {
        try {
          await this.requireSession().login(device.id, code);
        } catch (error) {
          if (!isCurrent()) return;
          // "403 Device registration expired"; a device unknown: as expired.
          if (isMtpError(error, "forbidden") || isMtpError(error, "notFound")) {
            this.set({ failure: { kind: "codeExpired", retry: null } });
            return;
          }
          if (isMtpError(error, "unauthorized") || isMtpError(error, "refused")) {
            this.set({ failure: { kind: "codeRefused", retry: null } });
            return;
          }
          throw error;
        }
        if (!isCurrent()) return;
        this.device = null;
        this.loginPhone = device.phone;
        this.person = null;
        try {
          await this.advance(isCurrent);
        } catch (error) {
          // Logged in, its code spent: what failed is reading Mt Pelerin, tried again by reading
          // it again (`refresh`), never by the code a second time (refused).
          if (isCurrent() && this.state.view.name === "code") {
            this.set({ view: { name: "unread" } });
          }
          throw error;
        }
      },
      () => void (this.state.view.name === "code" ? this.submitCode(text) : this.refresh())
    );
  }

  /** The phone the profile's form starts from: the login's, else the profile's. */
  profilePhone(): string | null {
    const { view } = this.state;
    return this.loginPhone ?? (view.name === "profile" ? (view.person?.phone ?? null) : null);
  }

  /**
   * The profile created once (`PUT`, after the referral when the config gives a
   * code), or completed (`PATCH`). A 409 on `PUT`: the profile exists, read again and completed.
   * Always `type: "user"`: no KYB.
   */
  saveProfile(fields: { email: string; phone?: string }): Promise<void> {
    const { view } = this.state;
    if (view.name !== "profile") return Promise.resolve();
    const phone = fields.phone === undefined ? this.profilePhone() : normalizePhone(fields.phone);
    const email = fields.email.trim();
    if (phone === null || !isEmail(email)) return Promise.resolve();
    const language = mtpLanguage(this.deps.language);
    return this.run(
      "savingProfile",
      async (isCurrent) => {
        const { referralCode } = this.deps;
        let person = view.person;
        if (person === null) {
          if (referralCode !== "") {
            // The referral is posted right before the `PUT /persons` call. Refused, the
            // profile is still made: a referral is no reason to stop the merchant.
            try {
              await this.authed((mtp, token) => mtp.createReferral(token, phone, referralCode));
            } catch (error) {
              if (isMtpError(error, "offline") || error instanceof MtpSessionLostError) throw error;
              logFailure("Posting the Mt Pelerin referral failed", error, false);
            }
          }
          try {
            person = await this.authed((mtp, token) =>
              mtp.createPerson(token, { type: "user", email, phone, language })
            );
          } catch (error) {
            // A `409` means the profile is already there: fetch it and switch to `PATCH`, never
            // retry the `PUT`.
            if (!isMtpError(error, "conflict")) throw error;
            person = await this.authed((mtp, token) => mtp.findPerson(token));
            if (person === null) throw error;
          }
        }
        const missing: { email?: string; phone?: string; language?: string } = {};
        if (person.email === null) missing.email = email;
        if (person.phone === null) missing.phone = phone;
        if (person.language === null) missing.language = language;
        if (Object.keys(missing).length > 0) {
          const id = person.id;
          person = await this.authed((mtp, token) => mtp.updatePerson(token, id, missing));
        }
        if (!isCurrent()) return;
        this.person = person;
        await this.advance(isCurrent);
      },
      () => void this.saveProfile(fields)
    );
  }

  /**
   * The merchant's Lightning address as its own account, unless it is one already, with a
   * verification code; 409 "Duplicate account": another profile's. Then its 1-sat invoice,
   * checked (invoice.ts), and its payment prepared by the wallet.
   */
  private async prepareValidation(
    isCurrent: () => boolean,
    lightningAddress: string
  ): Promise<void> {
    this.set({ busy: "preparingInvoice" });
    let account = this.lightning;
    if (account === null) {
      const body = newLightningAccount(lightningAddress, this.newCode());
      try {
        const created = await this.authed((mtp, token) => mtp.createAccount(token, body));
        if (created.kind !== "lightning") throw new MtPelerinError("malformed");
        account = created;
      } catch (error) {
        if (!isDuplicateAccount(error)) throw error;
        if (!isCurrent()) return;
        this.set({ view: { name: "addressTaken" } });
        return;
      }
      if (!isCurrent()) return;
      this.lightning = account;
    }
    const scopeId = account.scopeId ?? this.person?.scopeId;
    if (!scopeId) throw new MtPelerinError("malformed");
    const answer = await this.deps.api.validationInvoice({
      comment: validationComment(lightningAddress),
      scopeId,
      accountId: account.id
    });
    if (!isCurrent()) return;
    const read = readValidationInvoice(answer.paymentRequest, {
      network: this.deps.network,
      nowSeconds: Math.floor(this.now() / 1000)
    });
    if (!read.ok) {
      logFailure(`Mt Pelerin's invoice was refused (${read.issue})`);
      this.set({
        view: { name: "unread" },
        failure: { kind: read.issue, retry: () => void this.refresh() }
      });
      return;
    }
    let quote: PaymentQuote;
    let covered: boolean;
    try {
      const prepared = await this.deps.payer.quote(read.invoice);
      quote = { invoice: read.invoice, ...prepared };
      covered = await this.deps.payer.covers(quote);
    } catch (error) {
      if (!isCurrent()) return;
      logFailure("Preparing the 1-sat payment failed", error);
      this.set({
        view: { name: "unread" },
        failure: { kind: "payment", retry: () => void this.refresh() }
      });
      return;
    }
    if (!isCurrent()) return;
    this.set({
      view: covered ? { name: "validation", account, quote } : { name: "unaffordable", account }
    });
  }

  /**
   * "Pay 1 sat": the invoice still valid (else a new one), the passkey, then the payment;
   * noted on this device and the account's, then Mt Pelerin's sync awaited.
   */
  payValidation(): Promise<void> {
    const { view } = this.state;
    if (view.name !== "validation") return Promise.resolve();
    const { account, quote } = view;
    return this.run(
      "confirming",
      async (isCurrent) => {
        const still = readValidationInvoice(quote.invoice.pr, {
          network: this.deps.network,
          nowSeconds: Math.floor(this.now() / 1000)
        });
        if (!still.ok) {
          await this.prepareValidation(isCurrent, this.address());
          return;
        }
        const confirmed = await this.deps.payer.confirm();
        // Dismissed: nothing left, the same confirmation stays.
        if (!confirmed || !isCurrent()) return;
        // The passkey's prompt may have lasted: an invoice ended meanwhile is asked again.
        const after = readValidationInvoice(quote.invoice.pr, {
          network: this.deps.network,
          nowSeconds: Math.floor(this.now() / 1000)
        });
        if (!after.ok) {
          await this.prepareValidation(isCurrent, this.address());
          return;
        }
        this.set({ busy: "paying" });
        try {
          await this.deps.payer.pay(quote);
        } catch (error) {
          if (!isCurrent()) return;
          logFailure("Paying the 1-sat invoice failed", error);
          this.set({ failure: { kind: "payment", retry: null } });
          return;
        }
        const paid = { accountId: account.id, paidAt: this.now() };
        this.paid = [...this.paid.filter((entry) => entry.accountId !== account.id), paid];
        // Never rejects: unsaved, only a later visit would offer to pay again.
        await this.deps.sessions.recordPaid(paid);
        if (!isCurrent()) return;
        this.awaitingValidation = true;
        this.set({
          view: {
            name: "validationPending",
            account,
            paidAt: paid.paidAt,
            hasBank: sellAccountsOf(this.banks ?? []).length > 0
          }
        });
      },
      null
    );
  }

  /** From the pending or verified view: on to the bank account, the address awaited meanwhile. */
  toBank(): void {
    const { view } = this.state;
    // Pending: the bank account meanwhile (the address still awaited); proven: what comes next.
    if (view.name === "validationPending" && !view.hasBank) {
      // The pending view's reading, if one runs, changes nothing any more (as `back`).
      this.round += 1;
      this.set({ view: { name: "bank" }, failure: null, busy: null });
    } else if (view.name === "verified") {
      void this.refresh();
    }
  }

  /** The bank accounts known, null before they were read. */
  bankAccounts(): MtpBankAccount[] | null {
    return this.banks;
  }

  /** How many bank accounts of the last list read the guards could not read (never offered). */
  unreadableBankCount(): number {
    return this.unreadableBanks.length;
  }

  /**
   * A bank account added, always as the merchant's own (`user_is_owner: true`); then what
   * the steps lead to. False when nothing was sent (a field missing) or it failed (`failure`).
   */
  async addBankAccount(input: BankAccountInput): Promise<boolean> {
    const body = newBankAccount(input);
    if (body === null) return false;
    let added = false;
    await this.run(
      "addingAccount",
      async (isCurrent) => {
        // Mt Pelerin takes the same IBAN twice on one profile (seen on dev/test): its
        // accounts read now (another device may have added it), a second one is never created.
        const listed = await this.authed((mtp, token) =>
          mtp.listAccounts(token, { type: "external" })
        );
        if (!isCurrent()) return;
        const banks = bankAccountsOf(listed);
        this.banks = banks;
        this.unreadableBanks = unreadableAccountsOf(listed);
        if (knownBankAccount(banks, body) !== null) {
          this.set({ failure: { kind: "accountKnown", retry: null } });
          return;
        }
        try {
          await this.authed((mtp, token) => mtp.createAccount(token, body));
        } catch (error) {
          if (!isDuplicateAccount(error)) throw error;
          // The IBAN may be one of the merchant's own accounts the guards could not read: never
          // told another profile's then.
          const [unreadable] = this.unreadableBanks;
          if (unreadable) throw unreadableAccountError(unreadable);
          if (!isCurrent()) return;
          // The same IBAN cannot be registered as owned by another user.
          this.set({ failure: { kind: "ibanTaken", retry: null } });
          return;
        }
        if (!isCurrent()) return;
        added = true;
        await this.advance(isCurrent, { banks: true });
      },
      () => void this.addBankAccount(input)
    );
    return added;
  }

  /**
   * A bank account's holder and address changed (`PATCH /accounts/{id}`, undocumented by Mt
   * Pelerin), never its IBAN nor its currency; then its accounts read
   * again. True only once that read shows the account as asked: Mt Pelerin's refusal, or an
   * account that kept what it had, is `accountUnchanged`. False too when nothing was sent (a
   * field missing, nothing changed).
   */
  async updateBankAccount(account: MtpBankAccount, input: BankOwnerInput): Promise<boolean> {
    const change = bankAccountChange(account, input);
    if (change === null) return false;
    let updated = false;
    await this.run(
      "savingAccount",
      async (isCurrent) => {
        try {
          await this.authed((mtp, token) =>
            mtp.updateBankAccount(token, account.id, change.request)
          );
        } catch (error) {
          if (!isAccountRefusal(error)) throw error;
          if (!isCurrent()) return;
          logFailure("Mt Pelerin refused a bank account's change", error, false);
          this.set({ failure: { kind: "accountUnchanged", retry: null } });
          return;
        }
        if (!isCurrent()) return;
        // What Mt Pelerin has, read again, decides: its answer alone proves nothing kept.
        await this.advance(isCurrent, { banks: true });
        if (!isCurrent()) return;
        const read = this.banks?.find(({ id }) => id === account.id);
        if (read === undefined || !changeApplied(read, account, change)) {
          logFailure("Mt Pelerin kept a bank account unchanged");
          this.set({ failure: { kind: "accountUnchanged", retry: null } });
          return;
        }
        updated = true;
      },
      () => void this.updateBankAccount(account, input)
    );
    return updated;
  }

  /** A failure shown, read: it goes. */
  dismissFailure(): void {
    this.set({ failure: null });
  }

  /** The estimate of a sale of `sats` into `currency` (its "about" amount). */
  estimate(sats: bigint, currency: string): Promise<MtpEstimate> {
    const asset = this.asset;
    if (asset === null) return Promise.reject(new Error("No asset to sell"));
    return this.authed((mtp, token) =>
      mtp.estimateSell(token, {
        currencyIn: asset.currency,
        networkIn: asset.network,
        currencyOut: currency,
        amountIn: sats.toString()
      })
    );
  }

  /**
   * Mt Pelerin's price of 1 sat in `currency`, before fees (the estimate's `exchangeRate.mid`),
   * read now
   * from an estimate of SELL_RATE_PROBE_SATS: what an amount typed in that currency is worth in
   * sats at the rate Mt Pelerin buys them (SalePage). Null when its estimate gives none.
   */
  async rate(currency: string): Promise<MtpDecimal | null> {
    const read = await this.estimate(SELL_RATE_PROBE_SATS, currency);
    return read.rate;
  }

  /**
   * The estimate of a sale of `sats` into `currency`, with the same sats in CHF (`chf`): itself for
   * a sale in CHF, else a second estimate, read alongside; its failure leaves `chf` null (the
   * transfer fee then unknown, a deferred sell's still 0), never the sale's estimate.
   */
  async estimateSale(sats: bigint, currency: string): Promise<SaleEstimate> {
    if (currency === "CHF") {
      const estimate = await this.estimate(sats, currency);
      return { estimate, chf: { wired: estimate.destAmount, rate: estimate.rate } };
    }
    const [estimate, chf] = await Promise.all([
      this.estimate(sats, currency),
      this.estimate(sats, "CHF").then(
        (read): ChfSide => ({ wired: read.destAmount, rate: read.rate }),
        (error: unknown) => {
          logFailure("Estimating a sale in CHF failed", error, false);
          return null;
        }
      )
    ]);
    return { estimate, chf };
  }

  /**
   * "See the quote": the order created, its rate locked 60 minutes; checked
   * against what was asked, Mt Pelerin's transfer fee taken (transfer-fee.ts), and its invoice
   * prepared by the wallet. Nothing is paid here. `terms`: the split's sale's (a deferred sell, its
   * checkpoint as its reference). A transfer fee that cannot be told fails the quote: never an
   * order shown with less taken than Mt Pelerin takes.
   */
  async quoteSale(
    sats: bigint,
    account: MtpBankAccount,
    terms: SaleTerms = {}
  ): Promise<SaleQuoteRead> {
    const asset = this.asset;
    if (asset === null) throw new Error("No asset to sell");
    const deferred = terms.deferred === true;
    // A sale wired at once in another currency: its francs, read before the order is made (the
    // threshold's "equivalent"). Its failure makes no order.
    const chfEstimate =
      deferred || account.currency === "CHF" ? null : await this.estimate(sats, "CHF");
    const body = newSellOrder({
      sats,
      account,
      asset,
      reference: SELL_REFERENCE,
      oid: terms.oid ?? this.newOid(),
      deferred
    });
    const order = await this.authed((mtp, token) => mtp.createSellOrder(token, body));
    const fee = transferFeeMinor({
      deferred,
      currency: account.currency,
      rate: order.rate,
      chf:
        chfEstimate !== null
          ? { wired: chfEstimate.destAmount, rate: chfEstimate.rate }
          : account.currency === "CHF"
            ? { wired: order.destAmount, rate: order.rate }
            : null
    });
    // An order not asked for is told as such even when its fee cannot be told (checked then with
    // none: one that wires nothing without a fee wires nothing with one); such a fee then fails the
    // quote.
    const checked = checkSellOrder(order, {
      sats,
      account,
      asset,
      network: this.deps.network,
      nowSeconds: Math.floor(this.now() / 1000),
      transferFeeMinor: fee ?? 0
    });
    if (!checked.ok) {
      logFailure(`Mt Pelerin's sell order was refused (${checked.issue})`);
      return checked;
    }
    if (fee === null) throw new Error("Mt Pelerin's transfer fee could not be told");
    const prepared = await this.deps.payer.quote(checked.invoice);
    const payment = { invoice: checked.invoice, ...prepared };
    if (!(await this.deps.payer.covers(payment))) return { ok: false, issue: "unaffordable" };
    return {
      ok: true,
      quote: {
        order,
        account,
        sats,
        payment,
        deferred,
        transferFeeMinor: fee,
        reference: body.reference,
        oid: body.oid
      }
    };
  }

  /**
   * "Sell": the order still locked and its invoice still payable, the passkey, the
   * sale's record on the account's relays (`recordSale`, once per invoice), then the payment.
   * "dismissed": the passkey's prompt closed, nothing left; "expired": a new quote is needed.
   * Rejects, nothing paid, when the record could not be written.
   */
  async paySale(quote: SaleQuote): Promise<"paid" | "dismissed" | "expired"> {
    const asset = this.asset;
    if (asset === null) throw new Error("No asset to sell");
    const stillLocked = () =>
      checkSellOrder(quote.order, {
        sats: quote.sats,
        account: quote.account,
        asset,
        network: this.deps.network,
        nowSeconds: Math.floor(this.now() / 1000),
        transferFeeMinor: quote.transferFeeMinor
      }).ok;
    if (!stillLocked()) return "expired";
    if (!(await this.deps.payer.confirm())) return "dismissed";
    // Checked again once the passkey answered: its prompt may have outlasted the rate's lock.
    if (!stillLocked()) return "expired";
    const { paymentHash } = quote.payment.invoice;
    if (!this.recorded.has(paymentHash)) {
      await this.deps.recordSale(
        mtpSaleRecordOf({
          order: quote.order,
          account: quote.account,
          sats: quote.sats,
          paymentHash,
          deferred: quote.deferred,
          transferFeeMinor: quote.transferFeeMinor,
          reference: quote.reference,
          oid: quote.oid,
          at: Math.floor(this.now() / 1000)
        })
      );
      this.recorded.add(paymentHash);
      // The relays may have taken their time: the rate's lock again, before anything leaves.
      if (!stillLocked()) return "expired";
    }
    await this.deps.payer.pay(quote.payment);
    return "paid";
  }

  /** The wallet's balance, read now. */
  balance(): Promise<bigint> {
    return this.deps.payer.balance();
  }

  /** What Mt Pelerin holds for `account` from its deferred sells, by currency. */
  balances(account: MtpBankAccount): Promise<MtpBalances> {
    return this.authed((mtp, token) => mtp.balances(token, account.id));
  }

  /**
   * A sale's progress, asked with the profile's `scope_id` (api.ts: production needs it). The
   * profile known (a sale's pages show once it is, SellSheet), else read for this call only: kept
   * by `advance` alone, never an answer that could come after the session was lost.
   */
  async transactionStatus(orderId: string): Promise<MtpTransactionStatus> {
    const person = this.person ?? (await this.authed((mtp, token) => mtp.findPerson(token)));
    // No profile at Mt Pelerin: no order of it either.
    if (person === null) throw new MtPelerinError("notFound");
    const { scopeId } = person;
    return this.authed((mtp, token) => mtp.transactionStatus(token, orderId, scopeId));
  }

  /**
   * Every order of the profile since `fromMs`, newest first, as Mt Pelerin lists them; null
   * when there are more than MAX_ORDER_PAGES pages (never a part shown as all). `toMs`: those made
   * before it only (the split's last sale is looked for a period at a time, split-offer.ts, which
   * tells itself which of the split's orders sold anything).
   */
  async allOrders(fromMs: number, toMs?: number): Promise<MtpOrder[] | null> {
    const { fromDate, toDate } = this.orderDays(fromMs, toMs);
    const fromSeconds = Math.floor(fromMs / 1000);
    const toSeconds = toMs === undefined ? Infinity : Math.floor(toMs / 1000);
    const orders: MtpOrder[] = [];
    for (let page = 0; page < MAX_ORDER_PAGES; page++) {
      const { orders: read } = await this.authed((mtp, token) =>
        mtp.listOrders(token, { fromDate, toDate, skip: page * ORDERS_PAGE_SIZE })
      );
      orders.push(...read);
      if (read.length < ORDERS_PAGE_SIZE) {
        // One order on two pages (a new one meanwhile): once.
        const unique = [...new Map(orders.map((order) => [order.id, order])).values()];
        return unique
          .filter((order) => order.createdAt >= fromSeconds && order.createdAt < toSeconds)
          .sort((a, b) => b.createdAt - a.createdAt);
      }
    }
    return null;
  }

  /**
   * The profile's sales since `fromMs` (what the limits count, limits.ts `limitsFrom`), newest first:
   * allOrders without the split's orders that sold nothing (withoutUnsoldSplits); null when there
   * are too many to list.
   */
  async orders(fromMs: number, toMs?: number): Promise<MtpOrder[] | null> {
    const orders = await this.allOrders(fromMs, toMs);
    return orders === null ? null : this.withoutUnsoldSplits(orders);
  }

  /**
   * `orders` without the split's sales that sold nothing: the split's panel makes its order as it
   * opens (SplitSale.tsx), and one never paid neither counts against a limit nor shows among the
   * sales. Such an order without funds at Mt Pelerin is kept only while the wallet paid or pays its
   * invoice, read from the wallet's payments since the earliest of them (SPLIT_CLOCK_GAP_SECONDS
   * earlier). One whose rate's lock ended more than SPLIT_UNFUNDED_GRACE_SECONDS ago sold nothing
   * (limits.ts counts it so too): the wallet is not read for it. The wallet not read, every other
   * order is kept as Mt Pelerin lists it: a sale is never hidden on a guess.
   */
  private async withoutUnsoldSplits(orders: MtpOrder[]): Promise<MtpOrder[]> {
    const lapsedAt = Math.floor(this.now() / 1000) - SPLIT_UNFUNDED_GRACE_SECONDS;
    const lapsed = (order: MtpOrder) =>
      unfundedSplitOrder(order) && order.expiresAt !== null && order.expiresAt < lapsedAt;
    const asked = orders.filter((order) => unfundedSplitOrder(order) && !lapsed(order));
    let sold: ReadonlyMap<string, SalePayment> = new Map<string, SalePayment>();
    if (asked.length > 0) {
      const since = Math.min(...asked.map((order) => order.createdAt)) - SPLIT_CLOCK_GAP_SECONDS;
      try {
        sold = await this.deps.payer.paidSince(since);
      } catch (error) {
        logFailure("Reading the wallet's payments of the split's sales failed", error, false);
        return orders.filter((order) => !lapsed(order));
      }
    }
    return orders.filter(
      (order) =>
        !unfundedSplitOrder(order) ||
        (!lapsed(order) && order.paymentHash !== null && sold.has(order.paymentHash))
    );
  }

  /**
   * The wallet's payments of the invoices of `orders` Mt Pelerin tells no funds of yet (sale.ts
   * awaitsFunds), by payment hash: what their sales are told from while Mt Pelerin tells nothing
   * (saleProgress, orderOutcome). Read from the earliest of them (SPLIT_CLOCK_GAP_SECONDS earlier);
   * not for one whose rate's lock ended more than SPLIT_UNFUNDED_GRACE_SECONDS ago, which sold
   * nothing as limits.ts counts it. None asked: the wallet is not read.
   */
  async walletPayments(orders: readonly MtpOrder[]): Promise<ReadonlyMap<string, SalePayment>> {
    const lapsedAt = Math.floor(this.now() / 1000) - SPLIT_UNFUNDED_GRACE_SECONDS;
    const asked = orders.filter(
      (order): order is MtpOrder & { paymentHash: string } =>
        order.paymentHash !== null &&
        awaitsFunds(order) &&
        (order.expiresAt === null || order.expiresAt >= lapsedAt)
    );
    const found = new Map<string, SalePayment>();
    if (asked.length === 0) return found;
    const since = Math.min(...asked.map((order) => order.createdAt)) - SPLIT_CLOCK_GAP_SECONDS;
    const sent = await this.deps.payer.paidSince(since);
    for (const { paymentHash } of asked) {
      const payment = sent.get(paymentHash);
      if (payment !== undefined) found.set(paymentHash, payment);
    }
    return found;
  }

  /**
   * The orders' `orderId` filter: the order `orderId`, created since `fromMs`, in one call rather
   * than
   * every order of the period; null while Mt Pelerin does not list it (a sale just paid may not be
   * listed yet).
   */
  async order(orderId: string, fromMs: number): Promise<MtpOrder | null> {
    const { fromDate, toDate } = this.orderDays(fromMs);
    const { orders } = await this.authed((mtp, token) =>
      mtp.listOrders(token, { fromDate, toDate, skip: 0, orderId })
    );
    // That order only, whatever else the answer holds.
    return orders.find((order) => order.id === orderId) ?? null;
  }

  /**
   * The orders' days from `fromMs` to `toMs` (now by default). It reads them at midnight in Zurich
   * (`tz`'s default: 2026-01-01 is 2025-12-31T23:00:00Z), the device may be
   * elsewhere: a day more on each side, then the orders of the period only. `toDate` defaults to
   * `fromDate` + 7 days: always given.
   */
  private orderDays(fromMs: number, toMs?: number): { fromDate: string; toDate: string } {
    const day = 24 * 60 * 60_000;
    return { fromDate: isoDay(fromMs - day), toDate: isoDay((toMs ?? this.now()) + 2 * day) };
  }

  /** How this build logs in to Mt Pelerin: by SMS, or the account's key (dev/test). */
  loginKind(): "sms" | "key" {
    return this.deps.walletLogin ? "key" : "sms";
  }

  /** What "Sell" knows of the merchant at Mt Pelerin, once ready. */
  profile(): { person: MtpPerson; lightning: MtpLightningAccount | null } | null {
    return this.person ? { person: this.person, lightning: this.lightning } : null;
  }

  /**
   * "Log out of Mt Pelerin": the account's session forgotten on all its devices, nothing
   * at Mt Pelerin (its API has no way to end a session).
   */
  logout(): Promise<void> {
    return this.run(
      "loggingOut",
      async () => {
        await this.requireSession().logout();
        this.person = null;
        this.lightning = null;
        this.banks = null;
        this.unreadableBanks = [];
        this.device = null;
        this.loginPhone = null;
        this.set({ view: this.loginView(), sessionLost: false });
      },
      () => void this.logout()
    );
  }
}
