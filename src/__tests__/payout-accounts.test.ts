import {
  bankDetailsOfAccount,
  ownerComplete,
  payoutAccounts,
  payoutAccountsIn
} from "@/features/settings/payout-accounts";
import { formatIban } from "@/lib/iban";
import { hasIncompleteAddress } from "@/lib/mtpelerin/accounts";
import { createMtPelerinApi } from "@/lib/mtpelerin/api";
import { MtPelerinError } from "@/lib/mtpelerin/errors";
import type { MtpSessionState } from "@/lib/mtpelerin/session-format";
import type { MtpSessionStore } from "@/lib/mtpelerin/session-sync";
import type { MtpBankAccount } from "@/lib/mtpelerin/types";

import { SCENARIO_IBAN, scenarioServer, type Scenario } from "../../jest/mtpelerin-fake/scenarios";
import { fakeIban, type FakeMtPelerin } from "../../jest/mtpelerin-fake/server";

/*
 * The Mt Pelerin accounts of "Settings › Bank account" (src/features/settings/
 * payout-accounts.ts): what it reads and registers against the fake Mt Pelerin of the tests, and
 * how an account of Mt Pelerin's becomes the settings' one. Fictitious data only.
 */

const ADDRESS = "merchant@breez.tips";
/** A session another device of the account shared: the fake adopts it as the scenario's profile. */
const SHARED_TOKEN = `fake.00000000.${"ab".repeat(24)}`;
const OTHER_IBAN = fakeIban(4410);

type Json = Record<string, unknown>;

/** The account's session, in memory (session-sync.ts's API). */
function memorySessions(refreshToken: string | null) {
  let state: MtpSessionState = { refreshToken, sessionAt: 0, paidValidations: [] };
  const store: MtpSessionStore = {
    load: async () => state,
    keep: async (token) => {
      state = { ...state, refreshToken: token, sessionAt: Date.now() };
    },
    refused: async () => {
      state = { ...state, refreshToken: null };
      return null;
    },
    recordPaid: async () => undefined,
    settled: async () => undefined
  };
  return { store, state: () => state };
}

/** Mt Pelerin in `scenario`'s state, its profile with `extra` accounts too; the session `token`. */
function setUp({
  scenario = "ready",
  extra = [],
  token = SHARED_TOKEN
}: { scenario?: Scenario; extra?: Json[]; token?: string | null } = {}) {
  const server: FakeMtPelerin = scenarioServer(scenario, ADDRESS);
  const seed = server.onNewPhone;
  server.onNewPhone = (phone) => {
    seed?.(phone);
    for (const account of extra) server.seedAccount(phone, account);
  };
  const sessions = memorySessions(token);
  const accounts = payoutAccounts({
    api: createMtPelerinApi((request) => server.handle(request)),
    sessions: sessions.store
  });
  return { server, sessions, accounts };
}

/** A bank account as Mt Pelerin registers it. */
function bank(iban: string, patch: Json = {}): Json {
  return {
    type: "external",
    reference: "Account",
    iban,
    currency: "CHF",
    owner_firstname: "Alice",
    owner_lastname: "Example",
    owner_street: "2 Test Street",
    owner_postcode: "1003",
    owner_city: "Lausanne",
    owner_country: "CH",
    user_is_owner: true,
    status: "active",
    ...patch
  };
}

/** Mt Pelerin's id of the profile's account of `iban` in `currency` (its last session's). */
function idOf(server: FakeMtPelerin, iban: string, currency = "CHF"): string {
  const account = server
    .accountsOfUser()
    .find((entry) => entry.iban === iban && entry.currency === currency);
  return account?.id as string;
}

/** The read's accounts, by IBAN and currency. */
const ibans = (accounts: readonly MtpBankAccount[]) =>
  accounts.map((account) => `${account.iban} ${account.currency}`);

const COMPANY_INPUT = {
  holder: { kind: "company" as const, name: "New Studio" },
  iban: OTHER_IBAN,
  street: "3 New Street",
  postcode: "1000",
  city: "Lausanne",
  country: "CH",
  currency: "CHF" as const
};

