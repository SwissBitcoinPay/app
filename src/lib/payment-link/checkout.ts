import { secp256k1 } from "@noble/curves/secp256k1.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";

import { majority } from "@/config/registry";
import { base64UrlToBytes } from "@/lib/base64";
import { decodeBolt11, type Bolt11 } from "@/lib/lightning/bolt11";
import type { Invoice } from "@/lib/lightning/lnurl";
import { deriveKey } from "@/lib/nostr/keys";
import type { NostrEvent } from "@/lib/nostr/event";
import {
  WATCH_RETRY_MAX_MS,
  WATCH_RETRY_MIN_MS,
  eachRelayAnswer,
  watchRelays
} from "@/lib/nostr/pool";
import { NewerRecordError, RECORD_KIND, openRecord } from "@/lib/nostr/record";
import { parseTaprootAddress } from "@/lib/onchain/address";
import { parsePayerNode, type PayerNode } from "@/lib/onchain/node";
import { decodeRelayList } from "@/lib/relays/list";
import { isSatsNumber } from "@/lib/sats";
import { hasLoneSurrogate } from "@/lib/text";

import { PAYMENT_LINK_TIMEOUT_MS } from "./link";

/*
 * Checkout links (sattleme/checkout-spec 0.1.0, SPEC.md §30; version 2 of the record, with
 * an on-chain address, the invoices of the rest of an on-chain underpayment and the acceptance of a
 * payment the merchant's tolerance accepted, SPEC.md §31): an integration's server
 * (@sattleme/checkout, `checkout: true`) sends its customer to this web app's page
 * `/pay#c.<author>.<key>.<relays>`, which shows the invoice the server declared, checks its
 * payment (LUD-21, from the customer's browser) and, once it is paid, sends the customer to the
 * order's redirect URL (docs/integrations.md).
 *
 * The server publishes the link's record on a majority of the merchant's relays before it gives
 * the URL: sealed with the link's own key (in the URL's fragment, which browsers never send to the
 * web app's host), signed by the link's own author, whose secret it drops once published: nobody
 * changes a link afterwards, so any valid copy is the link. It holds the invoice, its verify URL,
 * the business's name, the price, the note and the redirect URL; never the integration's key, the
 * merchant's Lightning address nor the registry: the page can only show and check this invoice,
 * and the invoices of the rest of its underpayment the server publishes (rest records, signed by a
 * key only the integration's key derives, whose public half and reading key the record carries).
 *
 * Everything here is the specification's, locked by its vectors (checkout-link.test.ts): the salt
 * and `info` strings, the marker `c`, the record's type and version never change; a newer format
 * of either (another marker, a higher version) is told apart, the page asks to be updated.
 */

/** HKDF salt and `info` of a link's keys. Never change them. */
const CHECKOUT_SALT = "sattle.me/checkout";
const ADDRESS_INFO = "address/v1";
const ENCRYPTION_INFO = "encryption-key/v1";
/** HKDF `info` (salt CHECKOUT_SALT) of a rest record's key and address. Never change them. */
const REST_ENCRYPTION_INFO = "rest/encryption-key/v1";
const restAddressInfo = (paymentHash: string) => `rest/address/${paymentHash}/v1`;
/** A rest record (SPEC.md §31, "Rest records"): its type and the newest format this page reads. */
const REST_RECORD_TYPE = "checkout-rest";
const REST_VERSION = 1;
/**
 * An acceptance record (SPEC.md §31, "Acceptance records"): its type, the newest format this page
 * reads, and the HKDF `info` (salt CHECKOUT_SALT) of its address, from the rest key. Never change
 * them.
 */
const ACCEPTANCE_RECORD_TYPE = "checkout-accepted";
const ACCEPTANCE_VERSION = 1;
const ACCEPTANCE_ADDRESS_INFO = "rest/accepted/v1";
/**
 * The clock tolerance of the specification (SPEC.md §2): a rest invoice's server may be dated
 * this far from the link's.
 */
const CLOCK_TOLERANCE_SECONDS = 300;

