import { bytesToHex } from "@noble/hashes/utils.js";

import { secureRandomBytes } from "@/lib/random";

import type { MtpRequest, MtpResponse } from "@/lib/mtpelerin/api";
import { personalSigner } from "@/lib/mtpelerin/evm-login";
import { isValidIban, compactIban } from "@/lib/iban";
import { base64ToBytes } from "@/lib/base64";

import { fakeInvoice } from "./invoice";

/*
 * Mt Pelerin's API in memory, for the tests of "Sell" (src/features/sell/, through
 * jest/mtpelerin.ts): the answers of Mt Pelerin's API, their statuses (401 `token expired`,
 * 404 of `findOne`, 409 of a second `PUT /persons` and of "Duplicate account"), and what Mt Pelerin
 * does on its side, driven by hand (its sync of paid 1-sat invoices every ~11 minutes; a sale's
 * progress). Nothing leaves the device: SMS included (no SMS on dev/test either), its code is
 * `smsCode`. A wallet login checks its signature as Mt Pelerin does (`ecrecover`). The wallet's id,
 * the seed and the merchant's settings never reach it. Its rate and fees are its own (`chfPerBtc`,
 * `feePerMille`), in integers.
 */

type Json = Record<string, unknown>;

/** The access token's life. */
export const ACCESS_TOKEN_MS = 60 * 60_000;
/** The refresh token's rotation period. */
export const REFRESH_ROTATION_MS = 30 * 24 * 60 * 60_000;
/** "Currently 15 minutes" to authenticate a device after `POST /devices/add`. */
export const DEVICE_WINDOW_MS = 15 * 60_000;
/** "Over the last 5 days of payments". */
const SYNC_WINDOW_MS = 5 * 24 * 60 * 60_000;
/** How long the fake's invoices stay payable (its own choice). */
export const FAKE_INVOICE_EXPIRY_SECONDS = 3600;
/** "Order creation + 60 min for sell/swap". */
export const ORDER_LOCK_MS = 60 * 60_000;

/**
 * The currencies the fake has a rate for: the 18 of Mt Pelerin's "Sell crypto" page, and BRL,
 * which Mt Pelerin's dev/test rates although it wires none.
 */
const RATED = [
  "AUD",
  "BRL",
  "CAD",
  "CHF",
  "CZK",
  "DKK",
  "EUR",
  "GBP",
  "HKD",
  "HUF",
  "JPY",
  "MXN",
  "NOK",
  "NZD",
  "PLN",
  "SEK",
  "SGD",
  "USD",
  "ZAR"
];

/** Mt Pelerin's configuration, with the Lightning network it serves. */
export function fakeConfig(): Json {
  return {
    networks: [
      {
        id: "bitcoin_mainnet",
        name: "Bitcoin",
        family: "bitcoin",
        chainId: null,
        accountType: "bitcoin",
        assets: [
          {
            asset: "002",
            symbol: "BTC",
            name: "Bitcoin",
            decimals: 8,
            native: true,
            contract: null
          }
        ]
      },
      {
        id: "lightning_mainnet",
        name: "Bitcoin Lightning",
        family: "lightning",
        chainId: null,
        accountType: "lightning",
        // As `GET /forms/mtp-config` gives it (millisats).
        assets: [
          {
            asset: "080",
            symbol: "sat",
            name: "Bitcoin",
            decimals: 3,
            tokenType: "L_BTC",
            native: true,
            contract: null
          }
        ]
      }
    ]
  };
}

function newId(): string {
  return bytesToHex(secureRandomBytes(12));
}

/** A token of the fake `issuer` (FakeMtPelerin.issuer). */
function newToken(issuer: string): string {
  return `fake.${issuer}.${bytesToHex(secureRandomBytes(24))}`;
}

const FAKE_TOKEN = /^fake\.[0-9a-f]{8}\.[0-9a-f]{48}$/;

/**
 * The number of a session a fake takes from another (adopt): fictitious, as every datum of the
 * fake. No login told this fake the number.
 */
export const FAKE_ADOPTED_PHONE = "+41000000000";

/** A fictitious Swiss IBAN of the fake bank `08781`, its check digits computed (ISO 13616). */
export function fakeIban(serial: number): string {
  const bban = `08781${String(serial).padStart(12, "0")}`;
  // "CH" is 12 17, then "00" as the check digits' place.
  const digits = `${bban}121700`;
  let remainder = 0;
  for (const digit of digits) remainder = (remainder * 10 + Number(digit)) % 97;
  return `CH${String(98 - remainder).padStart(2, "0")}${bban}`;
}

/** Centimes as a decimal text: 49350 → "493.50". */
function chf(minor: bigint): string {
  const whole = minor / 100n;
  const cents = minor % 100n;
  return `${whole}.${cents.toString().padStart(2, "0")}`;
}

const json = (status: number, body: unknown): MtpResponse => ({ status, body });
const error = (status: number, message: string, extra: Json = {}): MtpResponse =>
  json(status, { error: { statusCode: status, message }, ...extra });