beforeEach(() => {
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("payoutAccounts.read", () => {
  it("is not connected without a session, and asks Mt Pelerin nothing", async () => {
    const { server, accounts } = setUp({ token: null });

    await expect(accounts.read()).resolves.toEqual({ connected: false });
    expect(server.requests).toEqual([]);
  });

  it("lists the bank accounts a sale may go to, and only them", async () => {
    const { server, accounts } = setUp({
      extra: [
        bank(OTHER_IBAN, { currency: "EUR", status: "pending_validation" }),
        bank(fakeIban(4411), { status: "rejected" }),
        // Not a currency Mt Pelerin wires a sale in.
        bank(fakeIban(4412), { currency: "BRL" })
      ]
    });

    const read = await accounts.read();

    expect(read.connected).toBe(true);
    expect(read.connected && ibans(read.accounts)).toEqual([
      `${SCENARIO_IBAN} CHF`,
      `${OTHER_IBAN} EUR`
    ]);
    // Its bank accounts only: never the steps of "Sell" (no Lightning account, no 1-sat invoice).
    const routes = server.requests.map(({ method, path }) => `${method} ${path}`);
    expect(routes).toEqual(["POST /tokens/refresh", "GET /accounts"]);
  });

  it("is not connected once Mt Pelerin refuses the session", async () => {
    const { server, accounts, sessions } = setUp();
    server.failNext("POST /tokens/refresh", 401, { error: { message: "Invalid refresh token" } });

    await expect(accounts.read()).resolves.toEqual({ connected: false });
    expect(sessions.state().refreshToken).toBeNull();
  });

  it("rejects when Mt Pelerin does not answer, telling nothing", async () => {
    const { server, accounts } = setUp();
    server.offline = true;

    const read = accounts.read();

    await expect(read).rejects.toBeInstanceOf(MtPelerinError);
    await expect(read).rejects.toMatchObject({ code: "offline" });
  });
});

describe("payoutAccounts.register", () => {
  it("registers a new account as the merchant's own, in the currency asked", async () => {
    const { server, accounts } = setUp();

    const registered = await accounts.register(COMPANY_INPUT);

    const created = server.requests.filter(({ method }) => method === "PUT");
    expect(created).toHaveLength(1);
    expect(created[0]?.path).toBe("/accounts");
    expect(created[0]?.body).toMatchObject({
      type: "external",
      iban: OTHER_IBAN,
      currency: "CHF",
      owner_companyname: "New Studio",
      owner_street: "3 New Street",
      owner_postcode: "1000",
      owner_city: "Lausanne",
      owner_country: "CH",
      user_is_owner: true
    });
    const read = await accounts.read();
    expect(read.connected && ibans(read.accounts)).toContain(`${OTHER_IBAN} CHF`);
    // Its id, what the settings keep: never its details.
    expect(registered).toEqual({ kind: "registered", accountId: idOf(server, OTHER_IBAN) });
  });

  /** The scenario's account (scenarios.ts), as it is there. */
  const SCENARIO_INPUT = {
    holder: { kind: "company" as const, name: "Example Studio" },
    iban: SCENARIO_IBAN,
    street: "1 Example Street",
    postcode: "1000",
    city: "Lausanne",
    country: "CH",
    currency: "CHF" as const
  };

  it("sends nothing for an account Mt Pelerin has in that currency, as typed", async () => {
    const { server, accounts } = setUp();

    expect(await accounts.register({ ...SCENARIO_INPUT, street: " 1 Example Street " })).toEqual({
      kind: "known",
      accountId: idOf(server, SCENARIO_IBAN)
    });
    expect(server.requests.some(({ method }) => method === "PUT" || method === "PATCH")).toBe(
      false
    );
  });

  it("changes there the holder and address of an account Mt Pelerin has", async () => {
    const { server, accounts } = setUp();
    const person = {
      ...SCENARIO_INPUT,
      holder: { kind: "person" as const, firstname: "Alice", lastname: "Example" },
      street: "Hauptstrasse 9",
      postcode: "8001",
      city: "Zürich"
    };

    expect(await accounts.register(person)).toEqual({
      kind: "updated",
      accountId: idOf(server, SCENARIO_IBAN)
    });

    expect(server.requests.some(({ method }) => method === "PUT")).toBe(false);
    const patch = server.requests.find(({ method }) => method === "PATCH");
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
    const read = await accounts.read();
    expect(read.connected && read.accounts[0]).toMatchObject({
      iban: SCENARIO_IBAN,
      currency: "CHF",
      owner: { name: { kind: "person", firstname: "Alice" }, city: "Zürich" }
    });
    // As typed now: nothing more to send.
    await expect(accounts.register(person)).resolves.toMatchObject({ kind: "known" });
  });

  it("says when Mt Pelerin refuses or keeps a change, its session kept", async () => {
    const { server, sessions, accounts } = setUp();
    const moved = { ...SCENARIO_INPUT, city: "Geneva" };
    await accounts.read();
    const id = server.accountsOfUser().find(({ type }) => type === "external")?.id as string;
    const refreshes = () => server.requests.filter(({ path }) => path === "/tokens/refresh").length;
    const before = refreshes();

    server.failNext(`PATCH /accounts/${id}`, 401, {
      error: { statusCode: 401, message: "Authorization Required", code: "AUTHORIZATION_REQUIRED" }
    });
    await expect(accounts.register(moved)).resolves.toEqual({ kind: "unchanged" });
    // Neither refreshed nor dropped: the refused account is not a refused session.
    expect(sessions.state().refreshToken).not.toBeNull();
    expect(refreshes()).toBe(before);

    // Answered 200, the account as it was: read again, it says so.
    const unchanged = server.accountsOfUser().find(({ type }) => type === "external");
    server.failNext(`PATCH /accounts/${id}`, 200, unchanged);
    await expect(accounts.register(moved)).resolves.toEqual({ kind: "unchanged" });

    server.failNext(`PATCH /accounts/${id}`, 503);
    await expect(accounts.register(moved)).rejects.toMatchObject({ code: "server" });
    server.offline = true;
    await expect(accounts.register(moved)).rejects.toMatchObject({ code: "offline" });
  });

  it("registers again an account Mt Pelerin rejected: no sale goes to it", async () => {
    const { accounts } = setUp({ extra: [bank(OTHER_IBAN, { status: "rejected" })] });

    await expect(accounts.register(COMPANY_INPUT)).resolves.toMatchObject({ kind: "registered" });
  });

  it("registers the same IBAN in another currency", async () => {
    const { accounts } = setUp();

    await expect(
      accounts.register({ ...COMPANY_INPUT, iban: SCENARIO_IBAN, currency: "EUR" })
    ).resolves.toMatchObject({ kind: "registered" });
  });

  it("says an IBAN another profile registered", async () => {
    const { server, accounts } = setUp();
    server.seedOtherProfileAccount(bank(OTHER_IBAN));

    await expect(accounts.register(COMPANY_INPUT)).resolves.toEqual({ kind: "ibanTaken" });
  });

  it("says Mt Pelerin is not connected without a session", async () => {
    const { server, accounts } = setUp({ token: null });

    await expect(accounts.register(COMPANY_INPUT)).resolves.toEqual({ kind: "notConnected" });
    expect(server.requests).toEqual([]);
  });

  it("rejects when Mt Pelerin refuses or does not answer", async () => {
    const { server, accounts } = setUp();
    server.failNext("PUT /accounts", 500);

    await expect(accounts.register(COMPANY_INPUT)).rejects.toBeInstanceOf(MtPelerinError);

    server.offline = true;
    await expect(accounts.register(COMPANY_INPUT)).rejects.toMatchObject({ code: "offline" });
  });
});

/** An account of Mt Pelerin's, as guards.ts reads it. */
function mtpAccount(patch: Partial<MtpBankAccount> = {}): MtpBankAccount {
  return {
    kind: "bank",
    id: "acc-1",
    status: "active",
    iban: OTHER_IBAN,
    currency: "CHF",
    label: "Account",
    owner: {
      name: { kind: "person", firstname: " Alice ", lastname: "Example " },
      street: " 2 Test Street",
      postcode: "1003",
      city: "Lausanne",
      country: "CH"
    },
    ...patch
  };
}

describe("ownerComplete", () => {
  it("tells an account Mt Pelerin has every line of its holder and address", () => {
    expect(ownerComplete(mtpAccount())).toBe(true);
    const company = mtpAccount({
      owner: { ...mtpAccount().owner, name: { kind: "company", name: "New Studio" } }
    });
    expect(ownerComplete(company)).toBe(true);
    const owner = mtpAccount().owner;
    for (const patch of [
      { street: null },
      { postcode: null },
      { city: " " },
      { country: null },
      { name: { kind: "person" as const, firstname: " ", lastname: "Example" } },
      { name: { kind: "company" as const, name: "" } },
      // One name, not said whether a person's or a company's: the form asks.
      { name: { kind: "unsaid" as const, name: "Example Studio Ltd" } }
    ]) {
      expect(ownerComplete(mtpAccount({ owner: { ...owner, ...patch } }))).toBe(false);
    }
  });
});

describe("the form of an account to complete", () => {
  it("is filled with what Mt Pelerin has, the country detected when it has none", () => {
    const account = mtpAccount({
      owner: { ...mtpAccount().owner, street: null, country: null }
    });

    expect(bankDetailsOfAccount(account, "FR")).toEqual({
      holderKind: "person",
      companyName: "",
      firstname: " Alice ",
      lastname: "Example ",
      country: "FR",
      iban: formatIban(OTHER_IBAN),
      address: "",
      postalCode: "1003",
      city: "Lausanne"
    });
  });
});

describe("hasIncompleteAddress", () => {
  it("is true when Mt Pelerin lacks a line of the holder's address, blank included", () => {
    const owner = mtpAccount().owner;
    expect(hasIncompleteAddress(mtpAccount())).toBe(false);
    for (const patch of [{ street: null }, { postcode: " " }, { city: null }, { country: null }]) {
      expect(hasIncompleteAddress(mtpAccount({ owner: { ...owner, ...patch } }))).toBe(true);
    }
  });
});

describe("the form of an account whose holder Mt Pelerin wrote as one name", () => {
  it("has that name in both kinds' fields, its kind asked", () => {
    const account = mtpAccount({
      owner: {
        name: { kind: "unsaid", name: "Carol Clark Smith" },
        street: null,
        postcode: null,
        city: null,
        country: null
      }
    });

    expect(bankDetailsOfAccount(account, "CH")).toMatchObject({
      holderKind: null,
      companyName: "Carol Clark Smith",
      firstname: "Carol Clark",
      lastname: "Smith",
      country: "CH",
      address: ""
    });
  });
});

describe("payoutAccountsIn", () => {
  it("keeps the accounts of the currency chosen", () => {
    const chf = mtpAccount({ id: "chf" });
    const eur = mtpAccount({ id: "eur", currency: "EUR" });

    expect(payoutAccountsIn([chf, eur], "EUR")).toEqual([eur]);
    expect(payoutAccountsIn([chf, eur], "USD")).toEqual([]);
  });
});

describe("accounts Mt Pelerin lists that the app cannot read", () => {
  /** A bank account of the merchant's that Mt Pelerin wrote without its holder's name. */
  const nameless = (iban: string) =>
    bank(iban, { owner_firstname: undefined, owner_lastname: undefined });

  it("are never offered, but counted", async () => {
    const { accounts } = setUp({ extra: [nameless(fakeIban(4420)), nameless(fakeIban(4421))] });

    const read = await accounts.read();

    expect(read).toEqual({
      connected: true,
      accounts: [expect.objectContaining({ iban: SCENARIO_IBAN })],
      unreadable: 2
    });
  });

  it('never let the read say "none at Mt Pelerin" when they are the only ones', async () => {
    const { server, accounts } = setUp({ scenario: "noBank", extra: [nameless(fakeIban(4420))] });

    await expect(accounts.read()).rejects.toMatchObject({
      name: "MtPelerinError",
      code: "malformed",
      call: "listAccounts",
      field: "owner_firstname"
    });
    expect(server.requests.some(({ method }) => method === "PUT")).toBe(false);
  });

  it("never let an IBAN be told another profile's: it may be one of them", async () => {
    const { server, accounts } = setUp({ extra: [nameless(fakeIban(4420))] });
    server.seedOtherProfileAccount(bank(OTHER_IBAN));

    await expect(accounts.register(COMPANY_INPUT)).rejects.toMatchObject({
      code: "malformed",
      call: "listAccounts"
    });
  });
});