/** What the record is (src/lib/nostr/record.ts), and the format of its value. */
const RECORD_TYPE = "checkout";
/** The newest format of the record this page reads: 1 (an invoice), 2 (and an on-chain address). */
export const CHECKOUT_VERSION = 2;
/** The first part of the fragment of a checkout link of this format. Never changes. */
const MARKER = "c";
/** The first part of a newer format's fragment: 1 to 8 characters `a–z 0–9` (not `c`). */
const NEWER_MARKER = /^[a-z0-9]{1,8}$/;

const KEY_LENGTH = 32;
const MAX_BUSINESS_NAME_LENGTH = 200;
const MAX_NOTE_LENGTH = 100;
const MAX_DIGITS = 8;
const SATS_CURRENCY = "SAT";

/**
 * A host as in a relay address (SPEC.md §9, src/lib/relays/list.ts): lower case, a top-level label
 * of letters; its length and `localhost` are checked by isHost.
 */
const HOST = "[a-z0-9-]+(?:\\.[a-z0-9-]+)*\\.[a-z]{2,}";
const MAX_HOST_LENGTH = 253;
/** `localhost` or a name under it: the machine itself (RFC 6761), never a host here (SPEC.md §9). */
const LOCALHOST = /(?:^|\.)localhost$/;
const ORIGIN = new RegExp(`^https://(${HOST})(?::([0-9]{1,5}))?$`);
/** Every character of a redirect URL: RFC 3986's, and `%` with two hex digits. */
const URL_CHARACTERS = /^(?:[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=]|%[0-9A-Fa-f]{2})+$/;
const HTTPS_URL = new RegExp(`^https://(${HOST})(?::([0-9]{1,5}))?(?:[/?#].*)?$`);
const APP_URL = /^([a-z][a-z0-9+.-]*):\/\//;
const MAX_REDIRECT_URL_LENGTH = 2048;
const MAX_SCHEME_LENGTH = 32;
/**
 * Schemes a redirect URL never has (SPEC.md §30): the browser's own, files and scripts; other
 * browsers (they open any web page given in the rest of the link, whose host the page would not
 * show: a web page is an https URL); other transports; any Android activity; payments (a forged
 * link would open the customer's wallet on a second invoice right after the first); calls and
 * messages; installing software or running system tools. `https` follows its own rule.
 */
const REFUSED_SCHEMES: ReadonlySet<string> = new Set([
  "about",
  "blob",
  "chrome",
  "chrome-extension",
  "content",
  "data",
  "file",
  "filesystem",
  "javascript",
  "moz-extension",
  "resource",
  "safari-extension",
  "vbscript",
  "view-source",
  "brave",
  "com-apple-mobilesafari-tab",
  "ddgquicklink",
  "firefox",
  "firefox-focus",
  "googlechrome",
  "googlechrome-x-callback",
  "googlechromes",
  "microsoft-edge",
  "microsoft-edge-http",
  "microsoft-edge-https",
  "onionbrowser",
  "onionbrowsers",
  "opera-http",
  "opera-https",
  "x-safari-http",
  "x-safari-https",
  "ftp",
  "http",
  "ws",
  "wss",
  "android-app",
  "intent",
  "bitcoin",
  "keyauth",
  "lightning",
  "liquidnetwork",
  "lnurl",
  "lnurlc",
  "lnurlp",
  "lnurlw",
  "callto",
  "facetime",
  "facetime-audio",
  "mailto",
  "sip",
  "sms",
  "tel",
  "itms-services",
  "ms-msdt",
  "search-ms"
]);

function isPort(port: string | undefined): boolean {
  return port === undefined || (Number(port) >= 1 && Number(port) <= 65535);
}

/** A host HOST matched: at most MAX_HOST_LENGTH characters, not `localhost` nor a name under it. */
function isHost(host: string): boolean {
  return host.length <= MAX_HOST_LENGTH && !LOCALHOST.test(host);
}

/**
 * A checkout origin: `https://`, a host as in a relay address, an optional port, nothing else.
 * What an integration's channel names as this web app (src/lib/team/channel.ts).
 */
export function isCheckoutOrigin(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = ORIGIN.exec(value);
  return match !== null && isHost(match[1]) && isPort(match[2]);
}

