import type { MtpDecimal } from "./decimal";

/*
 * What Mt Pelerin's API answers, as the app reads it, once its
 * guards checked it (guards.ts): only the fields "Sell" uses, camel-cased. Amounts are exact
 * decimals (decimal.ts), turned into sats and minor units by their callers.
 */

/** `POST /devices/add`: the device to send the SMS to and authenticate. */
export type MtpDevice = {
  /** Both the device's id and, for a wallet login, the value to sign. */
  id: string;
  userId: string;
  // No `status` ("new" or "active"): Mt Pelerin says never to branch on it, and dev/test's
  // answer has none (`confirmed`, `locked` and `revoked` in its place).
};

/** The session. Never logged, never shown. */
export type MtpTokens = {
  /** The JWT of `Authorization: Bearer`, 1 hour. In memory only. */
  accessToken: string;
  /** 30 days of rotation, in the device's secure storage (session-store.ts). */
  refreshToken: string;
};

/** `type`. "Sell" creates `user` profiles only (the default type). */
export type MtpPersonType = "user" | "company";

/** `GET /persons/findOne`. */
export type MtpPerson = {
  id: string;
  userId: string;
  /** The user's scope: `extra.uid` of the 1-sat invoice when the account carries none. */
  scopeId: string;
  type: MtpPersonType;
  /** Null until set. */
  email: string | null;
  phone: string | null;
  language: string | null;
  /**
   * `kycLevel`: 0 until Mt Pelerin approved the identity (2 for a person, 4 for a company); 0 too
   * when the answer gives none, or one out of shape: never more than it says.
   */
  kycLevel: number;
};

/** An account's status. Others than these two are kept as they come, never guessed. */
export type MtpAccountStatus = "pending_validation" | "active" | (string & {});

/** The merchant's Lightning address, as an account. */
export type MtpLightningAccount = {
  kind: "lightning";
  id: string;
  status: MtpAccountStatus;
  /** The Lightning address, lowercase. */
  cryptoAddress: string;
  /** `extra.uid`: its `scope_id`, when the account carries one. */
  scopeId: string | null;
};

/** The owner's name: a person's first and last names, or a company's name. */
export type MtpOwnerName =
  { kind: "person"; firstname: string; lastname: string } | { kind: "company"; name: string };

/**
 * An account's holder as Mt Pelerin lists it: as documented, or one name alone in one of the
 * person's two fields (`unsaid`, trimmed), not saying whether a person or a company. Accounts
 * registered elsewhere than in the app (a company's, in production) have the whole
 * name in `owner_firstname` and no `owner_lastname`.
 */
export type MtpAccountOwnerName = MtpOwnerName | { kind: "unsaid"; name: string };

/** The owner's name and address, as Mt Pelerin registered them (its lines may be missing). */
export type MtpAccountOwner = {
  name: MtpAccountOwnerName;
  street: string | null;
  postcode: string | null;
  city: string | null;
  /** ISO 3166-1 alpha-2. */
  country: string | null;
};

/** A bank account (`type: "external"`), where a sale's francs are wired. */
export type MtpBankAccount = {
  kind: "bank";
  id: string;
  status: MtpAccountStatus;
  /** Compact, its checksum checked (guards.ts). */
  iban: string;
  /** ISO 4217: the currency the sale is wired in (`currency_out`). */
  currency: string;
  /** `reference`: the merchant's name of the account, null without one. */
  label: string | null;
  owner: MtpAccountOwner;
};

/** Any other account of the profile (an EVM wallet, a personal IBAN…): not this flow's. */
export type MtpOtherAccount = { kind: "other"; id: string; type: string; status: MtpAccountStatus };

/**
 * An account of a list that the guards could not read (guards.ts `readAccounts`): never
 * shown nor wired to, but known to be there, so that a list without it is never told complete.
 * `field`: the first field it could not read (`owner_lastname`), null for an entry that is no
 * object. Nothing else of it is kept.
 */
