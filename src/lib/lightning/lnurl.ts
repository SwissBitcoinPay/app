import { bytesToUtf8 } from "@noble/ciphers/utils.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";

import { getWithTimeout, type GetOptions } from "@/lib/http";

import { decodeBech32, wordsToBytes } from "./bech32";
import { decodeBolt11, type Bolt11 } from "./bolt11";

/*
 * LNURL client of the point of sale: LUD-06 / LUD-16 (pay to a Lightning address), LUD-12
 * (comment), LUD-21 (verify) and LUD-03 (withdraw, for BoltCards). Plain HTTPS requests: no wallet
 * is needed to take a payment. The Lightning address is the merchant's, registered on the Breez
 * LNURL server when the account is activated on this device (src/features/terminal/activate.ts):
 * that server creates the invoices for the merchant's Spark identity key, even while the merchant's
 * wallet is offline.
 */

/** Per request: the payer is waiting at the counter. */
export const LNURL_TIMEOUT_MS = 10_000;

export type LnurlErrorCode =
  /** No answer, or an HTTP error: network down, server unreachable. */
  | "network"
  /** The service answered `{"status":"ERROR"}`: its reason is in `reason`. */
  | "service"
  /**
   * LUD-03: the invoice's amount is out of what the withdraw request allows; refused here, before
   * anything is asked of the card's service.
   */
  | "outOfRange"
  /** An answer that does not follow the spec, or an invoice that does not match the request. */
  | "invalidResponse"
  /**
   * LUD-21: the verify URL answered for another invoice than the one checked (its `pr`): the service
   * never made this one, which can never be paid to it (a forged declaration, src/lib/registry/).
   */
  | "otherInvoice";

export class LnurlError extends Error {
  readonly code: LnurlErrorCode;
  /**
   * The service's own reason, for `service`, as it came (empty when it gave none). The point of
   * sale shows a card's service's reason, cleaned of invisible characters (BoltCardReader.tsx); no
   * other screen shows one.
   */
  readonly reason: string | null;

  constructor(code: LnurlErrorCode, message: string, reason: string | null = null) {
    super(message);
    this.name = "LnurlError";
    this.code = code;
    this.reason = reason;
  }
}

export type LnurlOptions = {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

type Json = Record<string, unknown>;

async function getJson(
  url: string,
  options: LnurlOptions,
  getOptions: GetOptions = {}
): Promise<Json> {
  let body: unknown;
  try {
    body = await getWithTimeout(
      url,
      options.fetchImpl ?? fetch,
      options.timeoutMs ?? LNURL_TIMEOUT_MS,
      async (response) => {
        if (response.ok) return (await response.json()) as unknown;
        // A refusal sent with a client error status (400 "amount out of range"…) still carries
        // the service's {"status":"ERROR"} reason: an answer, not a network failure. A server
        // error (5xx), a timeout (408) or a rate limit (429) stays a passing failure, whatever its
        // body: past an invoice's end, a refusal counts as final ("nothing was charged").
        if (!isClientRefusalStatus(response.status)) throw new Error(`HTTP ${response.status}`);
        const refusal = await Promise.resolve()
          .then(() => response.json() as Promise<unknown>)
          .catch(() => null);
        if (isServiceError(refusal)) return refusal;
        throw new Error(`HTTP ${response.status}`);
      },
      getOptions
    );
  } catch (error) {
    throw new LnurlError("network", `GET ${url} failed: ${String(error)}`);
  }
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new LnurlError("invalidResponse", `GET ${url}: not a JSON object`);
  }
  const json = body as Json;
  if (isServiceError(json)) {
    const reason = typeof json.reason === "string" ? json.reason : "";
    throw new LnurlError("service", `GET ${url}: ${reason}`, reason);
  }
  return json;
}

/** An HTTP status whose LNURL error body is the service's own, lasting answer. */
function isClientRefusalStatus(status: number): boolean {
  return status >= 400 && status < 500 && status !== 408 && status !== 429;
}

/** An LNURL error answer (LUD-06): `{"status": "ERROR", "reason": …}`. */
function isServiceError(body: unknown): body is Json {
  if (body === null || typeof body !== "object" || Array.isArray(body)) return false;
  const status = (body as Json).status;
  return typeof status === "string" && status.toUpperCase() === "ERROR";
}

