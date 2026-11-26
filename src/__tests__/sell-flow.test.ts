import { walletSecret } from "@/lib/breez/seed";
import { readLog } from "@/lib/log/log";
import type { BankAccountInput } from "@/lib/mtpelerin/accounts";
import {
  MTPELERIN_WID,
  SPLIT_UNFUNDED_GRACE_SECONDS,
  VALIDATION_SYNC_WINDOW_MS
} from "@/config/mtpelerin";
import { createMtPelerinApi, type MtpTransport } from "@/lib/mtpelerin/api";
import { countsAgainstLimits, periodStarts } from "@/lib/mtpelerin/limits";
import { orderOutcome, saleProgress, type SalePayment } from "@/lib/mtpelerin/sale";
import { SPLIT_CLOCK_GAP_SECONDS, splitOid } from "@/lib/mtpelerin/split";
import { testLoginSigner } from "@/lib/mtpelerin/evm-login";
import { MtpSessionLostError } from "@/lib/mtpelerin/session";
import type { MtpSessionState } from "@/lib/mtpelerin/session-format";
import type { MtpSessionStore } from "@/lib/mtpelerin/session-sync";
import type { MtpSaleRecord } from "@/lib/mtpelerin/sale-record";
import type { MtpBankAccount } from "@/lib/mtpelerin/types";
import { deriveTeamKeys } from "@/lib/team/keys";
import {
  SellFlow,
  isEmail,
  mtpLanguage,
  normalizeCode,
  normalizePhone,
  setupStep,
  type SaleQuote,
  type SellDeps,
  type SellPayer,
  type SellState
} from "@/features/sell/flow";

import { testSeed } from "../../jest/account";
import { SCENARIO_IBAN, scenarioServer, type Scenario } from "../../jest/mtpelerin-fake/scenarios";
import { FakeMtPelerin, ORDER_LOCK_MS, fakeIban } from "../../jest/mtpelerin-fake/server";

/*
 * "Sell"'s steps and sales (src/features/sell/flow.ts) against the fake Mt Pelerin of the tests
 * (jest/mtpelerin-fake/), in each state its scenarios set up: the login (SMS, or the account's key
 * on dev/test), the profile, the Lightning address proven by its 1-sat invoice, the bank account,
 * then a sale quoted, paid and followed. The wallet is a payer that pays the fake's invoices only.
 */

const ADDRESS = "merchant@breez.tips";
const PHONE = "+41791234567";

/** The account's session, in memory (session-sync.ts's API). */
function memorySessions(initial: Partial<MtpSessionState> = {}) {
  let state: MtpSessionState = {
    refreshToken: null,
    sessionAt: 0,
    paidValidations: [],
    ...initial
  };
  const store: MtpSessionStore = {
    load: async () => state,
    keep: async (refreshToken) => {
      state = { ...state, refreshToken, sessionAt: Date.now() };
    },
    refused: async () => {
      state = { ...state, refreshToken: null };
      return null;
    },
    recordPaid: async (paid) => {
      state = { ...state, paidValidations: [...state.paidValidations, paid] };
    },
    settled: async () => undefined
  };
  return { store, state: () => state };
}

/** The merchant's wallet: `balance` sats, `feeSats` a payment, the passkey `confirmed`. */
function testPayer(server: FakeMtPelerin, balance = 100_000n) {
  const paid: string[] = [];
  const paidHashes = new Map<string, SalePayment>();
  const payer = {
    feeSats: 2n,
    balance,
    confirmed: true,
    failing: false
  };
  const sellPayer: SellPayer = {
    quote: async (invoice) => ({ amountSats: invoice.amountSats, feeSats: payer.feeSats }),
    covers: async (quote) => payer.balance >= quote.amountSats + quote.feeSats,
    balance: async () => payer.balance,
    paidSince: async () => paidHashes,
    confirm: async () => payer.confirmed,
    pay: async (quote) => {
      if (payer.failing || !server.payInvoice(quote.invoice.pr)) throw new Error("Payment failed");
      payer.balance -= quote.amountSats + quote.feeSats;
      paid.push(quote.invoice.pr);
      paidHashes.set(quote.invoice.paymentHash, "completed");
    }
  };
  return { payer, sellPayer, paid };
}

function setUp(
  server: FakeMtPelerin,
  {
    sessions = memorySessions(),
    walletLogin = null,
    referralCode = "cN9Kr3vP",
    balance,
    transport = (request) => server.handle(request)
  }: {
    sessions?: ReturnType<typeof memorySessions>;
    walletLogin?: SellDeps["walletLogin"];
    referralCode?: string;
    balance?: bigint;
    /** Mt Pelerin as the flow reaches it: the fake's, as it is by default. */
    transport?: MtpTransport;
  } = {}
) {
  const wallet = testPayer(server, balance);
  /** The sales' records, as the relays took them; `refusing`: no majority takes one. */
  const records = { taken: [] as MtpSaleRecord[], refusing: false };
  const flow = new SellFlow({
    api: createMtPelerinApi(transport),
    sessions: sessions.store,
    lightningAddress: ADDRESS,
    appVersion: "3.0.0",
    language: "fr",
    network: "bc",
    payer: wallet.sellPayer,
    recordSale: async (sale) => {
      if (records.refusing) throw new Error("No majority took the record");
      records.taken.push(sale);
    },
    referralCode,
    walletLogin,
    nowMs: () => server.now(),
    newCode: () => "4821",
    newOid: () => "6f1d2c3b-4a59-4e68-9d7c-8b6a5f4e3d2c"
  });
  return { flow, sessions, wallet, records };
}

/** Logs in by SMS from the phone step. */
async function smsLogin(flow: SellFlow, server: FakeMtPelerin): Promise<void> {
  await flow.start();
  expect(flow.getState().view).toEqual({ name: "phone" });
  await flow.submitPhone("079 123 45 67");
  await flow.submitCode(server.smsCode);
}

/** A flow of `scenario` logged in, its steps read. */
async function loggedIn(scenario: Scenario, options: Parameters<typeof setUp>[1] = {}) {
  const server = scenarioServer(scenario, ADDRESS);
  const setup = setUp(server, options);
  await smsLogin(setup.flow, server);
  return { server, ...setup };
}

const view = (flow: SellFlow): SellState["view"] => flow.getState().view;