/** A sale's progress at Mt Pelerin, driven by the tests. */
export type FakeSaleStage = "received" | "converted" | "sent" | "held" | "delayed" | "refunded";

type FakeOrder = { userId: string; order: Json; transaction: Json | null };

export class FakeMtPelerin {
  /** No answer at all: as offline (MtPelerinError "offline"). */
  offline = false;
  /** The code "sent" by SMS: none is sent. */
  smsCode = "123456";
  /** The configuration served, raw. */
  config: Json = fakeConfig();
  /** The fake's price of 1 BTC in CHF, before fees (an integer: exact sums). */
  chfPerBtc = 84_318n;
  /** Its fees, per mille of the gross amount, rounded up to the centime. */
  feePerMille = 13n;
  /**
   * What a number logging in for the first time finds (a profile made with that number
   * elsewhere, its accounts): the scenario's (scenarios.ts), seeding them. Null: nothing.
   */
  onNewPhone: ((phone: string) => void) | null = null;
  /**
   * An invoice that is not the one expected (the app's checks, invoice.ts, sale.ts): of another
   * network, of another amount, or already expired. Null: as Mt Pelerin answers.
   */
  tamperInvoice: "otherNetwork" | "otherAmount" | "expired" | null = null;
  /** An order of another amount than asked (sale.ts "otherOrder"). */
  tamperOrder = false;
  /**
   * A sale's invoice paid tells nothing yet of its funds: its order stays as created (`pending`,
   * no transaction) until `fundSale`. False: told at once.
   */
  fundsUntold = false;
  /** Every request answered or not, in order: the tests'. */
  readonly requests: MtpRequest[] = [];
  /** The clock (ms), the tests'. */
  now: () => number = () => Date.now();

  private failures: {
    match: string;
    status: number;
    body: unknown;
    when?: (request: MtpRequest) => boolean;
  }[] = [];
  private phones = new Map<string, string>();
  private persons = new Map<string, Json>();
  private accounts: { userId: string; account: Json }[] = [];
  /** `phone` or `address`: what the device was registered with. */
  private devices = new Map<
    string,
    {
      phone: string | null;
      address: string | null;
      userId: string;
      createdAt: number;
      smsSent: boolean;
    }
  >();
  /** The wallets' profiles, by lowercase address. */
  private wallets = new Map<string, string>();
  /** Starts this fake's tokens: another's (another device's, this app's before) are told apart. */
  private readonly issuer = bytesToHex(secureRandomBytes(4));
  private accessTokens = new Map<string, { userId: string; expiresAt: number }>();
  private refreshTokens = new Map<string, { userId: string; issuedAt: number }>();
  /** Refresh tokens this fake revoked or consumed: never taken again. */
  private spent = new Set<string>();
  private invoices = new Map<
    string,
    { pr: string; accountId: string | null; orderId: string | null; paidAt: number | null }
  >();
  private orders: FakeOrder[] = [];
  private referrals: Json[] = [];
  /** The user of the last authenticated request: what the controls below act on. */
  private lastUser: string | null = null;

  /**
   * The next request matching `match` ("PUT /persons"), and `when` if given (its body, say), is
   * answered `status`, once.
   */
  failNext(
    match: string,
    status: number,
    body: unknown = { error: { message: "Failure" } },
    when?: (request: MtpRequest) => boolean
  ) {
    this.failures.push({ match, status, body, when });
  }

  /** Every access token answers `401 token expired`: the session refreshes. */
  expireAccessTokens(): void {
    for (const entry of this.accessTokens.values()) entry.expiresAt = this.now() - 1;
  }

  /** Every refresh token is refused: the session is lost, a new login needed. */
  revokeSessions(): void {
    for (const token of this.refreshTokens.keys()) this.spent.add(token);
    this.refreshTokens.clear();
    this.accessTokens.clear();
  }

  /** The profile of the last session, raw, or null. */
  person(): Json | null {
    return this.lastUser ? (this.persons.get(this.lastUser) ?? null) : null;
  }

  /** The accounts of the last session, raw. */
  accountsOfUser(): Json[] {
    return this.accounts.filter(({ userId }) => userId === this.lastUser).map((e) => e.account);
  }

  /** The orders of the last session, raw, oldest first. */
  ordersOfUser(): Json[] {
    return this.orders.filter(({ userId }) => userId === this.lastUser).map((e) => e.order);
  }

  /** The referrals posted. */
  postedReferrals(): Json[] {
    return [...this.referrals];
  }

  /**
   * The merchant's wallet paid `pr` (a test's payer): true when it is one of the fake's. A sale's
   * invoice paid: Mt Pelerin received its sats (`in_status: "finished"`). A deferred sell's: its
   * order goes to `validated`, its francs join the bank account's balance, and no transaction is
   * made for it, as production answers a deferred sell paid
   * (`{ "order": … }` alone, `type: "spot"`, `status: "validated"`).
   */
  payInvoice(pr: string): boolean {
    const invoice = [...this.invoices.values()].find((entry) => entry.pr === pr);
    if (!invoice || invoice.paidAt !== null) return false;
    invoice.paidAt = this.now();
    if (invoice.orderId !== null && !this.fundsUntold) this.fundSale(invoice.orderId);
    return true;
  }