/**
 * The host and port (443 when absent) of an https URL as SPEC.md §15 says: rule 1 of a redirect
 * URL (redirectShown), so no upper case in the scheme or the host, no user name, no IP address, no
 * `localhost` nor a name under it, nothing repaired. Null for anything else. What a checkout
 * record's and a rest record's verify URL must be; LUD-21's own rule (isHttpsUrl of
 * src/lib/lightning/lnurl.ts) stays the one of the app's other links and records.
 */
export function httpsUrlOrigin(value: unknown): { host: string; port: number } | null {
  if (
    typeof value !== "string" ||
    value.length > MAX_REDIRECT_URL_LENGTH ||
    !URL_CHARACTERS.test(value)
  ) {
    return null;
  }
  const match = HTTPS_URL.exec(value);
  if (!match || !isHost(match[1]) || !isPort(match[2])) return null;
  return { host: match[1], port: match[2] === undefined ? 443 : Number(match[2]) };
}

function isVerifyUrl(value: unknown): value is string {
  return httpsUrlOrigin(value) !== null;
}

/**
 * What the page shows of a redirect URL ("Redirecting to …"): the host and port of an https
 * URL as written, the scheme and `://` of an app's link. Null when `value` is not a redirect URL:
 * 1 to 2048 characters of RFC 3986 (no whitespace, no `\`, which browsers read as `/` in an https
 * URL), https with a lowercase host (not `localhost` nor a name under it) and no user name nor
 * password, or an app's link whose scheme is not refused. Nothing is repaired.
 */
export function redirectShown(value: unknown): string | null {
  if (
    typeof value !== "string" ||
    value.length > MAX_REDIRECT_URL_LENGTH ||
    !URL_CHARACTERS.test(value)
  ) {
    return null;
  }
  const https = HTTPS_URL.exec(value);
  if (https) {
    const [, host, port] = https;
    if (!isHost(host) || !isPort(port)) return null;
    return port === undefined ? host : `${host}:${port}`;
  }
  const app = APP_URL.exec(value);
  if (!app) return null;
  const scheme = app[1];
  if (scheme.length > MAX_SCHEME_LENGTH || scheme === "https" || REFUSED_SCHEMES.has(scheme)) {
    return null;
  }
  return `${scheme}://`;
}

/** A checkout link as its URL names it: its author (hex, x-only), its key and its relays. */
export type CheckoutRef = { author: string; key: Uint8Array; relays: string[] };

/** What a URL's fragment is, for the page. */
export type CheckoutFragment =
  | { status: "link"; ref: CheckoutRef }
  /** A checkout link of a newer format than this page reads: it asks to be updated. */
  | { status: "newer" }
  /** A checkout link cut short or damaged. */
  | { status: "invalid" }
  /** Not a checkout link: another link of the page (parsePaymentLinkFragment). */
  | { status: "other" };

function isPoint(x: string): boolean {
  try {
    secp256k1.Point.fromHex(`02${x}`);
    return true;
  } catch {
    return false;
  }
}

/**
 * The checkout link of a URL's fragment (with or without "#"): `c.<author>.<key>.<relays>`, each
 * part in canonical base64url, the author a point of the curve, the relays a valid list
 * (encodeRelayList). A first part of 1 to 8 characters `a–z 0–9` other than `c` is a newer
 * format; anything longer is not a checkout link (a payment link's first part has 36 or 43).
 */
export function parseCheckoutFragment(fragment: string): CheckoutFragment {
  const [marker, author, key, relays, ...rest] = (
    fragment.startsWith("#") ? fragment.slice(1) : fragment
  ).split(".");
  if (marker !== MARKER)
    return NEWER_MARKER.test(marker) ? { status: "newer" } : { status: "other" };
  if (author === undefined || key === undefined || relays === undefined || rest.length > 0) {
    return { status: "invalid" };
  }
  const authorBytes = base64UrlToBytes(author);
  const keyBytes = base64UrlToBytes(key);
  const list = decodeRelayList(relays);
  if (authorBytes?.length !== KEY_LENGTH || keyBytes?.length !== KEY_LENGTH || list === null) {
    return { status: "invalid" };
  }
  const authorHex = bytesToHex(authorBytes);
  if (!isPoint(authorHex)) return { status: "invalid" };
  return { status: "link", ref: { author: authorHex, key: keyBytes, relays: list } };
}