/** An https URL, else null. LNURL services must be served over TLS (LUD-01). */
function httpsUrl(value: unknown): URL | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

/** Whether `value` is an https URL: what an invoice's verify URL must be (LUD-21). */
export function isHttpsUrl(value: unknown): value is string {
  return httpsUrl(value) !== null;
}

/** Adds query parameters to a callback URL, which may already carry some (LUD-06). */
function withQuery(url: URL, params: Record<string, string>): string {
  const next = new URL(url.toString());
  for (const [key, value] of Object.entries(params)) next.searchParams.set(key, value);
  return next.toString();
}

/** Millisatoshi amount of a JSON number: a positive integer, else null. */
function msat(value: unknown): bigint | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? BigInt(value)
    : null;
}

const LIGHTNING_ADDRESS = /^([a-z0-9\-_.+]+)@([a-z0-9-]+(?:\.[a-z0-9-]+)+)$/;

/** A Lightning address (LUD-16) as the app keeps it: trimmed, lowercase. Null when it is not one. */
export function normalizeLightningAddress(text: string): string | null {
  const address = text.trim().toLowerCase();
  return LIGHTNING_ADDRESS.test(address) ? address : null;
}

/** LUD-16: the LNURL-pay endpoint of a Lightning address, or null when it is not one. */
export function lightningAddressUrl(address: string): string | null {
  const match = LIGHTNING_ADDRESS.exec(address.trim().toLowerCase());
  if (!match) return null;
  return `https://${match[2]}/.well-known/lnurlp/${match[1]}`;
}

export type PayRequest = {
  callback: URL;
  minSendableMsat: bigint;
  maxSendableMsat: bigint;
  /** The raw metadata string: the invoice's description hash must be its SHA-256 (LUD-06). */
  metadata: string;
  /** Longest comment accepted (LUD-12), 0 when none. */
  commentAllowed: number;
};

/** Reads the LNURL-pay parameters of a Lightning address. */
export async function fetchPayRequest(
  address: string,
  options: LnurlOptions = {}
): Promise<PayRequest> {
  const url = lightningAddressUrl(address);
  if (!url) throw new LnurlError("invalidResponse", `Not a Lightning address: ${address}`);
  const json = await getJson(url, options);
  const callback = httpsUrl(json.callback);
  const min = msat(json.minSendable);
  const max = msat(json.maxSendable);
  if (
    json.tag !== "payRequest" ||
    !callback ||
    min === null ||
    max === null ||
    min > max ||
    typeof json.metadata !== "string"
  ) {
    throw new LnurlError("invalidResponse", `${url}: not a valid payRequest`);
  }
  const commentAllowed =
    typeof json.commentAllowed === "number" && Number.isSafeInteger(json.commentAllowed)
      ? Math.max(0, json.commentAllowed)
      : 0;
  return {
    callback,
    minSendableMsat: min,
    maxSendableMsat: max,
    metadata: json.metadata,
    commentAllowed
  };
}

/** Whole satoshis the service accepts: [min, max], from its millisatoshi bounds. */
export function sendableSats(pay: PayRequest): { min: bigint; max: bigint } {
  // Rounded inwards: a whole-sat amount inside these bounds is inside the service's.
  return { min: (pay.minSendableMsat + 999n) / 1000n, max: pay.maxSendableMsat / 1000n };
}

export type Invoice = {
  /** The BOLT11 invoice, as the service gave it. */
  pr: string;
  decoded: Bolt11;
  /** LUD-21 verify URL. */
  verifyUrl: string;
  /**
   * The LUD-06 metadata of the payRequest that gave it, exactly as served (its SHA-256 is the
   * invoice's description hash): who it pays (metadata.ts). Only on an invoice requested here
   * (requestInvoice); one read back from a record has none.
   */
  metadata?: string;
};

export type InvoiceRequest = {
  amountSats: bigint;
  /** LUD-12 comment, sent only when the service accepts one that long. */
  comment?: string;
  /** Seconds the invoice stays payable. The Breez LNURL server honours this parameter. */
  expirySeconds?: number;
  /** "bc" on mainnet: an invoice of another network is refused. */
  network: string;
};