  /** The funds of the sale `orderId` told: received (payInvoice). */
  fundSale(orderId: string): void {
    const entry = this.orders.find(({ order }) => order.id === orderId);
    if (entry?.order.type === "spot") {
      entry.order.status = "validated";
      entry.order.modification_date = new Date(this.now()).toISOString();
    } else {
      this.advanceSale(orderId, "received");
    }
  }

  /** The identity of `phone`'s profile approved by Mt Pelerin (`kycLevel` 2). */
  approveIdentity(phone: string, level = 2): void {
    const person = this.persons.get(this.userOf(phone));
    if (person) person.kycLevel = level;
  }

  /**
   * Mt Pelerin's "incoming-payment sync (every ~11 minutes, over the last 5 days of payments)":
   * each pending Lightning account whose 1-sat invoice was paid becomes active.
   */
  syncPayments(): void {
    for (const invoice of this.invoices.values()) {
      if (invoice.paidAt === null || invoice.accountId === null) continue;
      if (this.now() - invoice.paidAt > SYNC_WINDOW_MS) continue;
      const entry = this.accounts.find(({ account }) => account.id === invoice.accountId);
      if (
        entry &&
        entry.account.type === "lightning" &&
        entry.account.status === "pending_validation"
      ) {
        entry.account.status = "active";
      }
    }
  }

  /** A sale's progress at Mt Pelerin (its "three steps"). */
  advanceSale(orderId: string, stage: FakeSaleStage): void {
    const entry = this.orders.find(({ order }) => order.id === orderId);
    if (!entry) return;
    const steps: Record<FakeSaleStage, [string, string, string, string]> = {
      received: ["pending", "finished", "pending", "pending"],
      converted: ["pending", "finished", "finished", "pending"],
      sent: ["finished", "finished", "finished", "finished"],
      held: ["onhold", "onhold", "pending", "pending"],
      delayed: ["pending", "finished", "finished", "delayed"],
      refunded: ["refunded", "refunded", "pending", "pending"]
    };
    const [current, inStatus, forex, out] = steps[stage];
    entry.transaction = {
      transaction_group_id: entry.transaction?.transaction_group_id ?? newId(),
      current_status: current,
      in_status: inStatus,
      forex_status: forex,
      out_status: out,
      dest_identifier: entry.order.beneficiary_id
    };
    entry.order.status =
      stage === "sent" ? "finished" : stage === "refunded" ? "cancelled" : "validated";
  }

  /** A profile for `phone`'s login (tests, scenarios.ts). */
  seedProfile(
    phone: string,
    { email = "alice@example.com" }: { email?: string | null } = {}
  ): string {
    const userId = this.userOf(phone);
    this.newPerson(userId, { type: "user", email, phone });
    return userId;
  }

  /** An account of `phone`'s profile (a Lightning account, a bank account), raw (tests). */
  seedAccount(phone: string, account: Json): Json {
    const userId = this.userOf(phone);
    const full = { id: newId(), scope_id: userId, ...account };
    this.accounts.push({ userId, account: full });
    return full;
  }

  /** An account of a profile that is not the merchant's: a "Duplicate account". */
  seedOtherProfileAccount(account: Json): void {
    this.accounts.push({
      userId: newId(),
      account: { id: newId(), user_is_owner: true, ...account }
    });
  }

  /**
   * A past order of `phone`'s profile, raw: a sale of `sats` into CHF at the fake's rate,
   * made `at` (ms), its transaction as `stage` left it (null: none). Tests of the limits and the
   * list.
   */
  seedSale(
    phone: string,
    {
      sats,
      at,
      stage = "sent",
      currency = "CHF"
    }: {
      sats: bigint;
      at: number;
      stage?: FakeSaleStage | null;
      currency?: string;
    }
  ): Json {
    const userId = this.userOf(phone);
    const bank = this.accounts.find(
      ({ userId: owner, account }) => owner === userId && account.type === "external"
    );
    const order = this.newOrder(userId, {
      sats,
      currency,
      beneficiaryId: (bank?.account.id as string | undefined) ?? newId(),
      reference: "SATTLEME",
      oid: newId(),
      wid: null,
      at
    });
    if (stage !== null) this.advanceSale(order.id as string, stage);
    return order;
  }

  async handle(request: MtpRequest): Promise<MtpResponse> {
    this.requests.push(request);
    if (this.offline) throw new TypeError("Network request failed");
    const route = `${request.method} ${request.path}`;
    const failure = this.failures.findIndex(
      ({ match, when }) =>
        (route === match || route.startsWith(`${match}?`)) && (when === undefined || when(request))
    );
    if (failure !== -1) {
      const [{ status, body }] = this.failures.splice(failure, 1);
      return json(status, body);
    }
    return this.route(request);
  }

