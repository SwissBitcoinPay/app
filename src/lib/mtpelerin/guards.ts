import { compactIban, isValidIban } from "@/lib/iban";
import { normalizeLightningAddress } from "@/lib/lightning/lnurl";

import { readDecimal, type MtpDecimal } from "./decimal";
import { MtPelerinError, placed } from "./errors";
import type {
  MtpAccount,
  MtpAccountOwner,
  MtpAsset,
  MtpBalances,
  MtpConfig,
  MtpDevice,
  MtpEstimate,
  MtpLightningInvoice,
  MtpNetwork,
  MtpOrder,
  MtpOrdersPage,
  MtpAccountOwnerName,
  MtpPerson,
  MtpPersonType,
  MtpReferral,
  MtpSellOrder,
  MtpTokens,
  MtpTransactionStatus,
  MtpUnreadableAccount
} from "./types";

/*
 * The guards of Mt Pelerin's answers: each answer the app uses is read
 * here, field by field, before anything is shown, sent or paid from it. A field "Sell" needs
 * that is missing or of another type refuses the whole answer (MtPelerinError "malformed"): a list
 * of sales with one unreadable order is never shown without it, which could understate what was
 * sold this month. One exception, the list of accounts (`readAccounts`): an account it cannot read
 * is kept as "unreadable", never shown nor wired to, and its callers never tell the list
 * complete with it (flow.ts); one account of many that Mt Pelerin wrote another way (created
 * elsewhere than in the app) no longer stops every sale. Fields the flow does not use are not
 * read. The profile's and an account's failures name their field (MtPelerinError's `field`), for
 * the journal: never its value. Pure.
 */

type Json = Record<string, unknown>;

function malformed(): never {
  throw new MtPelerinError("malformed");
}

function object(value: unknown): Json {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return malformed();
  return value as Json;
}

/** Reads a field of an object: `read` gets its value, its failure names the field. */
type FieldReader = <T>(name: string, read: (value: unknown) => T) => T;

/**
 * The fields of `v`, read one by one by name: a failure is MtPelerinError "malformed" with that
 * name as its `field` (the code's own name, never the value).
 */
function fieldsOf(v: Json): FieldReader {
  return (name, read) => {
    try {
      return read(v[name]);
    } catch (error) {
      throw placed(error, { field: name });
    }
  };
}

/** An identifier: a non-empty text of letters, digits and `-`, at most 128 characters. */
function id(value: unknown): string {
  return typeof value === "string" && /^[A-Za-z0-9-]{1,128}$/.test(value) ? value : malformed();
}

function text(value: unknown, max = 256): string {
  return typeof value === "string" && value.length > 0 && value.length <= max ? value : malformed();
}

/** A text, or null when absent, null or empty. */
function optionalText(value: unknown, max = 256): string | null {
  if (value === undefined || value === null || value === "") return null;
  return text(value, max);
}

function optionalId(value: unknown): string | null {
  return value === undefined || value === null ? null : id(value);
}

/** A JWT's characters (base64url and dots), as long as a token gets. */
function token(value: unknown): string {
  return typeof value === "string" && /^[A-Za-z0-9._~+/=-]{16,8192}$/.test(value)
    ? value
    : malformed();
}

function personType(value: unknown): MtpPersonType {
  return value === "user" || value === "company" ? value : malformed();
}

/** E.164: "+" then up to 15 digits. */
export function isE164(value: unknown): value is string {
  return typeof value === "string" && /^\+[1-9][0-9]{6,14}$/.test(value);
}

/** ISO 4217 (`currency`): three capitals. */
function currencyCode(value: unknown): string {
  return typeof value === "string" && /^[A-Z]{3}$/.test(value) ? value : malformed();
}

/** An asset's code as orders write it: "CHF", "sat", "USDT". */
function assetCode(value: unknown): string {
  return typeof value === "string" && /^[A-Za-z0-9]{1,16}$/.test(value) ? value : malformed();
}

function decimal(value: unknown): MtpDecimal {
  return readDecimal(value) ?? malformed();
}