/** The `d` tag (hex) and the NIP-44 conversation key of the link whose key is `key`. */
export function checkoutKeys(key: Uint8Array): { address: string; encryptionKey: Uint8Array } {
  return {
    address: bytesToHex(deriveKey(key, CHECKOUT_SALT, ADDRESS_INFO)),
    encryptionKey: deriveKey(key, CHECKOUT_SALT, ENCRYPTION_INFO)
  };
}

/** The price an order was declared with: `minor` units with `digits` decimals of `currency`. */
export type CheckoutFiat = { minor: number; digits: number; currency: string };

/** A checkout link's record, checked: what the page shows. */
export type CheckoutRecord = {
  businessName: string;
  /** The Lightning invoice; null for an order paid on-chain only (version 2). */
  invoice: Invoice | null;
  /** The deposit address the order leased (version 2), null without one. */
  onchainAddress: string | null;
  /** Whole sats: the invoice's amount, and what the address must receive. */
  sats: bigint;
  /** Unix seconds: the invoice's date (its BOLT11 timestamp, else when the address was leased). */
  createdAt: number;
  /** Unix seconds: the invoice's end. */
  expiresAt: number;
  /** The order's price; null for an order in sats. */
  fiat: CheckoutFiat | null;
  note: string;
  /** Where the page sends the customer once the invoice is paid, null when nowhere. */
  redirectUrl: string | null;
  /** What the page shows of it (redirectShown). */
  redirectShown: string | null;
  /**
   * The rest author (hex) and rest key of a record of version 2 that carries them (SPEC.md §31,
   * "Rest records"): the page reads the invoices of the rest of an underpayment with them. Null
   * otherwise (both are absent when its server shows no invoice of the rest): the rest is payable
   * on-chain only.
   */
  rest: CheckoutRestKey | null;
  /**
   * The merchant's own node (an HTTPS node of the Internet: isPayersNode), when the owner lets
   * payers' pages read the chain there ("Pass my node on to the payers' pages"), with the owner's
   * fallback: an optional field of a record of version 2, which an older page ignores as SPEC.md
   * lets it ("more fields"). Null for mempool.space: without it, in version 1 (no address), and
   * when it is not such a node in its one spelling (left aside: the page then reads mempool.space,
   * never refuses the order's record).
   */
  bitcoinNode: PayerNode | null;
};

/** What a checkout link's record gives to read its rest records: never the secret that signs them. */
export type CheckoutRestKey = { author: string; key: Uint8Array };

const CONTROL = /[\u0000-\u001f\u007f]/;

function codePoints(text: string): number {
  return Array.from(text).length;
}

function isText(value: unknown, min: number, max: number): value is string {
  return (
    typeof value === "string" &&
    // A text UTF-8 cannot carry (SPEC.md "Text").
    !hasLoneSurrogate(value) &&
    codePoints(value) >= min &&
    codePoints(value) <= max
  );
}

function fiatOf(value: unknown): CheckoutFiat | null | undefined {
  if (value === null) return null;
  if (value === undefined || typeof value !== "object" || Array.isArray(value)) return undefined;
  const { minor, digits, currency } = value as Record<string, unknown>;
  if (
    typeof minor !== "number" ||
    !Number.isSafeInteger(minor) ||
    minor < 1 ||
    typeof digits !== "number" ||
    !Number.isInteger(digits) ||
    digits < 0 ||
    digits > MAX_DIGITS ||
    typeof currency !== "string" ||
    !/^[A-Z]{3}$/.test(currency) ||
    currency === SATS_CURRENCY
  ) {
    return undefined;
  }
  return { minor, digits, currency };
}