  private route(request: MtpRequest): MtpResponse {
    const { method, path } = request;
    const body = (request.body ?? {}) as Json;
    if (method === "POST" && path === "/devices/add") return this.addDevice(body);
    let match = /^\/devices\/([^/]+)\/sms$/.exec(path);
    if (method === "POST" && match) return this.sendSms(match[1]!);
    match = /^\/devices\/([^/]+)\/authenticate$/.exec(path);
    if (method === "POST" && match) return this.authenticate(match[1]!, body);
    if (method === "POST" && path === "/tokens/refresh") return this.refresh(body);
    if (method === "GET" && path === "/forms/mtp-config") return json(200, this.config);
    if (method === "POST" && path === "/ethereum/ln/pr") return this.validationInvoice(body);

    // Authenticated endpoints.
    const user = this.authorize(request.token);
    if (typeof user !== "string") return user;
    this.lastUser = user;
    if (method === "GET" && path === "/persons/findOne") {
      const person = this.persons.get(user);
      return person ? json(200, person) : error(404, "Person not found");
    }
    if (method === "PUT" && path === "/persons") return this.createPerson(user, body);
    match = /^\/persons\/([^/]+)$/.exec(path);
    if (method === "PATCH" && match) return this.updatePerson(user, match[1]!, body);
    if (method === "POST" && path === "/referrals/create") return this.referral(body);
    if (method === "GET" && path === "/accounts") return this.listAccounts(user, request.query);
    if (method === "PUT" && path === "/accounts") return this.createAccount(user, body);
    match = /^\/accounts\/([^/]+)$/.exec(path);
    if (method === "PATCH" && match) return this.updateAccount(user, match[1]!, body);
    if (method === "POST" && path === "/orders/estimate") return this.estimate(user, body);
    if (method === "POST" && path === "/orders/create") return this.createOrder(user, body);
    if (method === "GET" && path === "/orders/status") return this.listOrders(user, request.query);
    match = /^\/orders\/([^/]+)\/balances$/.exec(path);
    if (method === "GET" && match) return this.balances(user, match[1]!);
    if (method === "GET" && path === "/transactions/status") {
      return this.transactionStatus(user, request.query);
    }
    return error(404, "Not found");
  }

  private userOf(phone: string): string {
    let userId = this.phones.get(phone);
    if (!userId) {
      userId = `${newId().slice(0, 8)}-${newId().slice(0, 4)}-${newId().slice(0, 12)}`;
      this.phones.set(phone, userId);
    }
    return userId;
  }

  private addDevice(body: Json): MtpResponse {
    if (body.identifier_type === "address") return this.addWalletDevice(body);
    if (body.identifier_type !== "phone" || typeof body.phone !== "string") {
      return error(422, "Invalid identifier");
    }
    if (!/^\+[1-9][0-9]{6,14}$/.test(body.phone)) return error(422, "Invalid phone");
    const known = this.phones.has(body.phone);
    const userId = this.userOf(body.phone);
    if (!known) this.onNewPhone?.(body.phone);
    const id = newId();
    this.devices.set(id, {
      phone: body.phone,
      address: null,
      userId,
      createdAt: this.now(),
      smsSent: false
    });
    return json(200, { id, user_id: userId, status: known ? "active" : "new" });
  }

  /** A wallet login's step 1: its address; "the same `user_id` is reused" at each registration. */
  private addWalletDevice(body: Json): MtpResponse {
    if (typeof body.address !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(body.address)) {
      return error(422, "Invalid address");
    }
    const address = body.address.toLowerCase();
    const userId = this.wallets.get(address) ?? `${newId().slice(0, 8)}-${newId().slice(0, 12)}`;
    this.wallets.set(address, userId);
    const id = newId().slice(0, 24);
    this.devices.set(id, { phone: null, address, userId, createdAt: this.now(), smsSent: false });
    // As dev/test answers: no `status` (production's "new" or "active").
    return json(200, {
      id,
      user_id: userId,
      type: "mobile",
      identifier_type: "address",
      identifier: body.address,
      confirmed: false,
      locked: false,
      revoked: false,
      phone: null
    });
  }

  private sendSms(deviceId: string): MtpResponse {
    const device = this.devices.get(deviceId);
    if (!device) return error(404, "Device not found");
    device.smsSent = true;
    return json(200, { status: "SUCCESS" });
  }

  private authenticate(deviceId: string, body: Json): MtpResponse {
    const device = this.devices.get(deviceId);
    if (!device) return error(404, "Device not found");
    if (this.now() - device.createdAt > DEVICE_WINDOW_MS) {
      return error(403, "Device registration expired, register the device again");
    }
    if (device.address !== null) {
      const signature = typeof body.code === "string" ? base64ToBytes(body.code) : null;
      const signer = signature ? personalSigner(deviceId, signature) : null;
      if (signer?.toLowerCase() !== device.address) return error(500, "Invalid signature");
    } else if (!device.smsSent || body.code !== this.smsCode) {
      return error(401, "Invalid code");
    }
    this.devices.delete(deviceId);
    return json(200, {
      id: deviceId,
      user_id: device.userId,
      status: "active",
      ...this.pair(device.userId)
    });
  }