/** An ISO 8601 date and time (`2026-05-22T11:23:01.000Z`), as Unix seconds. */
function seconds(value: unknown): number {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/.test(value)
  ) {
    return malformed();
  }
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : malformed();
}

function optionalSeconds(value: unknown): number | null {
  return value === undefined || value === null ? null : seconds(value);
}

/** A rate (a price, never an amount): a decimal above 0, a number or a text ("0.00066446"). */
function optionalRate(value: unknown): MtpDecimal | null {
  if (value === undefined || value === null) return null;
  const rate = decimal(value);
  return rate.units > 0n ? rate : malformed();
}

/** A status word (`pending`, `waiting_refund`), null when absent. */
function optionalStatus(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return typeof value === "string" && /^[a-z_]{1,32}$/.test(value) ? value : malformed();
}

/**
 * `POST /devices/add`: its id and its user's, all the app uses. Its `status` is not
 * asked for: the documented answer has one, dev/test's has none, and an answer refused
 * for it would end every login.
 */
export function readDevice(value: unknown): MtpDevice {
  const v = object(value);
  return { id: id(v.id), userId: id(v.user_id) };
}

/** `{ "status": "SUCCESS" }`, nothing else counts as sent. */
export function readSmsSent(value: unknown): void {
  if (object(value).status !== "SUCCESS") malformed();
}

/** The session's pair. */
export function readTokens(value: unknown): MtpTokens {
  const v = object(value);
  return { accessToken: token(v.access_token), refreshToken: token(v.refresh_token) };
}

/** The profile (`findOne`, `PUT`, `PATCH`). */
export function readPerson(value: unknown): MtpPerson {
  const field = fieldsOf(object(value));
  const phone = field("phone", (v) => optionalText(v, 32));
  return {
    id: field("id", id),
    userId: field("user_id", id),
    scopeId: field("scope_id", id),
    type: field("type", personType),
    email: field("email", (v) => optionalText(v)),
    // A number that is no E.164 is as good as none: the profile still needs one.
    phone: phone !== null && isE164(phone) ? phone : null,
    language: field("language", (v) => optionalText(v, 8)),
    kycLevel: field("kycLevel", kycLevel)
  };
}

/** `kycLevel`: a small whole number; anything else is read as 0, never as verified. */
function kycLevel(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 99
    ? value
    : 0;
}

/** A name's text, trimmed; null when absent, null or blank. */
function optionalName(value: unknown): string | null {
  const name = optionalText(value)?.trim() ?? "";
  return name === "" ? null : name;
}

/**
 * The owner's name: the company's, else the person's two names, else the one of them Mt Pelerin
 * has (`unsaid`: the whole name in one field). None at all: refused, on `owner_firstname`.
 */
function ownerName(field: FieldReader): MtpAccountOwnerName {
  const company = field("owner_companyname", (v) => optionalText(v));
  if (company !== null) return { kind: "company", name: company };
  const firstname = field("owner_firstname", optionalName);
  const lastname = field("owner_lastname", optionalName);
  if (firstname !== null && lastname !== null) return { kind: "person", firstname, lastname };
  const name = firstname ?? lastname;
  return name === null ? field("owner_firstname", malformed) : { kind: "unsaid", name };
}

/** ISO 3166-1 alpha-2, or null when absent. */
function optionalCountry(value: unknown): string | null {
  const country = optionalText(value, 2);
  return country === null || /^[A-Z]{2}$/.test(country) ? country : malformed();
}

/** The owner's name and address. */
function owner(field: FieldReader): MtpAccountOwner {
  return {
    name: ownerName(field),
    street: field("owner_street", (v) => optionalText(v)),
    postcode: field("owner_postcode", (v) => optionalText(v, 32)),
    city: field("owner_city", (v) => optionalText(v)),
    country: field("owner_country", optionalCountry)
  };
}

/** A Lightning address (`crypto_address`), lowercase. */
function lightningAddress(value: unknown): string {
  return normalizeLightningAddress(text(value)) ?? malformed();
}

/** An IBAN, compact, its checksum checked: one that fails it is never offered to be wired to. */
function iban(value: unknown): string {
  const written = text(value, 64);
  return isValidIban(written) ? compactIban(written) : malformed();
}