/** A BOLT11 invoice of `network` for an amount above 0 in whole sats, decoded; null otherwise. */
function payableInvoice(invoice: unknown, network: string): Bolt11 | null {
  if (typeof invoice !== "string") return null;
  const decoded = decodeBolt11(invoice);
  if (
    !decoded ||
    decoded.network !== network ||
    decoded.amountMsat === null ||
    decoded.amountMsat <= 0n ||
    decoded.amountMsat % 1000n !== 0n
  ) {
    return null;
  }
  return decoded;
}

/**
 * The rest author and rest key of a record of version 2: both absent (null), or a point of the
 * curve and 32 bytes, in lowercase hex; undefined when anything is off.
 */
function restKeyOf(v: Record<string, unknown>): CheckoutRestKey | null | undefined {
  const { restAuthor, restKey } = v;
  if (restAuthor === undefined && restKey === undefined) return null;
  if (typeof restAuthor !== "string" || !/^[0-9a-f]{64}$/.test(restAuthor)) return undefined;
  if (!isPoint(restAuthor)) return undefined;
  if (typeof restKey !== "string" || !/^[0-9a-f]{64}$/.test(restKey)) return undefined;
  return { author: restAuthor, key: hexToBytes(restKey) };
}

/**
 * What a record of version 2 adds (SPEC.md §30): its on-chain address, its amount and its times,
 * and its invoice if any, which must say the same. Null when anything is off.
 */
function onchainPart(v: Record<string, unknown>, network: string) {
  const address =
    typeof v.onchainAddress === "string" ? parseTaprootAddress(v.onchainAddress, network) : null;
  if (address === null || address !== v.onchainAddress) return null;
  const { sats, createdAt, expiresAt, invoice, verifyUrl } = v;
  // At most 21 000 000 BTC: the largest amount an order has (SPEC.md §17).
  if (!isSatsNumber(sats)) {
    return null;
  }
  if (typeof createdAt !== "number" || !Number.isSafeInteger(createdAt)) return null;
  if (typeof expiresAt !== "number" || !Number.isSafeInteger(expiresAt)) return null;
  if (createdAt >= expiresAt) return null;
  if (invoice === null && verifyUrl === null) {
    return { address, sats: BigInt(sats), createdAt, expiresAt, invoice: null };
  }
  const decoded = payableInvoice(invoice, network);
  if (!decoded || !isVerifyUrl(verifyUrl)) return null;
  if (
    decoded.amountMsat !== BigInt(sats) * 1000n ||
    decoded.timestamp !== createdAt ||
    decoded.timestamp + decoded.expirySeconds !== expiresAt
  ) {
    return null;
  }
  return {
    address,
    sats: BigInt(sats),
    createdAt,
    expiresAt,
    invoice: { pr: invoice as string, decoded, verifyUrl }
  };
}

/**
 * A record's value, checked as SPEC.md §30 says ("Reading a record"), for invoices of `network`
 * (BOLT11 prefix, and the addresses': "bc" on mainnet): null when anything is off; throws
 * NewerRecordError for a newer version. In version 1, the amount and the end are the invoice's
 * own; version 2 writes them, with the address, and they must be the invoice's.
 */
export function parseCheckoutValue(value: unknown, network: string): CheckoutRecord | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.version === "number" && v.version > CHECKOUT_VERSION) throw new NewerRecordError();
  if (v.version !== 1 && v.version !== 2) return null;
  const { businessName, note, redirectUrl } = v;
  if (
    !isText(businessName, 1, MAX_BUSINESS_NAME_LENGTH) ||
    businessName.replace(/^[ \t\n\r]+|[ \t\n\r]+$/g, "") === ""
  ) {
    return null;
  }
  let payment: {
    address: string | null;
    sats: bigint;
    createdAt: number;
    expiresAt: number;
    invoice: Invoice | null;
  } | null;
  // Version 1 has no address, so no rest: whatever it holds of them is ignored.
  const rest = v.version === 2 ? restKeyOf(v) : null;
  if (rest === undefined) return null;
  if (v.version === 1) {
    const decoded = payableInvoice(v.invoice, network);
    payment =
      decoded && isVerifyUrl(v.verifyUrl)
        ? {
            address: null,
            sats: decoded.amountMsat! / 1000n,
            createdAt: decoded.timestamp,
            expiresAt: decoded.timestamp + decoded.expirySeconds,
            invoice: { pr: v.invoice as string, decoded, verifyUrl: v.verifyUrl }
          }
        : null;
  } else {
    payment = onchainPart(v, network);
  }
  if (!payment) return null;
  const fiat = fiatOf(v.fiat);
  if (fiat === undefined) return null;
  if (!isText(note, 1, MAX_NOTE_LENGTH) || CONTROL.test(note)) return null;
  const shown = redirectUrl === null ? null : redirectShown(redirectUrl);
  if (redirectUrl !== null && shown === null) return null;
  return {
    businessName,
    invoice: payment.invoice,
    onchainAddress: payment.address,
    sats: payment.sats,
    createdAt: payment.createdAt,
    expiresAt: payment.expiresAt,
    fiat,
    note,
    redirectUrl: shown === null ? null : (redirectUrl as string),
    redirectShown: shown,
    rest,
    bitcoinNode: v.version === 2 ? parsePayerNode(v.bitcoinNode) : null
  };
}