  private pair(userId: string): { access_token: string; refresh_token: string } {
    const access = newToken(this.issuer);
    const refresh = newToken(this.issuer);
    this.accessTokens.set(access, { userId, expiresAt: this.now() + ACCESS_TOKEN_MS });
    this.refreshTokens.set(refresh, { userId, issuedAt: this.now() });
    return { access_token: access, refresh_token: refresh };
  }

  private refresh(body: Json): MtpResponse {
    const token = typeof body.token === "string" ? body.token : "";
    const entry = this.refreshTokens.get(token) ?? this.adopt(token);
    if (!entry) return error(401, "Invalid refresh token");
    const access = newToken(this.issuer);
    this.accessTokens.set(access, {
      userId: entry.userId,
      expiresAt: this.now() + ACCESS_TOKEN_MS
    });
    if (this.now() - entry.issuedAt <= REFRESH_ROTATION_MS) {
      return json(200, { access_token: access, refresh_token: token });
    }
    this.refreshTokens.delete(token);
    this.spent.add(token);
    const refresh = newToken(this.issuer);
    this.refreshTokens.set(refresh, { userId: entry.userId, issuedAt: this.now() });
    return json(200, { access_token: access, refresh_token: refresh });
  }

  /**
   * The session of a token another fake issued: another device of the account shared it
   * (src/lib/mtpelerin/session-sync.ts), or this app before a restart. Each device's fake is its
   * own, in memory: what the other knew of the profile is not here. Taken as a first login of a
   * number this fake never saw (`onNewPhone`: the scenario's profile), a fictitious one; this fake's
   * from then on. Its own tokens, spent or not, are never adopted.
   */
  private adopt(token: string): { userId: string; issuedAt: number } | undefined {
    if (!FAKE_TOKEN.test(token) || token.startsWith(`fake.${this.issuer}.`)) return undefined;
    if (this.spent.has(token)) return undefined;
    const known = this.phones.has(FAKE_ADOPTED_PHONE);
    const userId = this.userOf(FAKE_ADOPTED_PHONE);
    if (!known) this.onNewPhone?.(FAKE_ADOPTED_PHONE);
    const entry = { userId, issuedAt: this.now() };
    this.refreshTokens.set(token, entry);
    return entry;
  }

  private authorize(token: string | undefined): string | MtpResponse {
    const entry = token ? this.accessTokens.get(token) : undefined;
    if (!entry) return error(401, "Unauthorized");
    if (entry.expiresAt <= this.now()) return json(401, { exp: "token expired" });
    return entry.userId;
  }

  private newPerson(
    userId: string,
    fields: { type: "user" | "company"; email?: unknown; phone?: unknown; language?: unknown }
  ): Json {
    const person: Json = {
      id: newId(),
      user_id: userId,
      scope_id: userId,
      short_id: `S${newId().slice(0, 8)}`,
      type: fields.type,
      status: "active",
      email: typeof fields.email === "string" ? fields.email : null,
      phone: typeof fields.phone === "string" ? fields.phone : null,
      language: typeof fields.language === "string" ? fields.language : "en",
      firstname: null,
      lastname: null,
      kycLevel: 0,
      kyc: "not_started",
      attributes: {},
      preferences: {},
      creation_date: new Date(this.now()).toISOString(),
      modification_date: new Date(this.now()).toISOString()
    };
    this.persons.set(userId, person);
    return person;
  }

  private createPerson(user: string, body: Json): MtpResponse {
    if (this.persons.has(user)) return error(409, "A person with this scope_id already exists");
    if (body.type !== "user" && body.type !== "company") return error(422, "Invalid type");
    return json(200, this.newPerson(user, { ...body, type: body.type }));
  }

  private updatePerson(user: string, personId: string, body: Json): MtpResponse {
    const person = this.persons.get(user);
    if (!person || person.id !== personId) return error(404, "Person not found");
    for (const key of ["email", "phone", "language"] as const) {
      if (typeof body[key] === "string") person[key] = body[key];
    }
    person.modification_date = new Date(this.now()).toISOString();
    return json(200, person);
  }

  private referral(body: Json): MtpResponse {
    if (
      body.type !== "phone" ||
      typeof body.identifier !== "string" ||
      typeof body.code !== "string"
    ) {
      return error(422, "Invalid referral");
    }
    const referral = { id: newId(), ...body, status: "pending" };
    this.referrals.push(referral);
    return json(200, referral);
  }

  private listAccounts(user: string, query: Record<string, string> | undefined): MtpResponse {
    let where: Json = {};
    try {
      const filter = JSON.parse(query?.filter ?? "{}") as { where?: Json };
      where = filter.where ?? {};
    } catch {
      return error(400, "Invalid filter");
    }
    const matches = (account: Json) =>
      Object.entries(where).every(([key, wanted]) => {
        if (wanted !== null && typeof wanted === "object" && "inq" in wanted) {
          return (wanted as { inq: unknown[] }).inq.includes(account[key]);
        }
        return account[key] === wanted;
      });
    return json(
      200,
      this.accounts
        .filter(({ userId, account }) => userId === user && matches(account))
        .map((e) => e.account)
    );
  }