export type MtpUnreadableAccount = { kind: "unreadable"; field: string | null };

export type MtpAccount =
  MtpLightningAccount | MtpBankAccount | MtpOtherAccount | MtpUnreadableAccount;

/** `networks[].assets[]`. */
export type MtpAsset = { asset: string; symbol: string; decimals: number };

/** `networks[]`. */
export type MtpNetwork = {
  id: string;
  name: string | null;
  family: string;
  /** The `type` of an account on this network. */
  accountType: string | null;
  assets: MtpAsset[];
};

/** `GET /forms/mtp-config`. */
export type MtpConfig = { networks: MtpNetwork[] };

/** A referral, `pending` until Mt Pelerin validates it. */
export type MtpReferral = { id: string; status: string };

/** The 1-sat invoice: the bolt11 invoice, unchecked (invoice.ts checks it). */
export type MtpLightningInvoice = { paymentRequest: string };

/** `POST /orders/estimate`: indicative, guaranteed only once the order is created. */
export type MtpEstimate = {
  sourceCurrency: string;
  destCurrency: string;
  sourceAmount: MtpDecimal;
  destAmount: MtpDecimal;
  /** `fees.total`, in `fees.currency` (the source's or the destination's: read, never assumed). */
  fees: { total: MtpDecimal; currency: string };
  /** `exchangeRate.mid`: destination per source unit, before fees (the price of 1 sat). */
  rate: MtpDecimal | null;
};

/** An order's status. Others are kept as they come. */
export type MtpOrderStatus =
  "pending" | "validated" | "finished" | "cancelled" | "rejected" | (string & {});

/** The sell order created, its rate locked until `expiresAt`. */
export type MtpSellOrder = {
  id: string;
  shortId: string;
  status: MtpOrderStatus;
  sourceCurrency: string;
  sourceAmount: MtpDecimal;
  destCurrency: string;
  destAmount: MtpDecimal;
  /** Unix seconds: the order's creation + 60 min for a sell, the locked-rate deadline. */
  expiresAt: number;
  /** `rate`: destination per source unit, before fees (the price of 1 sat). Null without one. */
  rate: MtpDecimal | null;
  beneficiaryId: string;
  /** On Lightning: the bolt11 invoice to pay, unchecked (sale.ts checks it). */
  invoice: string;
  /**
   * `estimate` of the order created (it carries the fee breakdown), null without: its source
   * amount is what was asked (`source_amount` is Mt Pelerin's own, back from the francs: once
   * 9993.077 for 10 000 sats asked).
   */
  estimate: Pick<MtpEstimate, "sourceAmount" | "fees"> | null;
};

/** `GET /orders/status`: one order of the list. */
export type MtpOrder = {
  id: string;
  shortId: string;
  type: string;
  status: MtpOrderStatus;
  sourceCurrency: string;
  sourceAmount: MtpDecimal;
  destCurrency: string;
  destAmount: MtpDecimal;
  /** `source_amount_with_fees`, when given: what the sale counts with its fees. */
  sourceWithFees: MtpDecimal | null;
  /** `rate`: destination per source unit, before fees. Null without one. */
  rate: MtpDecimal | null;
  /** `network`: the source's network of a sell (`lightning_mainnet`), null otherwise. */
  network: string | null;
  beneficiaryId: string | null;
  /** Unix seconds. */
  createdAt: number;
  expiresAt: number | null;
  /**
   * The nested `transaction`'s `status` (`current_status`), null while none exists: as for a
   * deferred sell paid, whose francs wait for the grouped transfer (sale.ts deferredSellFunded).
   */
  transactionStatus: string | null;
  /**
   * `options.oid`: the reference the app gave the order (`oid`), null without one. The list
   * gives it back on dev/test.
   */
  oid: string | null;
  /**
   * `hash`: the payment hash of the order's Lightning invoice (lowercase hex; the order already
   * holds its payment hash, the same as its invoice's on dev/test), null
   * without one.
   */
  paymentHash: string | null;
};