type CheckoutCopy = { status: "ok"; record: CheckoutRecord } | { status: "newer" } | null;

/** What a relay sent, if it is a copy of the link `ref` names. */
export function readCheckoutCopy(value: unknown, ref: CheckoutRef, network: string): CheckoutCopy {
  return readCopy(value, ref, network, checkoutKeys(ref.key));
}

/**
 * readCheckoutCopy with the keys of `ref.key` (checkoutKeys) derived once per read, not once per
 * event: never exported, so that no caller pairs a link with another link's keys.
 */
function readCopy(
  value: unknown,
  ref: CheckoutRef,
  network: string,
  { address, encryptionKey }: ReturnType<typeof checkoutKeys>
): CheckoutCopy {
  const opened = openRecord(value, {
    type: RECORD_TYPE,
    encryptionKey,
    address,
    // Only the link's author: anyone may publish at its address, nobody else signs as it.
    author: ref.author,
    parse: (payload) => parseCheckoutValue(payload, network)
  });
  if (!opened) return null;
  return opened.status === "ok" ? { status: "ok", record: opened.value } : { status: "newer" };
}

export type CheckoutLookup =
  | { status: "found"; record: CheckoutRecord }
  /** Relays answered with a record of a newer format only: the page asks to be updated. */
  | { status: "newer" }
  /** Relays answered without it: a wrong link, or one past its life (relays drop it). */
  | { status: "notFound" }
  /** No relay answered in time. */
  | { status: "unreachable" };

/**
 * Asks every relay of the link for its record, its author's only, and resolves with the first
 * valid copy, without waiting for the others: nobody changes a link, any valid copy is the link.
 * Not found only once a majority of the link's relays answered without it (the integration's
 * server publishes it to a majority, SPEC.md §30), unreachable otherwise. Never rejects.
 */
export function fetchCheckoutLink(
  ref: CheckoutRef,
  network: string,
  { timeoutMs = PAYMENT_LINK_TIMEOUT_MS }: { timeoutMs?: number } = {}
): Promise<CheckoutLookup> {
  const keys = checkoutKeys(ref.key);
  return new Promise((resolve) => {
    let resolved = false;
    let newer = false;
    void eachRelayAnswer(
      { kinds: [RECORD_KIND], authors: [ref.author], "#d": [keys.address] },
      // Relays that ask for authentication get the connection's own key (relay.ts).
      { channel: "anonymous", relays: ref.relays, timeoutMs },
      (_, events) => {
        for (const value of events) {
          if (resolved) return;
          const copy = readCopy(value, ref, network, keys);
          if (copy?.status === "ok") {
            resolved = true;
            resolve({ status: "found", record: copy.record });
          } else if (copy?.status === "newer") {
            newer = true;
          }
        }
      },
      undefined,
      { quorum: "majority" }
    ).then((answered) => {
      if (resolved) return;
      if (newer) resolve({ status: "newer" });
      else if (answered >= majority(new Set(ref.relays).size)) resolve({ status: "notFound" });
      else resolve({ status: "unreachable" });
    });
  });
}