  private createAccount(user: string, body: Json): MtpResponse {
    const person = this.persons.get(user);
    if (!person) return error(404, "Person not found");
    if (body.type === "lightning") {
      if (typeof body.crypto_address !== "string") return error(422, "Invalid address");
      if (
        typeof body.verification_code !== "string" ||
        !/^[1-9][0-9]{3}$/.test(body.verification_code)
      ) {
        return error(422, "Invalid verification code");
      }
      const taken = this.accounts.some(
        ({ account }) =>
          account.crypto_address === body.crypto_address && account.user_is_owner === true
      );
      if (taken && body.user_is_owner === true) return error(409, "Duplicate account");
      const account = { ...body, id: newId(), scope_id: user, status: "pending_validation" };
      this.accounts.push({ userId: user, account });
      return json(200, account);
    }
    if (body.type === "external") return this.createBankAccount(user, body);
    return error(422, "Unsupported account type");
  }

  /** Owner's name and address required, the IBAN unique among owners ("Duplicate"). */
  private createBankAccount(user: string, body: Json): MtpResponse {
    if (typeof body.iban !== "string" || !isValidIban(body.iban)) return error(422, "Invalid IBAN");
    if (typeof body.currency !== "string" || !/^[A-Z]{3}$/.test(body.currency)) {
      return error(422, "Invalid currency");
    }
    const named =
      typeof body.owner_companyname === "string" ||
      (typeof body.owner_firstname === "string" && typeof body.owner_lastname === "string");
    const located = ["owner_street", "owner_postcode", "owner_city", "owner_country"].every(
      (key) => typeof body[key] === "string" && (body[key] as string).trim() !== ""
    );
    if (!named || !located) return error(422, "Owner name and address required");
    const iban = compactIban(body.iban);
    const taken = this.accounts.some(
      ({ userId, account }) =>
        userId !== user && account.iban === iban && account.user_is_owner === true
    );
    if (taken && body.user_is_owner === true) return error(409, "Duplicate account");
    // "pending_validation" at creation, as Mt Pelerin's dev/test answers.
    const account = { ...body, iban, id: newId(), scope_id: user, status: "pending_validation" };
    this.accounts.push({ userId: user, account });
    return json(200, account);
  }

  /**
   * `PATCH /accounts/{id}`, undocumented: as Mt Pelerin's dev/test does, the
   * fields sent replace the account's, `null` included, nothing else checked; another profile's
   * account (or none) is refused "Authorization Required" (a 401, not of the token).
   */
  private updateAccount(user: string, accountId: string, body: Json): MtpResponse {
    const entry = this.accounts.find(
      ({ userId, account }) => userId === user && account.id === accountId
    );
    if (!entry) {
      return json(401, {
        error: {
          statusCode: 401,
          message: "Authorization Required",
          code: "AUTHORIZATION_REQUIRED"
        }
      });
    }
    entry.account = { ...entry.account, ...body, id: accountId };
    return json(200, entry.account);
  }

  private validationInvoice(body: Json): MtpResponse {
    if (typeof body.amount !== "number" || !Number.isSafeInteger(body.amount) || body.amount <= 0) {
      return error(422, "Invalid amount");
    }
    const extra = (body.extra ?? {}) as Json;
    const account = this.accounts.find(
      ({ account: candidate }) =>
        candidate.id === extra.from &&
        candidate.scope_id === extra.uid &&
        candidate.type === "lightning"
    );
    const { pr, paymentHash } = this.invoice(
      BigInt(body.amount),
      typeof body.comment === "string" ? body.comment.slice(0, 200) : ""
    );
    const validates = account !== undefined && body.amount === 1000;
    this.invoices.set(paymentHash, {
      pr,
      accountId: validates ? (account.account.id as string) : null,
      orderId: null,
      paidAt: null
    });
    return json(200, { payment_request: pr });
  }

  /** An invoice of `amountMsat`, as `tamperInvoice` may spoil it. */
  private invoice(amountMsat: bigint, description: string): { pr: string; paymentHash: string } {
    const tamper = this.tamperInvoice;
    return fakeInvoice({
      amountMsat: Number(tamper === "otherAmount" ? amountMsat * 2n : amountMsat),
      network: tamper === "otherNetwork" ? "tb" : "bc",
      description,
      timestamp:
        Math.floor(this.now() / 1000) -
        (tamper === "expired" ? 2 * FAKE_INVOICE_EXPIRY_SECONDS : 0),
      expirySeconds: FAKE_INVOICE_EXPIRY_SECONDS
    });
  }