/**
 * Asks the service for an invoice of exactly `amountSats` (LUD-06), then checks it before it is
 * shown: its network, its amount, and its description hash against the metadata. A service that
 * does not support LUD-21 is refused: without it, the point of sale could not see the payment.
 */
export async function requestInvoice(
  pay: PayRequest,
  { amountSats, comment, expirySeconds, network }: InvoiceRequest,
  options: LnurlOptions = {}
): Promise<Invoice> {
  const amountMsat = amountSats * 1000n;
  const params: Record<string, string> = { amount: amountMsat.toString() };
  const trimmed = comment?.trim();
  if (trimmed && trimmed.length <= pay.commentAllowed) params.comment = trimmed;
  if (expirySeconds !== undefined) params.expiry = String(expirySeconds);

  const json = await getJson(withQuery(pay.callback, params), options);
  const pr = typeof json.pr === "string" ? json.pr : null;
  const decoded = pr ? decodeBolt11(pr) : null;
  const verify = httpsUrl(json.verify);
  if (!pr || !decoded) throw new LnurlError("invalidResponse", "The service gave no valid invoice");
  if (decoded.network !== network) {
    throw new LnurlError("invalidResponse", `Invoice of network ${decoded.network}`);
  }
  if (decoded.amountMsat !== amountMsat) {
    throw new LnurlError("invalidResponse", "The invoice amount differs from the request");
  }
  if (decoded.descriptionHash !== bytesToHex(sha256(utf8ToBytes(pay.metadata)))) {
    throw new LnurlError("invalidResponse", "The invoice description hash differs from metadata");
  }
  if (!verify) throw new LnurlError("invalidResponse", "The service gave no verify URL (LUD-21)");
  return { pr, decoded, verifyUrl: verify.toString(), metadata: pay.metadata };
}

/**
 * LUD-21: whether the invoice was paid, as the preimage of its payment hash (lowercase hex), null
 * when it was not. The answer must name this very invoice (its `pr`): a verify URL is the service's
 * word on the invoice it made under that hash, with its own amount and description, and breez.tips
 * serves every user's invoices under one path (`/lnurlp/verify/<hash>`), so an
 * invoice written by anyone else around another invoice's hash would otherwise borrow its payment.
 * A "settled" answer only counts with the preimage: the proof of payment, which only the payee can
 * have revealed (kept in a payment link's final version, src/lib/payment-link/).
 *
 * The answer must come from the verify URL itself, never through a redirect: a declared invoice's
 * verify URL is only checked to be on the address's LNURL server (checkDeclaredInvoice), its path
 * is the declarer's, and a redirect from that server would let anyone's page answer for it.
 * breez.tips answers its verify paths itself (lnurl/src/routes.rs `verify`). A
 * redirect is a failure of the request ("network"): checked again later, never "paid" nor "unpaid".
 */
export async function paidPreimage(
  invoice: Invoice,
  options: LnurlOptions = {}
): Promise<string | null> {
  const json = await getJson(invoice.verifyUrl, options, { noRedirect: true });
  if (typeof json.pr !== "string") {
    throw new LnurlError("invalidResponse", "The verify answer names no invoice (LUD-21 pr)");
  }
  // BOLT11 is case-insensitive (bech32): the same invoice may be written in upper case.
  if (json.pr.trim().toLowerCase() !== invoice.pr.trim().toLowerCase()) {
    throw new LnurlError("otherInvoice", "The verify answer is about another invoice");
  }
  if (json.settled !== true) return null;
  if (typeof json.preimage !== "string" || !/^[0-9a-f]{64}$/i.test(json.preimage)) {
    throw new LnurlError("invalidResponse", "Settled without a valid preimage");
  }
  const preimage = json.preimage.toLowerCase();
  if (bytesToHex(sha256(hexToBytes(preimage))) !== invoice.decoded.paymentHash) {
    throw new LnurlError("invalidResponse", "The preimage does not match the payment hash");
  }
  return preimage;
}

/**
 * LUD-17 / LUD-01: the https URL of an LNURL as a card or a QR code gives it: `lnurlw://…`
 * (BoltCards), `https://…`, or bech32 `LNURL1…` (optionally after `lightning:`). Null otherwise.
 */