/**
 * The keys of the rest records of a link's record (SPEC.md §31, "Rest records"): their encryption
 * key, the address of the record of each invoice (by its payment hash), and the address of its
 * acceptance record ("Acceptance records").
 */
export function checkoutRestKeys(rest: CheckoutRestKey) {
  return {
    encryptionKey: deriveKey(rest.key, CHECKOUT_SALT, REST_ENCRYPTION_INFO),
    addressOf: (paymentHash: string) =>
      bytesToHex(deriveKey(rest.key, CHECKOUT_SALT, restAddressInfo(paymentHash))),
    acceptanceAddress: bytesToHex(deriveKey(rest.key, CHECKOUT_SALT, ACCEPTANCE_ADDRESS_INFO))
  };
}

/**
 * The merchant's acceptance of a payment short of the amount (SPEC.md §31, "Acceptance records"):
 * what was received when the integration's server accepted it (`received`, sats), never the
 * tolerance that let it. The newest counts (`createdAt`, then the lowest `id`).
 */
export type CheckoutAcceptance = { received: bigint; createdAt: number; id: string };

/**
 * What a relay sent, if it is the acceptance record of `record` (SPEC.md §31, "Reading an
 * acceptance record"): signed by the rest author the link's record names (only the integration's
 * key signs one), at the acceptance address of its rest key, `received` a whole number of sats from
 * 1, below the link's. Null otherwise, a record of a newer format included (left aside).
 */
export function readCheckoutAcceptance(
  value: unknown,
  record: Pick<CheckoutRecord, "rest" | "sats">,
  keys: ReturnType<typeof checkoutRestKeys> | null = record.rest && checkoutRestKeys(record.rest)
): CheckoutAcceptance | null {
  if (!record.rest || !keys) return null;
  const opened = openRecord(value, {
    type: ACCEPTANCE_RECORD_TYPE,
    encryptionKey: keys.encryptionKey,
    address: keys.acceptanceAddress,
    author: record.rest.author,
    parse: (payload) => {
      if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return null;
      const v = payload as Record<string, unknown>;
      if (typeof v.version === "number" && v.version > ACCEPTANCE_VERSION) {
        throw new NewerRecordError();
      }
      if (v.version !== ACCEPTANCE_VERSION || !isSatsNumber(v.received)) return null;
      const received = BigInt(v.received);
      return received >= 1n && received < record.sats ? received : null;
    }
  });
  return opened?.status === "ok"
    ? { received: opened.value, createdAt: opened.event.created_at, id: opened.event.id }
    : null;
}

/** The newer of two acceptances (SPEC.md §31): by date, then the lowest id. */
export function newerAcceptance(
  a: CheckoutAcceptance | null,
  b: CheckoutAcceptance
): CheckoutAcceptance {
  if (a === null || b.createdAt > a.createdAt) return b;
  return b.createdAt === a.createdAt && b.id < a.id ? b : a;
}

/**
 * What a relay sent, if it is a rest record of `record` (SPEC.md §31, "Reading a rest record"),
 * for invoices of `network`: an invoice of the rest of an underpayment, signed by the rest author
 * the link's record names (only the integration's key signs one), at the address of its payment
 * hash, an amount above 0 in whole sats below the link's, dated from the link's date and ending by
 * its end (the clock tolerance either way), an https verify URL. Null otherwise, a record of a
 * newer format included (left aside: the rest stays payable on-chain).
 */