  /**
   * A sale of `sats` at the fake's rate, its fees taken in sats as Mt Pelerin's dev/test does
   * (`fees.currency: "sat"`, `side: "in"`): the fees in sats, what is wired in
   * centimes (rounded down), the rate of 1 sat as a text.
   */
  private priced(sats: bigint): { feeSats: bigint; net: bigint; rate: string } {
    const feeSats = (sats * this.feePerMille + 999n) / 1000n;
    const net = ((sats - feeSats) * this.chfPerBtc * 100n) / 100_000_000n;
    const rate = (Number(this.chfPerBtc) / 1e8).toFixed(8);
    return { feeSats, net, rate };
  }

  /** `cents` / `rate`, to 8 decimals: Mt Pelerin's `source_amount`, back from the francs. */
  private sourceOf(net: bigint): string {
    const scaled = (net * 1_000_000_000_000n) / this.chfPerBtc;
    const whole = scaled / 100_000_000n;
    return `${whole}.${(scaled % 100_000_000n).toString().padStart(8, "0")}`;
  }

  /** The sats of a sell's body: "sat" on Lightning, a whole number above 0. */
  private sellSats(currency: unknown, network: unknown, amount: unknown): bigint | null {
    if (currency !== "sat" || network !== "lightning_mainnet") return null;
    const text = typeof amount === "number" ? String(amount) : amount;
    if (typeof text !== "string" || !/^[1-9][0-9]{0,15}$/.test(text)) return null;
    return BigInt(text);
  }

  /**
   * `POST /orders/estimate`, of a sell from Lightning into a currency the fake has a rate
   * for: as on Mt Pelerin's dev/test, another is refused (400 "Rate for satXYZ not
   * found"). Every currency at the fake's one rate (`chfPerBtc`), its amount to the cent: as
   * dev/test did, JPY included.
   */
  private estimate(user: string, body: Json): MtpResponse {
    if (!this.persons.has(user)) return error(404, "Person not found");
    const sats = this.sellSats(body.source_currency, body.source_network, body.amount_in);
    if (sats === null) return error(400, "Invalid amount or currency");
    if (typeof body.dest_currency !== "string" || !RATED.includes(body.dest_currency)) {
      return error(400, `Rate for sat${String(body.dest_currency)} not found`);
    }
    return json(200, this.estimateOf(sats, body.dest_currency));
  }

  private estimateOf(sats: bigint, currency: string): Json {
    const { feeSats, net, rate } = this.priced(sats);
    return {
      type: "sell",
      sourceCurrency: "sat",
      sourceNetwork: "lightning_mainnet",
      destCurrency: currency,
      destNetwork: "fiat",
      sourceAmount: sats.toString(),
      destAmount: chf(net),
      exchangeRate: { mid: rate, effective: rate },
      fees: { total: feeSats.toString(), currency: "sat", side: "in", rate: 0.013 }
    };
  }

  private newOrder(
    userId: string,
    {
      sats,
      currency,
      beneficiaryId,
      reference,
      oid,
      wid,
      deferred = false,
      at
    }: {
      sats: bigint;
      currency: string;
      beneficiaryId: string;
      reference: string;
      oid: string;
      /** `wid`, "stored on the order under `options`"; null when the order gave none. */
      wid: string | null;
      /** `withdraw: "manual"`. */
      deferred?: boolean;
      at: number;
    }
  ): Json {
    const { net, rate } = this.priced(sats);
    const id = newId().slice(0, 32);
    const { pr, paymentHash } = this.invoice(sats * 1000n, `Mt Pelerin order ${id.slice(0, 8)}`);
    const order: Json = {
      id,
      short_id: newId().slice(0, 6),
      // As Mt Pelerin's dev/test answers: a sell "fixing" and "validated" before any funds; a
      // deferred one "spot" and "pending", its `source_amount` the sats asked.
      type: deferred ? "spot" : "fixing",
      status: deferred ? "pending" : "validated",
      user_id: userId,
      scope_id: userId,
      source_amount: deferred ? sats.toString() : this.sourceOf(net),
      source_amount_with_fees: sats.toString(),
      source_currency: "sat",
      network: "lightning_mainnet",
      dest_amount: chf(net),
      dest_currency: currency,
      rate,
      expiration_date: new Date(at + ORDER_LOCK_MS).toISOString(),
      creation_date: new Date(at).toISOString(),
      modification_date: new Date(at).toISOString(),
      beneficiary_id: beneficiaryId,
      reference,
      options: wid === null ? { oid } : { oid, wid },
      // "The order already holds its payment hash": its invoice's, as on dev/test.
      hash: paymentHash,
      invoice: pr,
      rampAddr: "mtpelerin@ln.mtpelerin.com",
      estimate: {
        ...this.estimateOf(sats, currency),
        sourceAmount: (this.tamperOrder ? sats + 1n : sats).toString()
      }
    };
    this.orders.push({ userId, order, transaction: null });
    this.invoices.set(paymentHash, { pr, accountId: null, orderId: id, paidAt: null });
    return order;
  }