/**
 * One account. A Lightning account, a bank account, or another kept by its type only. Its
 * failure names the field it could not read.
 */
export function readAccount(value: unknown): MtpAccount {
  const field = fieldsOf(object(value));
  const type = field("type", (v) => text(v, 32));
  const status = field("status", (v) => text(v, 32));
  if (type === "lightning") {
    return {
      kind: "lightning",
      id: field("id", id),
      status,
      cryptoAddress: field("crypto_address", lightningAddress),
      scopeId: field("scope_id", optionalId)
    };
  }
  if (type === "external") {
    return {
      kind: "bank",
      id: field("id", id),
      status,
      iban: field("iban", iban),
      currency: field("currency", currencyCode),
      label: field("reference", (v) => optionalText(v, 128)),
      owner: owner(field)
    };
  }
  return { kind: "other", id: field("id", id), type, status };
}

/** An account of a list that `readAccount` refuses: the field it names, nothing else. */
function unreadableAccount(error: unknown): MtpUnreadableAccount {
  // Only what the guards refuse: anything else is no answer of Mt Pelerin's, and fails the list.
  if (!(error instanceof MtPelerinError) || error.code !== "malformed") throw error;
  return { kind: "unreadable", field: error.field };
}

/**
 * `GET /accounts`: the list, every account read; one that cannot be is kept as "unreadable"
 * (MtpUnreadableAccount), never as one of the others. A list that is no list, or longer than any
 * profile's, is refused whole.
 */
export function readAccounts(value: unknown): MtpAccount[] {
  if (!Array.isArray(value) || value.length > 500) return malformed();
  return value.map((entry) => {
    try {
      return readAccount(entry);
    } catch (error) {
      return unreadableAccount(error);
    }
  });
}

function asset(value: unknown): MtpAsset {
  const v = object(value);
  const decimals = v.decimals;
  if (typeof decimals !== "number" || !Number.isSafeInteger(decimals) || decimals < 0) {
    return malformed();
  }
  return { asset: text(v.asset, 16), symbol: text(v.symbol, 32), decimals };
}

function network(value: unknown): MtpNetwork {
  const v = object(value);
  if (!Array.isArray(v.assets) || v.assets.length > 256) return malformed();
  return {
    id: text(v.id, 64),
    name: optionalText(v.name, 64),
    family: text(v.family, 32),
    accountType: optionalText(v.accountType, 32),
    assets: v.assets.map(asset)
  };
}

/** `GET /forms/mtp-config`. */
export function readConfig(value: unknown): MtpConfig {
  const v = object(value);
  if (!Array.isArray(v.networks) || v.networks.length > 256) return malformed();
  return { networks: v.networks.map(network) };
}

/** `POST /referrals/create`. */
export function readReferral(value: unknown): MtpReferral {
  const v = object(value);
  return { id: id(v.id), status: text(v.status, 32) };
}

/** `POST /ethereum/ln/pr`: `payment_request`, checked as an invoice later (invoice.ts). */
export function readLightningInvoice(value: unknown): MtpLightningInvoice {
  return { paymentRequest: text(object(value).payment_request, 4096) };
}

function fees(value: unknown): MtpEstimate["fees"] {
  const v = object(value);
  return { total: decimal(v.total), currency: assetCode(v.currency) };
}

/** `POST /orders/estimate`. */
export function readEstimate(value: unknown): MtpEstimate {
  const v = object(value);
  const exchange =
    v.exchangeRate === undefined || v.exchangeRate === null ? null : object(v.exchangeRate);
  return {
    sourceCurrency: assetCode(v.sourceCurrency),
    destCurrency: assetCode(v.destCurrency),
    sourceAmount: decimal(v.sourceAmount),
    destAmount: decimal(v.destAmount),
    fees: fees(v.fees),
    rate: exchange === null ? null : optionalRate(exchange.mid)
  };
}