export function lnurlToUrl(input: string): URL | null {
  const text = input.trim().replace(/^lightning:/i, "");
  if (/^lnurl1/i.test(text)) {
    const decoded = decodeBech32(text);
    if (!decoded || decoded.hrp !== "lnurl") return null;
    const url = bytesToUtf8(wordsToBytes(decoded.words));
    return httpsUrl(url);
  }
  const scheme = /^(lnurlw|lnurlp|lnurlc|keyauth):\/\//i.exec(text);
  if (scheme) {
    const rest = text.slice(scheme[0].length);
    // LUD-17: https, except for onion hosts (http), which the app cannot reach anyway.
    try {
      const url = new URL(`https://${rest}`);
      return url.hostname.endsWith(".onion") ? null : url;
    } catch {
      return null;
    }
  }
  return httpsUrl(text);
}

export type WithdrawRequest = {
  callback: URL;
  k1: string;
  minWithdrawableMsat: bigint;
  maxWithdrawableMsat: bigint;
  /**
   * The card's service takes the payee's proof with the invoice (`payeeProof: true`, an extension
   * of the card relay, sattleme/relay): the payRequest's metadata and the
   * invoice's verify URL, with which the card holder's app checks whom it pays. False when absent.
   */
  payeeProof: boolean;
  /**
   * The answer as it came, untrusted: a service's own extensions are read from it, each checked by
   * its reader (a v2 card's visual, src/lib/card/legacy-visual.ts).
   */
  fields: Readonly<Record<string, unknown>>;
};

/** LUD-03: reads the withdraw parameters behind an LNURL-withdraw (a BoltCard's tap). */
export async function fetchWithdrawRequest(
  url: URL,
  options: LnurlOptions = {}
): Promise<WithdrawRequest> {
  const json = await getJson(url.toString(), options);
  const callback = httpsUrl(json.callback);
  const min = msat(json.minWithdrawable);
  const max = msat(json.maxWithdrawable);
  if (
    json.tag !== "withdrawRequest" ||
    !callback ||
    typeof json.k1 !== "string" ||
    min === null ||
    max === null
  ) {
    throw new LnurlError("invalidResponse", `${url.host}: not a valid withdrawRequest`);
  }
  return {
    callback,
    k1: json.k1,
    minWithdrawableMsat: min,
    maxWithdrawableMsat: max,
    payeeProof: json.payeeProof === true,
    fields: json
  };
}

/**
 * The longest proof the card relay takes (its `/cb` answers 400 above, in UTF-16 code units as
 * here): longer, the invoice goes without it rather than be refused.
 */
export const MAX_PROOF_METADATA_LENGTH = 1024;
export const MAX_PROOF_VERIFY_LENGTH = 512;

/**
 * LUD-03: asks the card's service to pay `invoice`. An OK only means the service accepted the
 * request: the payment itself is seen through the invoice's verify URL, like any other.
 *
 * With the payee's proof (the payRequest's `metadata`, the invoice's `verify` URL) only when the
 * service asked for it (`payeeProof`) and both fit its bounds: another card's service gets
 * nothing more than LUD-03's `k1` and `pr`. Both are public (the merchant's payRequest, the
 * invoice's verify URL); the card holder's app checks them against the invoice and its issuer.
 */
export async function submitWithdraw(
  withdraw: WithdrawRequest,
  invoice: Invoice,
  options: LnurlOptions = {}
): Promise<void> {
  const amount = invoice.decoded.amountMsat;
  if (
    amount === null ||
    amount < withdraw.minWithdrawableMsat ||
    amount > withdraw.maxWithdrawableMsat
  ) {
    throw new LnurlError("outOfRange", "Amount outside the card's limits");
  }
  const params: Record<string, string> = { k1: withdraw.k1, pr: invoice.pr };
  const { metadata, verifyUrl } = invoice;
  if (
    withdraw.payeeProof &&
    metadata !== undefined &&
    metadata.length > 0 &&
    metadata.length <= MAX_PROOF_METADATA_LENGTH &&
    verifyUrl.length <= MAX_PROOF_VERIFY_LENGTH
  ) {
    params.metadata = metadata;
    params.verify = verifyUrl;
  }
  await getJson(withQuery(withdraw.callback, params), options);
}