  /**
   * `POST /orders/create`: a sell to one of the profile's bank accounts. As on Mt Pelerin's
   * dev/test, a bank account still `pending_validation` takes it, and neither
   * the Lightning address's proof nor anything else is asked: the app sells only once proven.
   */
  private createOrder(user: string, body: Json): MtpResponse {
    if (!this.persons.has(user)) return error(404, "Person not found");
    const sats = this.sellSats(body.currency_in, body.network_in, body.amount_in);
    if (sats === null) return error(400, "Invalid amount or currency");
    const bank = this.accounts.find(
      ({ userId, account }) =>
        userId === user && account.id === body.beneficiary_id && account.type === "external"
    );
    if (!bank || !["active", "pending_validation"].includes(bank.account.status as string)) {
      return error(400, "Invalid beneficiary");
    }
    if (bank.account.currency !== body.currency_out) return error(400, "Currency mismatch");
    if (!RATED.includes(body.currency_out as string)) {
      return error(400, `Rate for sat${String(body.currency_out)} not found`);
    }
    if (typeof body.reference !== "string" || !/^[A-Z0-9 /-]{1,35}$/.test(body.reference)) {
      return error(400, "Invalid reference");
    }
    const order = this.newOrder(user, {
      sats,
      currency: body.currency_out as string,
      beneficiaryId: body.beneficiary_id as string,
      reference: body.reference,
      oid: typeof body.oid === "string" ? body.oid : "",
      wid: typeof body.wid === "string" ? body.wid : null,
      deferred: body.withdraw === "manual",
      at: this.now()
    });
    return json(200, order);
  }

  /** A row of the list: as dev/test's, without the order's invoice. */
  private withTransaction({ order: created, transaction }: FakeOrder): Json {
    const { invoice: _invoice, ...order } = created;
    if (transaction === null) return { ...order };
    return {
      ...order,
      transaction_id: newId(),
      transaction_group_id: transaction.transaction_group_id,
      transaction: { status: transaction.current_status }
    };
  }

  /** `GET /orders/status`: by creation date in [fromDate, toDate), 20 a page at most. */
  private listOrders(user: string, query: Record<string, string> | undefined): MtpResponse {
    const day = (text: string | undefined) =>
      text && /^\d{4}-\d{2}-\d{2}$/.test(text) ? Date.parse(`${text}T00:00:00Z`) : null;
    const from = day(query?.fromDate) ?? this.now() - 7 * 24 * 60 * 60_000;
    const to = day(query?.toDate) ?? from + 7 * 24 * 60 * 60_000;
    const skip = Number(query?.skip ?? "0");
    const limit = Math.min(Number(query?.limit ?? "20"), 20);
    const matching = this.orders
      .filter(({ userId, order }) => {
        const created = Date.parse(order.creation_date as string);
        return (
          userId === user &&
          created >= from &&
          created < to &&
          (query?.orderId === undefined || order.id === query.orderId)
        );
      })
      .map((entry) => this.withTransaction(entry));
    return json(200, {
      filters: { orderId: query?.orderId ?? null, skip, limit },
      orders: matching.slice(skip, skip + limit)
    });
  }

  /**
   * `GET /orders/{beneficiary_id}/balances`: the francs of the bank account's deferred sells
   * that Mt Pelerin received the sats of and has not wired yet, by currency: "only `validated`
   * deferred sells are counted" (nothing can be paid on dev/test).
   */
  private balances(user: string, beneficiaryId: string): MtpResponse {
    const held = new Map<string, bigint>();
    for (const { userId, order } of this.orders) {
      if (userId !== user || order.beneficiary_id !== beneficiaryId || order.type !== "spot")
        continue;
      if (order.status !== "validated") continue;
      const [whole = "0", cents = ""] = String(order.dest_amount).split(".");
      const minor = BigInt(whole) * 100n + BigInt(cents.padEnd(2, "0").slice(0, 2));
      const currency = order.dest_currency as string;
      held.set(currency, (held.get(currency) ?? 0n) + minor);
    }
    return json(
      200,
      Object.fromEntries(
        [...held].map(([currency, minor]) => [
          currency,
          { total: chf(minor), by_source_currency: { sat: chf(minor) } }
        ])
      )
    );
  }

  /**
   * `GET /transactions/status?orderId=…&scopeId=…`: `{ "order": … }` alone without funds.
   * `scopeId` as production asks for it ("scopeId must be provided" without it), the
   * token as dev/test does; an order of another profile's scope is unknown.
   */
  private transactionStatus(user: string, query: Record<string, string> | undefined): MtpResponse {
    const scopeId = query?.scopeId;
    if (!scopeId) return error(400, "scopeId must be provided");
    const entry = this.orders.find(
      ({ userId, order }) => userId === user && userId === scopeId && order.id === query.orderId
    );
    if (!entry) return error(404, "Order not found");
    const { order, transaction } = entry;
    const ordered = { id: order.id, type: order.type, status: order.status };
    if (transaction === null) return json(200, { order: ordered });
    return json(200, {
      order: ordered,
      ...transaction,
      source_amount: order.source_amount,
      source_currency: order.source_currency,
      dest_amount: order.dest_amount,
      dest_currency: order.dest_currency,
      rate: order.rate,
      creation_date: order.creation_date
    });
  }
}