export function readCheckoutRest(
  value: unknown,
  record: Pick<CheckoutRecord, "rest" | "sats" | "createdAt" | "expiresAt">,
  network: string,
  keys: ReturnType<typeof checkoutRestKeys> | null = record.rest && checkoutRestKeys(record.rest)
): Invoice | null {
  if (!record.rest || !keys) return null;
  const opened = openRecord(value, {
    type: REST_RECORD_TYPE,
    encryptionKey: keys.encryptionKey,
    // Its own `d` tag, which must be the address of its invoice (checked below).
    address: () => true,
    author: record.rest.author,
    parse: (payload, event: NostrEvent) => {
      if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return null;
      const v = payload as Record<string, unknown>;
      if (typeof v.version === "number" && v.version > REST_VERSION) throw new NewerRecordError();
      if (v.version !== REST_VERSION) return null;
      const decoded = payableInvoice(v.invoice, network);
      if (!decoded || !isVerifyUrl(v.verifyUrl)) return null;
      const end = decoded.timestamp + decoded.expirySeconds;
      if (
        decoded.amountMsat! / 1000n >= record.sats ||
        decoded.timestamp < record.createdAt - CLOCK_TOLERANCE_SECONDS ||
        end > record.expiresAt + CLOCK_TOLERANCE_SECONDS
      ) {
        return null;
      }
      const d = event.tags.find(([name]) => name === "d")?.[1];
      if (d !== keys.addressOf(decoded.paymentHash)) return null;
      return { pr: v.invoice as string, decoded, verifyUrl: v.verifyUrl };
    }
  });
  return opened?.status === "ok" ? opened.value : null;
}

/**
 * Listens for the rest records of the link `ref` names, whose record is `record` (with its rest
 * author and key): each valid one on the link's relays goes to `onRest` as soon as the first relay
 * sends it, those they hold and those published later (the integration's server publishes one as
 * soon as it sees an underpayment); each valid acceptance record (the same author's) to
 * `onAccepted`. `onRead` is called once a majority of the link's relays sent
 * what they hold: the server publishes each record on a majority of them, and any two majorities
 * share a relay, so every record published by then came. The relays that did not answer are asked
 * again, after WATCH_RETRY_MIN_MS then twice as long each time, until a majority answered. Until
 * the returned function is called. Nothing without rest keys in the record.
 */
export function watchCheckoutRests(
  ref: CheckoutRef,
  record: CheckoutRecord,
  network: string,
  onRest: (invoice: Invoice) => void,
  {
    timeoutMs = PAYMENT_LINK_TIMEOUT_MS,
    onRead,
    onAccepted
  }: {
    timeoutMs?: number;
    onRead?: () => void;
    onAccepted?: (acceptance: CheckoutAcceptance) => void;
  } = {}
): () => void {
  const { rest } = record;
  if (!rest) return () => undefined;
  const keys = checkoutRestKeys(rest);
  const controller = new AbortController();
  const filter = { kinds: [RECORD_KIND], authors: [rest.author] };
  // Relays that ask for authentication get the connection's own key (relay.ts).
  const call = { channel: "anonymous" as const, relays: ref.relays, timeoutMs };
  // The acceptance record first: its address is known, so the acceptance reader leaves a rest
  // record aside before decrypting it, while the rest reader decrypts whatever the author signed
  // (its address depends on the invoice inside). A valid record is so decrypted by one reader only.
  const take = (value: unknown) => {
    const acceptance = readCheckoutAcceptance(value, record, keys);
    if (acceptance) {
      onAccepted?.(acceptance);
      return;
    }
    const invoice = readCheckoutRest(value, record, network, keys);
    if (invoice) onRest(invoice);
  };
  const stopWatch = watchRelays(filter, { ...call, signal: controller.signal }, take);
  const answered = new Set<string>();
  const needed = majority(new Set(ref.relays).size);
  let timer: ReturnType<typeof setTimeout> | null = null;
  const read = (delay: number) => {
    const pending = ref.relays.filter((relay) => !answered.has(relay));
    void eachRelayAnswer(
      filter,
      { ...call, relays: pending, signal: controller.signal },
      (relay, events) => {
        if (controller.signal.aborted) return;
        answered.add(relay);
        for (const value of events) take(value);
      },
      undefined,
      // The relays the majority lacks: the others are asked again by the watch.
      { quorum: { count: needed - answered.size } }
    ).then(() => {
      if (controller.signal.aborted) return;
      if (answered.size >= needed) {
        onRead?.();
        return;
      }
      timer = setTimeout(() => {
        timer = null;
        read(Math.min(delay * 2, WATCH_RETRY_MAX_MS));
      }, delay);
    });
  };
  read(WATCH_RETRY_MIN_MS);
  return () => {
    controller.abort();
    if (timer !== null) clearTimeout(timer);
    stopWatch();
  };
}