/** A page of the list. */
export type MtpOrdersPage = { orders: MtpOrder[] };

/** `GET /transactions/status`: an order's progress. */
export type MtpTransactionStatus = {
  orderId: string;
  orderStatus: MtpOrderStatus;
  /** The order's `type` ("fixing", "spot" for a deferred sell…), null when not given. */
  orderType: string | null;
  /**
   * Null: only `{ "order": … }`, no transaction. No funds received yet, but for a deferred sell
   * paid, which has none while its francs wait for the grouped transfer (sale.ts
   * deferredSellFunded).
   */
  groupId: string | null;
  currentStatus: string | null;
  inStatus: string | null;
  forexStatus: string | null;
  outStatus: string | null;
  destAmount: MtpDecimal | null;
  destCurrency: string | null;
  /** `dest_identifier` (holds and refunds). */
  destIdentifier: string | null;
};

/** What the app writes on a profile (`PUT /persons`, `PATCH /persons/{personId}`). */
export type MtpPersonFields = {
  type?: MtpPersonType;
  email?: string;
  phone?: string;
  language?: string;
};

/** The Lightning account the app creates (`PUT /accounts`). */
export type MtpNewLightningAccount = {
  type: "lightning";
  bank_code: string;
  bank_name: string;
  currency: string;
  crypto_address: string;
  /** A random integer between 1000 and 9999, sent as a string (verification-code.ts). */
  verification_code: string;
  user_is_owner: true;
};

/**
 * A bank account to add (`PUT /accounts`). `user_is_owner` is always `true`, a company's
 * account included (as Mt Pelerin answered): its holder is the merchant.
 */
export type MtpNewBankAccount = {
  type: "external";
  reference: string;
  iban: string;
  currency: string;
  owner_firstname?: string;
  owner_lastname?: string;
  owner_companyname?: string;
  owner_street: string;
  owner_postcode: string;
  owner_city: string;
  owner_country: string;
  user_is_owner: true;
};

/**
 * A bank account's holder and address changed (`PATCH /accounts/{id}`). Undocumented: Mt
 * Pelerin's dev/test changes only the fields sent, `null` clearing the other kind's names.
 * Never the IBAN, the currency, the status nor `user_is_owner`: another IBAN or currency is another
 * account, and its status is Mt Pelerin's.
 */
export type MtpBankAccountChange = {
  owner_firstname: string | null;
  owner_lastname: string | null;
  owner_companyname: string | null;
  owner_street: string;
  owner_postcode: string;
  owner_city: string;
  owner_country: string;
  /** The account's label, only while it was the holder's name the app gave it (accounts.ts). */
  reference?: string;
};

/** A sell from the merchant's Lightning wallet into `currency_out`. */
export type MtpNewSellOrder = {
  beneficiary_id: string;
  currency_in: string;
  currency_out: string;
  /** In `currency_in`'s units: sats, as a whole number. */
  amount_in: number;
  network_in: string;
  /** The bank transfer's communication, at most 35 characters of `A-Z0-9 -/`. */
  reference: string;
  /** `oid`: the app's own reference of the order. */
  oid: string;
  /** `wid`: the integration the order comes from (MTPELERIN_WID). */
  wid: string;
  /**
   * A deferred sell. Its francs join the balance Mt Pelerin holds for the bank account and
   * leave in one transfer once that balance reaches Mt Pelerin's threshold. Absent: wired at once.
   */
  withdraw?: "manual";
};

/**
 * `GET /orders/{beneficiary_id}/balances`: what Mt Pelerin holds for a bank account from its
 * deferred sells, by currency (only `validated` deferred sells are counted); none: nothing held.
 */
export type MtpBalances = { currency: string; total: MtpDecimal }[];