/** Until the flow runs nothing (a retry started without its promise). */
async function waitForIdle(flow: SellFlow): Promise<void> {
  for (let tries = 0; tries < 100 && flow.getState().busy !== null; tries += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  expect(flow.getState().busy).toBeNull();
}

const COMPANY: BankAccountInput = {
  holder: { kind: "company", name: "Example Studio" },
  iban: SCENARIO_IBAN,
  street: "1 Example Street",
  postcode: "1000",
  city: "Lausanne",
  country: "CH",
  currency: "CHF"
};

beforeEach(() => {
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("what the merchant types", () => {
  it("reads a phone number as E.164, a code of 6 digits, an e-mail roughly", () => {
    expect(normalizePhone("079 123 45 67")).toBe(PHONE);
    expect(normalizePhone("79 123 45 67")).toBe(PHONE);
    expect(normalizePhone("0041 79 123 45 67")).toBe(PHONE);
    expect(normalizePhone("+41 (79) 123-45-67")).toBe(PHONE);
    expect(normalizePhone("06 12 34 56 78", "+33")).toBe("+33612345678");
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone("12")).toBeNull();
    expect(normalizePhone("+41 79 abc")).toBeNull();
    expect(normalizeCode(" 123 456 ")).toBe("123456");
    expect(normalizeCode("12345")).toBeNull();
    expect(isEmail(" alice@example.com ")).toBe(true);
    expect(isEmail("alice@example")).toBe(false);
    expect(isEmail("alice example.com")).toBe(false);
    expect(mtpLanguage("fr-CH")).toBe("fr");
    // Mt Pelerin writes no Finnish: English.
    expect(mtpLanguage("fi")).toBe("en");
  });

  it("numbers the three steps of the header", () => {
    expect(setupStep({ name: "phone" })).toBe(0);
    expect(setupStep({ name: "profile", person: null, askPhone: false })).toBe(0);
    expect(setupStep({ name: "bank" })).toBe(2);
    expect(setupStep({ name: "unavailable" })).toBeNull();
    expect(setupStep({ name: "starting" })).toBeNull();
  });
});

describe("the steps before a first sale", () => {
  it("goes through every step with a new customer: login, profile, 1 sat, bank account", async () => {
    const server = scenarioServer("newCustomer", ADDRESS);
    const { flow, sessions, wallet } = setUp(server);
    await smsLogin(flow, server);
    // No profile yet: its e-mail asked, the login's number used.
    expect(view(flow)).toEqual({ name: "profile", person: null, askPhone: false });
    expect(flow.profilePhone()).toBe(PHONE);
    expect(sessions.state().refreshToken).toMatch(/^fake\./);

    await flow.saveProfile({ email: "alice@example.com" });
    // The referral right before the profile, always a user's (no KYB).
    expect(server.postedReferrals()).toEqual([
      expect.objectContaining({ type: "phone", identifier: PHONE, code: "cN9Kr3vP" })
    ]);
    expect(server.person()).toMatchObject({
      type: "user",
      email: "alice@example.com",
      phone: PHONE,
      language: "fr"
    });
    // The address made the merchant's own account, its 1-sat invoice prepared.
    expect(server.accountsOfUser()).toEqual([
      expect.objectContaining({
        type: "lightning",
        crypto_address: ADDRESS,
        verification_code: "4821",
        user_is_owner: true,
        status: "pending_validation"
      })
    ]);
    const validation = view(flow);
    expect(validation).toMatchObject({
      name: "validation",
      quote: { amountSats: 1n, feeSats: 2n, invoice: { amountSats: 1n } }
    });
    expect(setupStep(validation)).toBe(1);

    await flow.payValidation();
    expect(wallet.paid).toHaveLength(1);
    expect(view(flow)).toMatchObject({ name: "validationPending", hasBank: false });
    // Noted for the account's other devices.
    const accountId = server.accountsOfUser()[0]!.id;
    expect(sessions.state().paidValidations).toEqual([{ accountId, paidAt: expect.any(Number) }]);

    // Still pending: the bank account meanwhile.
    flow.toBank();
    expect(view(flow)).toEqual({ name: "bank" });
    expect(await flow.addBankAccount(COMPANY)).toBe(true);
    expect(server.accountsOfUser()[1]).toMatchObject({
      type: "external",
      iban: SCENARIO_IBAN,
      owner_companyname: "Example Studio",
      user_is_owner: true
    });
    // The bank account added, the address still pending.
    expect(view(flow)).toMatchObject({ name: "validationPending", hasBank: true });

    // Mt Pelerin's sync: the address proven, said once.
    server.syncPayments();
    await flow.refresh({ quiet: true });
    expect(view(flow)).toMatchObject({ name: "verified", hasBank: true });
    flow.toBank();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await flow.refresh();
    const ready = view(flow);
    expect(ready).toMatchObject({
      name: "ready",
      ready: {
        asset: { network: "lightning_mainnet", currency: "sat" },
        lightning: { cryptoAddress: ADDRESS, status: "active" },
        // Pending at Mt Pelerin, as every new account: a sale may go to it.
        accounts: [{ iban: SCENARIO_IBAN, status: "pending_validation" }]
      }
    });
    expect(flow.getState().failure).toBeNull();
  });

  it("asks the number too on dev/test, where the account's key logs in", async () => {
    const server = new FakeMtPelerin();
    const signer = testLoginSigner(deriveTeamKeys(walletSecret(testSeed())));
    const { flow } = setUp(server, { walletLogin: signer });
    await flow.start();
    expect(view(flow)).toEqual({ name: "connect" });
    expect(flow.loginKind()).toBe("key");
    await flow.connect();
    expect(view(flow)).toEqual({ name: "profile", person: null, askPhone: true });
    expect(flow.profilePhone()).toBeNull();
    // Without a valid number, nothing is sent.
    await flow.saveProfile({ email: "alice@example.com", phone: "12" });
    expect(server.person()).toBeNull();
    await flow.saveProfile({ email: "alice@example.com", phone: "079 123 45 67" });
    expect(server.person()).toMatchObject({ email: "alice@example.com", phone: PHONE });
    expect(view(flow).name).toBe("validation");
  });

  it("completes a profile that exists without its e-mail, and takes one complete as it is", async () => {
    const server = new FakeMtPelerin();
    server.onNewPhone = (phone) => server.seedProfile(phone, { email: null });
    const { flow } = setUp(server, { referralCode: "" });
    await smsLogin(flow, server);
    expect(view(flow)).toMatchObject({ name: "profile", person: { email: null, phone: PHONE } });
    await flow.saveProfile({ email: "alice@example.com" });
    const paths = server.requests.map(({ method, path }) => `${method} ${path}`);
    expect(paths).toContain(`PATCH /persons/${server.person()!.id as string}`);
    expect(paths).not.toContain("PUT /persons");
    // No new profile: no referral.
    expect(server.postedReferrals()).toEqual([]);
    expect(view(flow).name).toBe("validation");

    // A complete profile: straight to its next step.
    const existing = await loggedIn("existingProfile");
    expect(view(existing.flow).name).toBe("validation");
  });

  it("reads a profile made meanwhile (409 of `PUT /persons`) and completes it", async () => {
    const server = new FakeMtPelerin();
    const { flow } = setUp(server);
    await smsLogin(flow, server);
    expect(view(flow)).toMatchObject({ name: "profile", person: null });
    // Another device of the account made it since.
    server.failNext("PUT /persons", 409, {
      error: { message: "A person with this scope_id already exists" }
    });
    server.seedProfile(PHONE, { email: null });
    await flow.saveProfile({ email: "alice@example.com" });
    expect(server.person()).toMatchObject({ email: "alice@example.com" });
    expect(view(flow).name).toBe("validation");
  });

  it("says a wrong or late SMS code, and sends a new one", async () => {
    const server = new FakeMtPelerin();
    const { flow } = setUp(server);
    await flow.start();
    await flow.submitPhone("079 123 45 67");
    expect(view(flow)).toEqual({ name: "code", phone: PHONE });
    await flow.submitCode("000000");
    expect(flow.getState().failure).toEqual({ kind: "codeRefused", retry: null });
    // Past 15 minutes.
    const start = Date.now();
    server.now = () => start + 16 * 60_000;
    await flow.submitCode(server.smsCode);
    expect(flow.getState().failure).toEqual({ kind: "codeExpired", retry: null });
    await flow.resendCode();
    expect(flow.getState().failure).toBeNull();
    await flow.submitCode(server.smsCode);
    expect(view(flow)).toMatchObject({ name: "profile" });
    // Back from the code to the number.
    const other = setUp(new FakeMtPelerin()).flow;
    await other.start();
    await other.submitPhone("079 123 45 67");
    expect(other.back()).toBe(true);
    expect(view(other)).toEqual({ name: "phone" });
    expect(other.back()).toBe(false);
  });

  it("says when the address is another profile's, or when no sale is offered", async () => {
    const taken = await loggedIn("addressTaken");
    expect(view(taken.flow)).toEqual({ name: "addressTaken" });
    expect(taken.wallet.paid).toEqual([]);
    const unavailable = await loggedIn("lightningNotOffered");
    expect(view(unavailable.flow)).toEqual({ name: "unavailable" });
  });

  it("never offers to pay 1 sat it cannot cover, nor an invoice that is not the one expected", async () => {
    const poor = await loggedIn("existingProfile", { balance: 2n });
    expect(view(poor.flow)).toMatchObject({ name: "unaffordable" });

    for (const tamper of ["otherNetwork", "otherAmount", "expired"] as const) {
      const server = scenarioServer("existingProfile", ADDRESS);
      server.tamperInvoice = tamper;
      const { flow, wallet } = setUp(server);
      await smsLogin(flow, server);
      expect(flow.getState()).toMatchObject({
        view: { name: "unread" },
        failure: { kind: tamper }
      });
      expect(wallet.paid).toEqual([]);
      // Mt Pelerin's next invoice is the right one.
      server.tamperInvoice = null;
      flow.getState().failure?.retry?.();
      await new Promise((resolve) => setTimeout(resolve, 0));
      await flow.refresh();
      expect(view(flow).name).toBe("validation");
    }
  });

  it("pays nothing when the passkey is dismissed, and says a payment that failed", async () => {
    const { flow, wallet } = await loggedIn("existingProfile");
    wallet.payer.confirmed = false;
    await flow.payValidation();
    expect(view(flow).name).toBe("validation");
    expect(wallet.paid).toEqual([]);
    wallet.payer.confirmed = true;
    wallet.payer.failing = true;
    await flow.payValidation();
    expect(flow.getState()).toMatchObject({
      view: { name: "validation" },
      failure: { kind: "payment" }
    });
  });

  it("waits for Mt Pelerin's sync on the account's other devices, never asks to pay again", async () => {
    const first = await loggedIn("existingProfile");
    await first.flow.payValidation();
    expect(view(first.flow).name).toBe("validationPending");
    // Another visit with the account's session: still waiting, no new invoice.
    const again = setUp(first.server, { sessions: first.sessions });
    await again.flow.start();
    expect(view(again.flow)).toMatchObject({ name: "validationPending", hasBank: false });
    const invoices = first.server.requests.filter(({ path }) => path === "/ethereum/ln/pr");
    expect(invoices).toHaveLength(1);
  });

  it("asks for a new 1-sat invoice once Mt Pelerin's sync window passed without it", async () => {
    const first = await loggedIn("existingProfile");
    await first.flow.payValidation();
    expect(view(first.flow).name).toBe("validationPending");
    // Over the last 5 days of payments: never matched now, paid again.
    const start = first.server.now();
    first.server.now = () => start + VALIDATION_SYNC_WINDOW_MS + 60_000;
    const again = setUp(first.server, { sessions: first.sessions });
    await again.flow.start();
    expect(view(again.flow).name).toBe("validation");
    const invoices = first.server.requests.filter(({ path }) => path === "/ethereum/ln/pr");
    expect(invoices).toHaveLength(2);
  });

  it("stays on the bank account step when the pending view's reading ends after it", async () => {
    const { flow } = await loggedIn("existingProfile");
    await flow.payValidation();
    expect(view(flow)).toMatchObject({ name: "validationPending", hasBank: false });
    // The pending view's polling, under way when the merchant goes on to the bank account.
    const polling = flow.refresh({ quiet: true });
    flow.toBank();
    await polling;
    expect(flow.getState()).toMatchObject({ view: { name: "bank" }, busy: null });
  });

  it("keeps what it read when reading it again fails", async () => {
    const { flow, server } = await loggedIn("ready");
    const banks = flow.bankAccounts();
    expect(banks).toHaveLength(1);
    server.offline = true;
    await flow.refresh();
    expect(flow.getState()).toMatchObject({
      view: { name: "ready" },
      failure: { kind: "offline" }
    });
    // Not read again is not "none": the accounts and the address as last read.
    expect(flow.bankAccounts()).toEqual(banks);
    expect(flow.profile()?.lightning).toMatchObject({ cryptoAddress: ADDRESS, status: "active" });
  });

  it("takes no other address's Lightning account for the merchant's", async () => {
    // The profile proved another address; its `where` filter not applied by Mt Pelerin.
    const server = scenarioServer("ready", "other@breez.tips");
    const transport: MtpTransport = (request) =>
      server.handle(request.path === "/accounts" ? { ...request, query: undefined } : request);
    const { flow } = setUp(server, { transport });
    await smsLogin(flow, server);
    expect(view(flow)).toMatchObject({
      name: "validation",
      account: { cryptoAddress: ADDRESS, status: "pending_validation" }
    });
  });

  it("asks for a bank account once the address is proven, and refuses another's IBAN", async () => {
    const { flow, server } = await loggedIn("noBank");
    expect(view(flow)).toEqual({ name: "bank" });
    expect(flow.bankAccounts()).toEqual([]);
    // Nothing sent while a field is missing.
    expect(await flow.addBankAccount({ ...COMPANY, city: " " })).toBe(false);
    expect(server.accountsOfUser()).toHaveLength(1);
    // Another profile's IBAN: "Duplicate account".
    const iban = fakeIban(4242);
    server.seedOtherProfileAccount({ type: "external", iban, currency: "CHF", status: "active" });
    expect(await flow.addBankAccount({ ...COMPANY, iban })).toBe(false);
    expect(flow.getState().failure).toEqual({ kind: "ibanTaken", retry: null });
    flow.dismissFailure();
    expect(await flow.addBankAccount(COMPANY)).toBe(true);
    expect(view(flow).name).toBe("ready");
  });

  it('tells offline from "no", and tries again', async () => {
    const { flow, server, sessions } = await loggedIn("ready");
    expect(view(flow).name).toBe("ready");
    const next = setUp(server, { sessions });
    server.offline = true;
    await next.flow.start();
    expect(next.flow.getState()).toMatchObject({
      view: { name: "unread" },
      failure: { kind: "offline" }
    });
    server.offline = false;
    await next.flow.refresh();
    expect(next.flow.getState()).toMatchObject({ view: { name: "ready" }, failure: null });
  });

  it("leads back to the login once the session is lost, and logs out", async () => {
    const { flow, server, sessions } = await loggedIn("ready");
    server.revokeSessions();
    await flow.refresh();
    expect(flow.getState()).toMatchObject({ view: { name: "phone" }, sessionLost: true });
    // Its refused token dropped: no device offers it again.
    expect(sessions.state().refreshToken).toBeNull();

    const again = await loggedIn("ready");
    expect(again.flow.profile()).toMatchObject({ person: { phone: expect.any(String) } });
    await again.flow.logout();
    expect(again.flow.getState()).toMatchObject({ view: { name: "phone" }, sessionLost: false });
    expect(again.sessions.state().refreshToken).toBeNull();
    expect(again.flow.profile()).toBeNull();
  });

  /** The journal's entries of "Sell": their event, the error's code, its call and field. */
  function journal() {
    return readLog().entries.map(({ event, error }) => ({
      event,
      code: error?.code ?? null,
      call: error?.cause?.code ?? null,
      field: error?.cause?.cause?.code ?? null
    }));
  }

  /** A bank account of the merchant's that Mt Pelerin wrote without its holder's name. */
  const NAMELESS = {
    type: "external",
    status: "active",
    iban: fakeIban(5150),
    currency: "CHF",
    owner_country: "CH",
    user_is_owner: true
  };

  it("offers the bank accounts it can read, and says how many others it cannot", async () => {
    const { flow, server } = await loggedIn("ready");
    server.seedAccount(PHONE, NAMELESS);
    server.seedAccount(PHONE, { ...NAMELESS, iban: fakeIban(5151), currency: "chf" });
    await flow.refresh();
    expect(flow.getState()).toMatchObject({ view: { name: "ready" }, failure: null });
    // The one it reads, offered; the others never, not even partly.
    expect(flow.bankAccounts()?.map(({ iban }) => iban)).toEqual([SCENARIO_IBAN]);
    expect(view(flow)).toMatchObject({ ready: { accounts: [{ iban: SCENARIO_IBAN }] } });
    expect(flow.unreadableBankCount()).toBe(2);
    // For support: each field not read, once, never a value.
    expect(journal()).toEqual([
      {
        event: "Mt Pelerin listed an account the app cannot read",
        code: "malformed",
        call: "listAccounts",
        field: "owner_firstname"
      },
      {
        event: "Mt Pelerin listed an account the app cannot read",
        code: "malformed",
        call: "listAccounts",
        field: "currency"
      }
    ]);
    expect(JSON.stringify(readLog())).not.toContain(fakeIban(5150));
  });

  it("offers an account whose holder Mt Pelerin wrote as one name, without an address", async () => {
    const { flow, server } = await loggedIn("noBank");
    expect(view(flow)).toEqual({ name: "bank" });
    // As production lists accounts registered elsewhere.
    server.seedAccount(PHONE, { ...NAMELESS, owner_firstname: "EXAMPLE STUDIO LTD" });
    await flow.refresh();
    expect(view(flow)).toMatchObject({
      name: "ready",
      ready: { accounts: [{ iban: NAMELESS.iban, owner: { name: { kind: "unsaid" } } }] }
    });
    expect(flow.unreadableBankCount()).toBe(0);
    expect(journal()).toEqual([]);
  });

  it('never tells "no bank account" when the only ones it has cannot be read', async () => {
    const { server, sessions } = await loggedIn("ready");
    // The profile's only bank account, as Mt Pelerin would write it without its holder's name.
    const [, bank] = server.accountsOfUser();
    delete bank!.owner_companyname;
    const { flow } = setUp(server, { sessions });
    await flow.start();
    // Not the bank step, which would add an account that is there: the read fails, as before.
    expect(flow.getState()).toMatchObject({
      view: { name: "unread" },
      failure: { kind: "server", retry: expect.any(Function) }
    });
    expect(flow.bankAccounts()).toBeNull();
    expect(journal()).toEqual([
      {
        event: "Selling to the bank failed (starting)",
        code: "malformed",
        call: "listAccounts",
        field: "owner_firstname"
      }
    ]);
    // Its way out: the session forgotten, back to the login.
    await flow.logout();
    expect(flow.getState()).toMatchObject({ view: { name: "phone" }, failure: null });
    expect(sessions.state().refreshToken).toBeNull();
  });

  it("reads Mt Pelerin again, never the spent code, when its read after the login fails", async () => {
    const server = scenarioServer("noBank", ADDRESS);
    const seed = server.onNewPhone;
    server.onNewPhone = (phone) => {
      seed?.(phone);
      server.seedAccount(phone, NAMELESS);
    };
    const { flow } = setUp(server);
    await smsLogin(flow, server);
    // Logged in: the code's step is done, its failure is the read's.
    expect(flow.getState()).toMatchObject({
      view: { name: "unread" },
      failure: { kind: "server" }
    });
    const nameless = server.accountsOfUser().find(({ iban }) => iban === NAMELESS.iban);
    nameless!.owner_companyname = "Example Studio";
    const logins = server.requests.filter(({ path }) => path.endsWith("/authenticate")).length;
    flow.getState().failure!.retry!();
    await waitForIdle(flow);
    expect(flow.getState()).toMatchObject({ view: { name: "ready" }, failure: null });
    expect(server.requests.filter(({ path }) => path.endsWith("/authenticate"))).toHaveLength(
      logins
    );
  });

  it("never asks to prove an address whose account it cannot read", async () => {
    const { server, sessions } = await loggedIn("ready");
    const [lightning] = server.accountsOfUser();
    lightning!.status = null;
    const { flow } = setUp(server, { sessions });
    await flow.start();
    expect(flow.getState()).toMatchObject({
      view: { name: "unread" },
      failure: { kind: "server" }
    });
    // No 1-sat invoice asked, no account added again.
    expect(server.requests.some(({ path }) => path === "/ethereum/ln/pr")).toBe(false);
    expect(journal()).toMatchObject([{ call: "listAccounts", field: "status" }]);
  });

  it("never says another profile has an IBAN while one of its own accounts is unreadable", async () => {
    const { flow, server } = await loggedIn("ready");
    server.seedAccount(PHONE, NAMELESS);
    await flow.refresh();
    expect(flow.unreadableBankCount()).toBe(1);
    // "Duplicate account": the merchant's own unreadable account, maybe.
    const iban = fakeIban(4243);
    server.seedOtherProfileAccount({ type: "external", iban, currency: "CHF", status: "active" });
    expect(await flow.addBankAccount({ ...COMPANY, iban })).toBe(false);
    expect(flow.getState().failure).toMatchObject({ kind: "server" });
  });
});

describe("the bank accounts", () => {
  async function ready() {
    const setup = await loggedIn("ready");
    const state = view(setup.flow);
    if (state.name !== "ready") throw new Error(`Not ready: ${state.name}`);
    return { ...setup, account: state.ready.accounts[0]! };
  }

  const PERSON = {
    holder: { kind: "person" as const, firstname: " Alice ", lastname: "Example" },
    street: "Hauptstrasse 9",
    postcode: "8001",
    city: "Zürich",
    country: "CH"
  };

  it("never creates the same IBAN in the same currency twice, read at Mt Pelerin first", async () => {
    const { flow, server } = await ready();
    const created = () => server.requests.filter(({ method }) => method === "PUT").length;
    const before = created();
    // Mt Pelerin itself takes it again (dev/test): the app does not send it.
    expect(await flow.addBankAccount({ ...COMPANY, street: "2 New Street" })).toBe(false);
    expect(flow.getState().failure).toEqual({ kind: "accountKnown", retry: null });
    expect(created()).toBe(before);
    expect(server.accountsOfUser().filter(({ type }) => type === "external")).toHaveLength(1);
    // Its IBAN typed with spaces is the same IBAN.
    const spaced = COMPANY.iban.replace(/(.{4})/g, "$1 ").trim();
    expect(await flow.addBankAccount({ ...COMPANY, iban: spaced })).toBe(false);
    expect(created()).toBe(before);
    // In another currency it is another account (a multi-currency IBAN).
    expect(await flow.addBankAccount({ ...COMPANY, currency: "EUR" })).toBe(true);
    expect(flow.bankAccounts()?.map(({ currency }) => currency)).toEqual(["CHF", "EUR"]);
  });

  it("creates again an IBAN whose account Mt Pelerin rejected", async () => {
    const { flow, server } = await loggedIn("noBank");
    server.seedAccount(PHONE, {
      type: "external",
      iban: SCENARIO_IBAN,
      currency: "CHF",
      owner_companyname: "Example Studio",
      status: "rejected"
    });
    expect(await flow.addBankAccount(COMPANY)).toBe(true);
    expect(view(flow).name).toBe("ready");
  });

  it("changes an account's holder and address, never its IBAN nor its currency", async () => {
    const { flow, server, account } = await ready();
    expect(await flow.updateBankAccount(account, PERSON)).toBe(true);
    const patch = server.requests.find(({ method }) => method === "PATCH");
    expect(patch).toMatchObject({ path: `/accounts/${account.id}` });
    // The company's name cleared, the label the app gave (the holder's name) follows it.
    expect(patch?.body).toEqual({
      owner_firstname: "Alice",
      owner_lastname: "Example",
      owner_companyname: null,
      owner_street: "Hauptstrasse 9",
      owner_postcode: "8001",
      owner_city: "Zürich",
      owner_country: "CH",
      reference: "Alice Example"
    });
    // Read again from Mt Pelerin: the list and the sale's accounts say it.
    const read = flow.bankAccounts()?.[0];
    expect(read).toMatchObject({
      id: account.id,
      iban: account.iban,
      currency: "CHF",
      owner: { name: { kind: "person", firstname: "Alice", lastname: "Example" }, city: "Zürich" }
    });
    const state = view(flow);
    expect(state.name === "ready" && state.ready.accounts[0]?.owner.street).toBe("Hauptstrasse 9");
    expect(flow.getState().failure).toBeNull();
  });

  it("keeps a label the merchant gave elsewhere", async () => {
    const { flow, server } = await loggedIn("noBank");
    server.seedAccount(PHONE, {
      type: "external",
      reference: "Current account",
      iban: SCENARIO_IBAN,
      currency: "CHF",
      owner_firstname: "Alice",
      owner_lastname: "Example",
      owner_street: "1 Street",
      owner_postcode: "1000",
      owner_city: "Lausanne",
      owner_country: "CH",
      status: "active"
    });
    await flow.refresh();
    const account = flow.bankAccounts()![0]!;
    const company = { ...PERSON, holder: { kind: "company" as const, name: "Example Studio" } };
    expect(await flow.updateBankAccount(account, company)).toBe(true);
    const patch = server.requests.find(({ method }) => method === "PATCH");
    expect(patch?.body).toEqual({
      owner_firstname: null,
      owner_lastname: null,
      owner_companyname: "Example Studio",
      owner_street: "Hauptstrasse 9",
      owner_postcode: "8001",
      owner_city: "Zürich",
      owner_country: "CH"
    });
    expect(flow.bankAccounts()?.[0]).toMatchObject({
      label: "Current account",
      owner: { name: { kind: "company", name: "Example Studio" } }
    });
  });

  it("sends nothing while a field is missing or nothing changed", async () => {
    const { flow, server, account } = await ready();
    const same = {
      holder: { kind: "company" as const, name: "Example Studio" },
      street: "1 Example Street ",
      postcode: "1000",
      city: "Lausanne",
      country: "CH"
    };
    expect(await flow.updateBankAccount(account, same)).toBe(false);
    expect(await flow.updateBankAccount(account, { ...PERSON, city: " " })).toBe(false);
    expect(await flow.updateBankAccount(account, { ...PERSON, country: null })).toBe(false);
    expect(await flow.updateBankAccount(account, { ...PERSON, country: "ch" })).toBe(false);
    expect(server.requests.some(({ method }) => method === "PATCH")).toBe(false);
  });

  it("says Mt Pelerin's refusal without losing the session", async () => {
    const { flow, server, sessions, account } = await ready();
    // As dev/test refuses another profile's account: a 401 that is not the token's.
    server.failNext(`PATCH /accounts/${account.id}`, 401, {
      error: { statusCode: 401, message: "Authorization Required", code: "AUTHORIZATION_REQUIRED" }
    });
    expect(await flow.updateBankAccount(account, PERSON)).toBe(false);
    expect(flow.getState()).toMatchObject({
      view: { name: "ready" },
      failure: { kind: "accountUnchanged", retry: null },
      sessionLost: false
    });
    // Neither refreshed nor dropped: the same session goes on.
    expect(server.requests.filter(({ path }) => path === "/tokens/refresh")).toHaveLength(0);
    expect(sessions.state().refreshToken).not.toBeNull();
    expect(flow.bankAccounts()?.[0]?.owner.name).toEqual({
      kind: "company",
      name: "Example Studio"
    });
    server.failNext(`PATCH /accounts/${account.id}`, 422, { error: { message: "Locked" } });
    expect(await flow.updateBankAccount(account, PERSON)).toBe(false);
    expect(flow.getState().failure).toEqual({ kind: "accountUnchanged", retry: null });
  });

  it("never says changed an account Mt Pelerin kept as it was", async () => {
    const { flow, server, account } = await ready();
    // Mt Pelerin answers 200 with the account unchanged.
    const unchanged = server.accountsOfUser().find(({ id }) => id === account.id);
    server.failNext(`PATCH /accounts/${account.id}`, 200, unchanged);
    expect(await flow.updateBankAccount(account, PERSON)).toBe(false);
    expect(flow.getState().failure).toEqual({ kind: "accountUnchanged", retry: null });
    expect(flow.bankAccounts()?.[0]?.owner.street).toBe("1 Example Street");
  });

  it("tells offline from a refusal, and tries the same change again", async () => {
    const { flow, server, account } = await ready();
    server.offline = true;
    expect(await flow.updateBankAccount(account, PERSON)).toBe(false);
    const failure = flow.getState().failure;
    expect(failure).toMatchObject({ kind: "offline", retry: expect.any(Function) });
    server.offline = false;
    failure?.retry?.();
    await waitForIdle(flow);
    expect(flow.getState().failure).toBeNull();
    expect(flow.bankAccounts()?.[0]?.owner.city).toBe("Zürich");
  });

  it("refreshes an expired token for the change, as for any call", async () => {
    const { flow, server, account } = await ready();
    server.expireAccessTokens();
    expect(await flow.updateBankAccount(account, PERSON)).toBe(true);
    expect(flow.getState()).toMatchObject({ failure: null, sessionLost: false });
  });
});

describe("a sale", () => {
  async function ready(scenario: Scenario = "ready") {
    const setup = await loggedIn(scenario);
    const state = view(setup.flow);
    if (state.name !== "ready") throw new Error(`Not ready: ${state.name}`);
    return { ...setup, account: state.ready.accounts[0]! };
  }

  it("estimates, quotes, then pays exactly the sats agreed, once the passkey says so", async () => {
    const { flow, server, wallet, account } = await ready();
    const estimate = await flow.estimate(10_000n, "CHF");
    expect(estimate).toMatchObject({
      sourceCurrency: "sat",
      sourceAmount: { units: 10_000n, scale: 0 },
      destCurrency: "CHF",
      fees: { currency: "sat", total: { units: 130n, scale: 0 } }
    });
    const read = await flow.quoteSale(10_000n, account);
    if (!read.ok) throw new Error(read.issue);
    const { quote } = read;
    expect(quote.payment).toMatchObject({ amountSats: 10_000n, feeSats: 2n });
    // The order asked as the API takes it, with its reference.
    const body = server.requests.find(({ path }) => path === "/orders/create")?.body;
    expect(body).toMatchObject({
      beneficiary_id: account.id,
      currency_in: "sat",
      network_in: "lightning_mainnet",
      currency_out: "CHF",
      amount_in: 10_000,
      reference: expect.stringMatching(/^SATTLEME$/),
      oid: "6f1d2c3b-4a59-4e68-9d7c-8b6a5f4e3d2c",
      wid: MTPELERIN_WID
    });
    expect(wallet.paid).toEqual([]);

    await expect(flow.paySale(quote)).resolves.toBe("paid");
    expect(wallet.paid).toEqual([quote.payment.invoice.pr]);
    expect(wallet.payer.balance).toBe(100_000n - 10_002n);
    const progress = await flow.transactionStatus(quote.order.id);
    expect(progress).toMatchObject({ orderId: quote.order.id, inStatus: "finished" });
    // Asked with the profile's scope (production refuses the call without it).
    const asked = server.requests.filter(({ path }) => path === "/transactions/status");
    expect(asked.at(-1)?.query).toEqual({
      orderId: quote.order.id,
      scopeId: flow.profile()?.person.scopeId
    });
    server.advanceSale(quote.order.id, "sent");
    await expect(flow.transactionStatus(quote.order.id)).resolves.toMatchObject({
      currentStatus: "finished"
    });
  });

  it("never pays an order that is not the one asked for, nor one the wallet cannot cover", async () => {
    const { flow, server, wallet, account } = await ready();
    server.tamperOrder = true;
    await expect(flow.quoteSale(10_000n, account)).resolves.toEqual({
      ok: false,
      issue: "otherOrder"
    });
    server.tamperOrder = false;
    server.tamperInvoice = "otherAmount";
    await expect(flow.quoteSale(10_000n, account)).resolves.toEqual({
      ok: false,
      issue: "otherAmount"
    });
    server.tamperInvoice = null;
    await expect(flow.quoteSale(99_999n, account)).resolves.toEqual({
      ok: false,
      issue: "unaffordable"
    });
    expect(wallet.paid).toEqual([]);
  });

  it("sells the split's share as a deferred sell that carries its checkpoint", async () => {
    const { flow, server, wallet, account } = await ready();
    await expect(flow.balances(account)).resolves.toEqual([]);
    const read = await flow.quoteSale(10_000n, account, {
      oid: "sattle-split-1:1763168400",
      deferred: true
    });
    if (!read.ok) throw new Error(read.issue);
    expect(read.quote.deferred).toBe(true);
    const body = server.requests.find(({ path }) => path === "/orders/create")?.body;
    expect(body).toMatchObject({
      amount_in: 10_000,
      oid: "sattle-split-1:1763168400",
      withdraw: "manual",
      wid: MTPELERIN_WID
    });
    // Never paid, it sold nothing: not among the sales (nor in the limits).
    const year = Date.UTC(2026, 0, 1);
    await expect(flow.orders(year)).resolves.toEqual([]);
    // As Mt Pelerin lists it: with its reference and its invoice's payment hash, how its sale is
    // found again.
    const [listed] = (await flow.allOrders(year)) ?? [];
    expect(listed).toMatchObject({
      id: read.quote.order.id,
      type: "spot",
      oid: "sattle-split-1:1763168400",
      paymentHash: read.quote.payment.invoice.paymentHash,
      transactionStatus: null
    });
    // Not paid yet: nothing held for the bank account.
    await expect(flow.balances(account)).resolves.toEqual([]);
    await expect(flow.paySale(read.quote)).resolves.toBe("paid");
    expect(wallet.paid).toEqual([read.quote.payment.invoice.pr]);
    // Its francs wait at Mt Pelerin for the bank account's one transfer.
    await expect(flow.balances(account)).resolves.toEqual([
      { currency: "CHF", total: read.quote.order.destAmount }
    ]);
    // A sale of "Sell" keeps its own reference and is wired at once.
    const plain = await flow.quoteSale(5_000n, account);
    if (!plain.ok) throw new Error(plain.issue);
    expect(plain.quote.deferred).toBe(false);
    const bodies = server.requests.filter(({ path }) => path === "/orders/create");
    expect(bodies[1]?.body).not.toHaveProperty("withdraw");
    expect(bodies[1]?.body).toMatchObject({ oid: "6f1d2c3b-4a59-4e68-9d7c-8b6a5f4e3d2c" });
  });

  it.each([
    { kind: "of the split", oid: splitOid(1763168400) },
    { kind: 'of "Sell"', oid: undefined }
  ])(
    "follows a deferred sell $kind paid, which never has a transaction: received, listed, counted",
    async ({ oid }) => {
      const { flow, server, account } = await ready();
      const from = periodStarts(new Date(server.now())).year * 1000;
      const read = await flow.quoteSale(10_000n, account, { oid, deferred: true });
      if (!read.ok) throw new Error(read.issue);
      await expect(flow.paySale(read.quote)).resolves.toBe("paid");
      const { order } = read.quote;
      // Mt Pelerin's answer: the order alone, validated, as production answers it.
      await expect(flow.transactionStatus(order.id)).resolves.toMatchObject({
        orderType: "spot",
        orderStatus: "validated",
        groupId: null
      });
      // Read long after its rate's deadline: received, never "expired" nor hidden.
      const later = (order.expiresAt + SPLIT_UNFUNDED_GRACE_SECONDS + 60) * 1000;
      server.now = () => later;
      const nowSeconds = Math.floor(later / 1000);
      const status = await flow.transactionStatus(order.id);
      expect(saleProgress(status, { expiresAt: order.expiresAt, nowSeconds })).toEqual({
        outcome: "inProgress",
        received: "done",
        converted: "done",
        transferred: "todo"
      });
      const row = (await flow.orders(from))?.find(({ id }) => id === order.id);
      expect(row).toMatchObject({ type: "spot", status: "validated", transactionStatus: null });
      expect(orderOutcome(row!, nowSeconds)).toBe("inProgress");
      expect(countsAgainstLimits(row!, nowSeconds)).toBe(true);
      await expect(flow.balances(account)).resolves.toEqual([
        { currency: "CHF", total: order.destAmount }
      ]);
    }
  );

  it("takes Mt Pelerin's transfer fee of a sale wired at once below 50 CHF, none deferred", async () => {
    const { flow, server, account } = await ready();
    // 10,000 sats: 8.32 CHF wired at once, which its order leaves the fee out of.
    const now = await flow.quoteSale(10_000n, account);
    if (!now.ok) throw new Error(now.issue);
    expect(now.quote.order.destAmount).toEqual({ units: 832n, scale: 2 });
    expect(now.quote.transferFeeMinor).toBe(100);
    // Deferred: none, and no estimate asked for it.
    const before = server.requests.length;
    const later = await flow.quoteSale(10_000n, account, { deferred: true });
    if (!later.ok) throw new Error(later.issue);
    expect(later.quote.transferFeeMinor).toBe(0);
    expect(server.requests.slice(before).map(({ path }) => path)).not.toContain("/orders/estimate");
    // From 50 CHF on (70,000 sats: 58.25 CHF): none.
    const large = await flow.quoteSale(70_000n, account);
    if (!large.ok) throw new Error(large.issue);
    expect(large.quote.transferFeeMinor).toBe(0);
  });

  it("tells the fee of a sale in another currency from its francs, read before the order", async () => {
    const { flow, server, wallet } = await ready();
    expect(await flow.addBankAccount({ ...COMPANY, iban: fakeIban(8), currency: "USD" })).toBe(
      true
    );
    const state = view(flow);
    const usd = (state.name === "ready" ? state.ready.accounts : [])[1] as MtpBankAccount;
    expect(usd.currency).toBe("USD");
    const before = server.requests.length;
    const read = await flow.quoteSale(10_000n, usd);
    if (!read.ok) throw new Error(read.issue);
    // The fake prices every currency alike: the equivalent of 1 CHF is 1.00 USD.
    expect(read.quote.transferFeeMinor).toBe(100);
    const asked = server.requests.slice(before);
    const estimate = asked.findIndex(({ path }) => path === "/orders/estimate");
    expect(asked[estimate]?.body).toMatchObject({ dest_currency: "CHF", amount_in: "10000" });
    expect(estimate).toBeLessThan(asked.findIndex(({ path }) => path === "/orders/create"));

    // Its francs unread: no order made, rather than one shown without its fee.
    const orders = server.requests.filter(({ path }) => path === "/orders/create").length;
    server.failNext("POST /orders/estimate", 500);
    await expect(flow.quoteSale(10_000n, usd)).rejects.toBeInstanceOf(Error);
    expect(server.requests.filter(({ path }) => path === "/orders/create")).toHaveLength(orders);

    // Its francs read without a price of 1 sat: the equivalent of 1 CHF in dollars cannot be told,
    // and no quote is shown; an order not asked for is told as such all the same.
    const priceless = {
      type: "sell",
      sourceCurrency: "sat",
      sourceNetwork: "lightning_mainnet",
      destCurrency: "CHF",
      destNetwork: "fiat",
      sourceAmount: "10000",
      destAmount: "8.32",
      fees: { total: "130", currency: "sat", side: "in", rate: 0.013 }
    };
    const toChf = ({ body }: { body?: unknown }) =>
      (body as { dest_currency?: string }).dest_currency === "CHF";
    server.failNext("POST /orders/estimate", 200, priceless, toChf);
    await expect(flow.quoteSale(10_000n, usd)).rejects.toThrow(/transfer fee could not be told/);
    server.tamperOrder = true;
    server.failNext("POST /orders/estimate", 200, priceless, toChf);
    await expect(flow.quoteSale(10_000n, usd)).resolves.toEqual({
      ok: false,
      issue: "otherOrder"
    });
    server.tamperOrder = false;
    expect(wallet.paid).toEqual([]);

    // The estimate of "Sell": the sale's, and its francs alongside; without them, the sale's.
    const estimated = await flow.estimateSale(10_000n, "USD");
    expect(estimated.estimate.destCurrency).toBe("USD");
    expect(estimated.chf).toEqual({
      wired: { units: 832n, scale: 2 },
      rate: estimated.estimate.rate
    });
    server.failNext(
      "POST /orders/estimate",
      500,
      undefined,
      ({ body }) => (body as { dest_currency?: string }).dest_currency === "CHF"
    );
    const alone = await flow.estimateSale(10_000n, "USD");
    expect(alone.estimate.destCurrency).toBe("USD");
    expect(alone.chf).toBeNull();
    // In CHF, the sale itself: one estimate.
    const estimates = () =>
      server.requests.filter(({ path }) => path === "/orders/estimate").length;
    const count = estimates();
    const inChf = await flow.estimateSale(10_000n, "CHF");
    expect(inChf.chf).toEqual({ wired: inChf.estimate.destAmount, rate: inChf.estimate.rate });
    expect(estimates()).toBe(count + 1);
  });

  it("never pays a sale that would wire nothing", async () => {
    const { flow, server, wallet, account } = await ready();
    // 5 sats, 1 of fees: 0.00 CHF at the fake's rate. Mt Pelerin makes the order all the same.
    await expect(flow.quoteSale(5n, account)).resolves.toEqual({
      ok: false,
      issue: "nothingWired"
    });
    expect(server.requests.filter(({ path }) => path === "/orders/create")).toHaveLength(1);
    // 1,200 sats: 0.99 CHF wired at once, which Mt Pelerin's transfer fee takes whole; deferred,
    // without that fee, it is sold.
    await expect(flow.quoteSale(1_200n, account)).resolves.toEqual({
      ok: false,
      issue: "nothingWired"
    });
    await expect(flow.quoteSale(1_200n, account, { deferred: true })).resolves.toMatchObject({
      ok: true
    });
    expect(wallet.paid).toEqual([]);
  });

  it("pays nothing once the passkey is dismissed or the rate no longer locked", async () => {
    const { flow, server, wallet, account } = await ready();
    const read = await flow.quoteSale(10_000n, account);
    const quote = (read as { quote: SaleQuote }).quote;
    wallet.payer.confirmed = false;
    await expect(flow.paySale(quote)).resolves.toBe("dismissed");
    wallet.payer.confirmed = true;
    const start = server.now();
    server.now = () => start + ORDER_LOCK_MS;
    await expect(flow.paySale(quote)).resolves.toBe("expired");
    expect(wallet.paid).toEqual([]);
  });

  it("pays nothing when the passkey's prompt outlasts the rate's lock", async () => {
    const { flow, server, wallet, account } = await ready();
    const read = await flow.quoteSale(10_000n, account);
    const quote = (read as { quote: SaleQuote }).quote;
    // Answered with the lock's last 30 seconds left: less than a payment needs to reach it.
    const start = server.now();
    wallet.sellPayer.confirm = async () => {
      server.now = () => start + ORDER_LOCK_MS - 30_000;
      return true;
    };
    await expect(flow.paySale(quote)).resolves.toBe("expired");
    expect(wallet.paid).toEqual([]);
  });

  it("records each sale as agreed before its payment leaves, once per invoice", async () => {
    const { flow, wallet, account, records } = await ready();
    const read = await flow.quoteSale(10_000n, account, { deferred: true });
    if (!read.ok) throw new Error(read.issue);
    const { quote } = read;
    // Quoted, nothing recorded: only a sale being paid is.
    expect(records.taken).toEqual([]);
    let paidWhenRecorded: number | null = null;
    const pay = wallet.sellPayer.pay;
    wallet.sellPayer.pay = async (payment) => {
      paidWhenRecorded ??= records.taken.length;
      return pay(payment);
    };
    // A first payment that fails, then its retry: the record written once, before the first.
    wallet.payer.failing = true;
    await expect(flow.paySale(quote)).rejects.toThrow("Payment failed");
    expect(paidWhenRecorded).toBe(1);
    wallet.payer.failing = false;
    await expect(flow.paySale(quote)).resolves.toBe("paid");
    expect(records.taken).toEqual([
      {
        paymentHash: quote.payment.invoice.paymentHash,
        at: expect.any(Number),
        orderId: quote.order.id,
        shortId: quote.order.shortId,
        sats: 10_000n,
        received: { amount: quote.order.destAmount, currency: "CHF" },
        rate: quote.order.rate,
        fees: quote.order.estimate?.fees ?? null,
        // A deferred sell pays no transfer fee.
        transferFeeMinor: 0,
        deferred: true,
        reference: quote.reference,
        oid: "6f1d2c3b-4a59-4e68-9d7c-8b6a5f4e3d2c",
        // A deferred sale names no account: wired later, to the account as it is then.
        account: {
          id: account.id,
          iban: null,
          currency: account.currency,
          label: null,
          holder: null
        }
      }
    ]);
    expect(quote.reference).toMatch(/^SATTLEME$/);
    expect(wallet.paid).toEqual([quote.payment.invoice.pr]);
  });

  it("pays nothing when no majority of the relays took the sale's record", async () => {
    const { flow, wallet, account, records } = await ready();
    const read = await flow.quoteSale(10_000n, account);
    if (!read.ok) throw new Error(read.issue);
    records.refusing = true;
    await expect(flow.paySale(read.quote)).rejects.toThrow("No majority took the record");
    expect(wallet.paid).toEqual([]);
    // Taken at the next try: paid then.
    records.refusing = false;
    await expect(flow.paySale(read.quote)).resolves.toBe("paid");
    expect(records.taken).toHaveLength(1);
    expect(wallet.paid).toEqual([read.quote.payment.invoice.pr]);
  });

  it("pays nothing when the record's write outlasts the rate's lock", async () => {
    const { flow, server, wallet, account } = await ready();
    const read = await flow.quoteSale(10_000n, account);
    if (!read.ok) throw new Error(read.issue);
    const start = server.now();
    const flowDeps = flow as unknown as { deps: SellDeps };
    const recordSale = flowDeps.deps.recordSale;
    flowDeps.deps.recordSale = async (sale) => {
      server.now = () => start + ORDER_LOCK_MS - 30_000;
      return recordSale(sale);
    };
    await expect(flow.paySale(read.quote)).resolves.toBe("expired");
    expect(wallet.paid).toEqual([]);
  });

  it("leads back to the login when a sale's own call finds the session lost", async () => {
    const { flow, server } = await ready();
    server.revokeSessions();
    await expect(flow.estimate(10_000n, "CHF")).rejects.toBeInstanceOf(MtpSessionLostError);
    expect(flow.getState()).toMatchObject({ view: { name: "phone" }, sessionLost: true });
  });

  it("asks a sale's progress with its profile's scope only, as production requires", async () => {
    const { flow, server, account } = await ready();
    const read = await flow.quoteSale(10_000n, account);
    const { order } = (read as { quote: SaleQuote }).quote;
    const scopeId = flow.profile()?.person.scopeId;
    expect(scopeId).toEqual(expect.any(String));
    const token = server.requests.findLast((request) => request.token !== undefined)?.token;
    // Production's answer without `scopeId`, which the fake gives too.
    await expect(
      server.handle({
        method: "GET",
        path: "/transactions/status",
        token,
        query: { orderId: order.id }
      })
    ).resolves.toMatchObject({
      status: 400,
      body: { error: { message: "scopeId must be provided" } }
    });
    // Another profile's scope knows no such order.
    await expect(
      server.handle({
        method: "GET",
        path: "/transactions/status",
        token,
        query: { orderId: order.id, scopeId: "another-scope" }
      })
    ).resolves.toMatchObject({ status: 404 });
    const before = server.requests.length;
    await expect(flow.transactionStatus(order.id)).resolves.toMatchObject({ orderId: order.id });
    expect(server.requests.slice(before)).toEqual([
      expect.objectContaining({
        path: "/transactions/status",
        query: { orderId: order.id, scopeId }
      })
    ]);
  });

  it("asks no sale's progress without a profile at Mt Pelerin", async () => {
    const { flow, server } = await loggedIn("newCustomer");
    expect(flow.profile()).toBeNull();
    const before = server.requests.length;
    await expect(flow.transactionStatus("some-order")).rejects.toMatchObject({ code: "notFound" });
    // The profile read for the call, none found: nothing asked of its orders.
    expect(server.requests.slice(before).map(({ path }) => path)).toEqual(["/persons/findOne"]);
  });

  it("reads one order by its id, in one call", async () => {
    const { flow, server, account } = await ready();
    const read = await flow.quoteSale(10_000n, account);
    const { order } = (read as { quote: SaleQuote }).quote;
    const yearStart = new Date(new Date(server.now()).getFullYear(), 0, 1).getTime();
    const before = server.requests.length;
    await expect(flow.order(order.id, yearStart)).resolves.toMatchObject({ id: order.id });
    expect(server.requests.slice(before)).toEqual([
      expect.objectContaining({
        path: "/orders/status",
        query: expect.objectContaining({ orderId: order.id, skip: "0" })
      })
    ]);
    await expect(flow.order("unknown-order", yearStart)).resolves.toBeNull();
  });

  it("reads the wallet's payment of a sale only while Mt Pelerin tells no funds of it", async () => {
    const { flow, server, wallet, account } = await ready();
    server.fundsUntold = true;
    const yearStart = new Date(new Date(server.now()).getFullYear(), 0, 1).getTime();
    const paidRead = await flow.quoteSale(10_000n, account);
    if (!paidRead.ok) throw new Error(paidRead.issue);
    await expect(flow.paySale(paidRead.quote)).resolves.toBe("paid");
    const unpaidRead = await flow.quoteSale(12_000n, account);
    if (!unpaidRead.ok) throw new Error(unpaidRead.issue);
    const paid = (await flow.order(paidRead.quote.order.id, yearStart))!;
    const unpaid = (await flow.order(unpaidRead.quote.order.id, yearStart))!;
    expect(paid).toMatchObject({ transactionStatus: null, paymentHash: expect.any(String) });
    const readSince = jest.fn(wallet.sellPayer.paidSince);
    wallet.sellPayer.paidSince = readSince;

    // Paid by the wallet, not yet told by Mt Pelerin: its payment, read from the earliest order.
    await expect(flow.walletPayments([paid, unpaid])).resolves.toEqual(
      new Map([[paid.paymentHash, "completed"]])
    );
    expect(readSince).toHaveBeenCalledWith(
      Math.min(paid.createdAt, unpaid.createdAt) - SPLIT_CLOCK_GAP_SECONDS
    );
    // Told by Mt Pelerin: its word, the wallet not read.
    server.fundSale(paid.id);
    const funded = (await flow.order(paid.id, yearStart))!;
    expect(funded.transactionStatus).not.toBeNull();
    readSince.mockClear();
    await expect(flow.walletPayments([funded])).resolves.toEqual(new Map());
    expect(readSince).not.toHaveBeenCalled();
    // A day after its rate's lock ended without funds, it sold nothing: the wallet not read.
    server.now = () => (unpaid.expiresAt! + SPLIT_UNFUNDED_GRACE_SECONDS + 60) * 1000;
    await expect(flow.walletPayments([unpaid])).resolves.toEqual(new Map());
    expect(readSince).not.toHaveBeenCalled();
    // The wallet unread: told to the caller, never a payment guessed.
    server.now = () => unpaid.createdAt * 1000;
    wallet.sellPayer.paidSince = async () => {
      throw new Error("Wallet closed");
    };
    await expect(flow.walletPayments([unpaid])).rejects.toThrow("Wallet closed");
  });

  it("lists the year's orders, every page, newest first, and none twice", async () => {
    const { flow, server } = await ready("readyWithSales");
    const yearStart = new Date(new Date(server.now()).getFullYear(), 0, 1).getTime();
    const orders = await flow.orders(yearStart);
    expect(orders).toHaveLength(1);
    expect(orders?.[0]).toMatchObject({ sourceCurrency: "sat", transactionStatus: "finished" });
    // The days in Zurich: a day more on each side.
    const query = server.requests.find(({ path }) => path === "/orders/status")?.query;
    expect(query).toEqual({
      fromDate: new Date(yearStart - 24 * 60 * 60_000).toISOString().slice(0, 10),
      toDate: new Date(server.now() + 2 * 24 * 60 * 60_000).toISOString().slice(0, 10),
      skip: "0",
      limit: "20"
    });

    const phone = server.person()!.phone as string;
    const now = server.now();
    for (let i = 1; i <= 44; i++) server.seedSale(phone, { sats: 1000n, at: now - i * 60_000 });
    // Last year's, which the window's extra day may bring: left out.
    server.seedSale(phone, { sats: 1000n, at: yearStart - 60_000 });
    const all = await flow.orders(yearStart);
    expect(all).toHaveLength(45);
    expect(all!.map(({ createdAt }) => createdAt)).toEqual(
      [...all!.map(({ createdAt }) => createdAt)].sort((a, b) => b - a)
    );
    const skips = server.requests
      .filter(({ path }) => path === "/orders/status")
      .slice(1)
      .map(({ query: q }) => q?.skip);
    expect(skips).toEqual(["0", "20", "40"]);
  });

  it("tells a sale to a bank account the merchant chose among several", async () => {
    const { flow, server } = await ready();
    expect(await flow.addBankAccount({ ...COMPANY, iban: fakeIban(7), currency: "EUR" })).toBe(
      true
    );
    const state = view(flow);
    const accounts = state.name === "ready" ? state.ready.accounts : [];
    expect(accounts.map(({ currency }) => currency)).toEqual(["CHF", "EUR"]);
    const eur = accounts[1] as MtpBankAccount;
    const read = await flow.quoteSale(10_000n, eur);
    expect(read).toMatchObject({ ok: true, quote: { order: { destCurrency: "EUR" } } });
    expect(server.requests.at(-1)).toMatchObject({ path: "/orders/create" });
  });
});