/** `POST /orders/create` of a sell on Lightning: its `invoice` is required. */
export function readSellOrder(value: unknown): MtpSellOrder {
  const v = object(value);
  const estimate = v.estimate === undefined || v.estimate === null ? null : object(v.estimate);
  // `estimate` read, `fees` and `sourceAmount` only: the rest is Mt Pelerin's pricing's.
  return {
    id: id(v.id),
    shortId: text(v.short_id, 32),
    status: text(v.status, 32),
    sourceCurrency: assetCode(v.source_currency),
    sourceAmount: decimal(v.source_amount),
    destCurrency: assetCode(v.dest_currency),
    destAmount: decimal(v.dest_amount),
    expiresAt: seconds(v.expiration_date),
    rate: optionalRate(v.rate),
    beneficiaryId: id(v.beneficiary_id),
    invoice: text(v.invoice, 4096),
    estimate:
      estimate === null
        ? null
        : { sourceAmount: decimal(estimate.sourceAmount), fees: fees(estimate.fees) }
  };
}

/**
 * `options.oid`: the app's own reference of the order, null for none or one out of shape (an
 * order of another integration: its list is still read).
 */
function orderOid(options: unknown): string | null {
  if (options === null || typeof options !== "object" || Array.isArray(options)) return null;
  const { oid } = options as Json;
  return typeof oid === "string" && /^[\x21-\x7e]{1,128}$/.test(oid) ? oid : null;
}

/** `hash`: a Lightning payment hash, in lowercase; null for anything else. */
function paymentHash(value: unknown): string | null {
  return typeof value === "string" && /^[0-9a-fA-F]{64}$/.test(value) ? value.toLowerCase() : null;
}

function order(value: unknown): MtpOrder {
  const v = object(value);
  const transaction =
    v.transaction === undefined || v.transaction === null ? null : object(v.transaction);
  return {
    id: id(v.id),
    shortId: text(v.short_id, 32),
    type: text(v.type, 32),
    status: text(v.status, 32),
    sourceCurrency: assetCode(v.source_currency),
    sourceAmount: decimal(v.source_amount),
    destCurrency: assetCode(v.dest_currency),
    destAmount: decimal(v.dest_amount),
    sourceWithFees:
      v.source_amount_with_fees === undefined || v.source_amount_with_fees === null
        ? null
        : decimal(v.source_amount_with_fees),
    rate: optionalRate(v.rate),
    network: optionalText(v.network, 64),
    beneficiaryId: optionalId(v.beneficiary_id),
    createdAt: seconds(v.creation_date),
    expiresAt: optionalSeconds(v.expiration_date),
    transactionStatus: transaction === null ? null : optionalStatus(transaction.status),
    oid: orderOid(v.options),
    paymentHash: paymentHash(v.hash)
  };
}

/** `GET /orders/{beneficiary_id}/balances`: `{ "CHF": { "total": "137.50", … } }`. */
export function readBalances(value: unknown): MtpBalances {
  const entries = Object.entries(object(value));
  if (entries.length > 64) return malformed();
  return entries.map(([currency, held]) => ({
    currency: currencyCode(currency),
    total: decimal(object(held).total)
  }));
}

/** `GET /orders/status`: at most 20 orders a page. */
export function readOrdersPage(value: unknown): MtpOrdersPage {
  const v = object(value);
  if (!Array.isArray(v.orders) || v.orders.length > 20) return malformed();
  return { orders: v.orders.map(order) };
}

/** `GET /transactions/status?orderId=…`. */
export function readTransactionStatus(value: unknown): MtpTransactionStatus {
  const v = object(value);
  const ordered = object(v.order);
  const groupId = optionalId(v.transaction_group_id);
  const destAmount =
    v.dest_amount === undefined || v.dest_amount === null ? null : decimal(v.dest_amount);
  return {
    orderId: id(ordered.id),
    orderStatus: text(ordered.status, 32),
    orderType: optionalText(ordered.type, 32),
    groupId,
    currentStatus: optionalStatus(v.current_status),
    inStatus: optionalStatus(v.in_status),
    forexStatus: optionalStatus(v.forex_status),
    outStatus: optionalStatus(v.out_status),
    destAmount,
    destCurrency: destAmount === null ? null : assetCode(v.dest_currency),
    destIdentifier: optionalId(v.dest_identifier)
  };
}
