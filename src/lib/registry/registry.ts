import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";

import { REGISTRY_TIMEOUT_MS, majority } from "@/config/registry";
import { bolt11ExpiresAt, decodeBolt11 } from "@/lib/lightning/bolt11";
import { isHttpsUrl, type Invoice, type PayRequest } from "@/lib/lightning/lnurl";
import { readPayeeMetadata } from "@/lib/lightning/metadata";
import type { NostrEvent } from "@/lib/nostr/event";
import { deriveKey, nostrKeys, type NostrKeys } from "@/lib/nostr/keys";
import { conversationKey, nip44Decrypt, nip44Encrypt } from "@/lib/nostr/nip44";
import {
  COPIES_AT_ONCE,
  PAGE_FLOOR,
  publishAgain,
  publishToQuorum,
  queryRelays,
  queryRelaysPaged
} from "@/lib/nostr/pool";
import { epochReaderFor, epochReadersOf } from "@/lib/nostr/epochs";
import {
  EPOCH_ENVELOPE_VERSION,
  NewerRecordError,
  RECORD_KIND,
  openRecord,
  sealRecord
} from "@/lib/nostr/record";
import { currentRelays } from "@/lib/relays/current";
import { pointEnd, pointHourOf } from "@/lib/rates/sources";
import { nowUnix } from "@/lib/rates/snapshot";

/*
 * The registry of Lightning payments. Nothing
 * in a Lightning invoice tells which sale it was made for: the invoices of a merchant's Lightning
 * address all carry the same description hash, and the LNURL server's verify answer does not
 * return the comment. So every invoice asked for a sale, by the point of sale, by the payer's page
 * of a payment link or by an integration's server (docs/integrations.md), is declared on Nostr
 * relays before its code is shown:
 *
 * - at an address only the payment hash H gives, d(H) = HMAC(registry key, H): the declarations of
 *   every sale of the business that claim one payment meet there, whatever device made them. The
 *   registry key is the business's: its devices hold it, and so do every payment link and every
 *   integration's server (its channel gives it);
 * - signed by the sale's key (deriveSaleKeys, from the sale's own key, which a payment link
 *   carries): the declarations of one sale are found by their author;
 * - encrypted for the sale and for the business: the key is the NIP-44
 *   conversation between the sale's key and the business's reading key (deriveRegistryReader,
 *   src/lib/team/keys.ts), which the sale's holders compute with the sale's secret and the
 *   reading key's public half, and the owner with the reading key's secret and the declaration's
 *   author. So the owner reads every declaration of the business (its employees' and its payment
 *   links' included), with the sale's key, fiat amount and note: from a payment of its wallet,
 *   d(H) leads to the sale (ownerDeclarations).
 *
 * A payment counts for a sale only when d(H) holds no declaration of another author, read on a
 * majority of the relays: a declaration is published on a majority before its code is shown, any
 * two majorities share a relay, so a reader always meets it. A payer who declares one payment for
 * two sales gets it counted for neither: the owner settles it with the wallet, which received it
 * once. Only a declaration made with the registry key counts so (d(H) is seen by every relay, and
 * anyone could otherwise publish there): its content opens with a key of the
 * registry key, of its address and of its author (outerKey), inside which the declaration itself
 * is sealed for the sale and the business. A copy of another sale's content under another author
 * does not open.
 *
 * What a relay sees: an opaque `d` tag, the sale's public key (which links the invoices of one
 * sale), the dates and sizes; never the invoice, which is encrypted with the sale's key. The
 * registry's calls go over a device's anonymous connections (relay.ts, RelayChannel), never over
 * its account's: a relay may tie together what one of them carries (a device's sales, its reads of
 * the registry), never to the business's keys but by the device's IP address.
 */

/** What the record is (src/lib/nostr/record.ts). */
const RECORD_TYPE = "registry-declaration";

/**
 * Format of a declaration. A change of what it holds needs a new one, except an optional field that
 * readers without it may ignore: `taker`, which only the owner reads (an older app
 * leaves it aside; a new version would make it refuse the declaration). A later format keeps the
 * outside as it is (NIP-44 v2 under outerKey) and raises this version inside: anybody may publish
 * at d(H), so the owner's reads take a content of a newer NIP-44 version there for no declaration
 * (ownerDeclarationsIn), never for a newer format.
 */
const DECLARATION_VERSION = 1;

/**
 * Domain of the keys of a sale. Never change it, nor the `info` strings, once released: every
 * declaration would be lost.
 */
const SALE_SALT = "sattle.me/sale";

/**
 * Domain of the outer key of a declaration (outerKey). Never change it, nor its `info`, once
 * released: every declaration would be lost.
 */
const DECLARATION_SALT = "sattle.me/registry-declaration";

/** The keys of one sale: its Nostr identity signs its declarations. */
export type SaleKeys = { nostr: NostrKeys };

/** The keys of the sale whose own key is `saleKey` (32 bytes, random, carried by its link). */
export function deriveSaleKeys(saleKey: Uint8Array): SaleKeys {
  return { nostr: nostrKeys(deriveKey(saleKey, SALE_SALT, "nostr-secret-key/v1")) };
}

/** The business's registry, as its devices and payment links hold it. */
export type BusinessRegistry = {
  /** The registry key (32 bytes): where declarations go, d(H). */
  key: Uint8Array;
  /** Hex: the public half of the business's reading key (deriveRegistryReader). */
  reader: string;
  /**
   * Hex: the public half of the business's link owner key (deriveLinkOwner): the owner signs the
   * final version of a sale's payment link with it, tweaked by the sale's key.
   */
  owner: string;
  /**
   * Hex: the public half of the business's link key reader (deriveLinkKeyReader): a device seals
   * its payment links' signing keys for it (sealed-key.ts). Absent where an owner's app of before
   * told the registry (a channel, the device's saved record): sealed for `reader` then, as before.
   * Never in a link nor a declaration.
   */
  linkKeyReader?: string;
  /**
   * The export epoch its declarations are sealed at inside (sealInside), with that epoch's reading
   * key (hex, its public half): a payment link's, which names it (payload.ts). Absent: the epoch
   * this device holds for `reader` (epochReaderFor of src/lib/nostr/epochs.ts), if any.
   */
  readerEpoch?: ReaderEpoch;
};

/** An export epoch (≥ 1) and the registry's reading key of that epoch (hex, its public half). */
export type ReaderEpoch = { epoch: number; reader: string };

/** What a sale declares its invoices with. */
export type Registry = BusinessRegistry & {
  /** The sale's own key (32 bytes): its declarations carry it, for the owner. */
  saleKey: Uint8Array;
  saleKeys: SaleKeys;
  /**
   * The relays of the sale's declarations: those its payment link names, on the payer's page.
   * Unset at the point of sale: the device's (currentRelays), read at each call.
   */
  relays?: readonly string[];
  /** Who took the sale (takerTag): its declarations carry it. Unset: they do not say. */
  taker?: string;
};

/**
 * The registry of the sale whose own key is `saleKey`, in the business's registry, on `relays`
 * (unset: the device's).
 */
export function saleRegistry(
  business: BusinessRegistry,
  saleKey: Uint8Array,
  relays?: readonly string[],
  taker?: string | null
): Registry {
  const readerEpoch = business.readerEpoch ?? epochReaderFor(business.reader);
  return {
    ...business,
    saleKey,
    saleKeys: deriveSaleKeys(saleKey),
    ...(relays ? { relays } : {}),
    ...(taker ? { taker } : {}),
    ...(readerEpoch ? { readerEpoch } : {})
  };
}

/** Length of a taker's mark, in bytes: 128 bits, never guessed. */
const TAKER_TAG_BYTES = 16;

/**
 * Who took a sale, as its declarations say it to the owner: an HMAC of the
 * sale's identity (the declarations' author, hex) with the key of whoever took it, one of the
 * owner's devices, an employee or an integration's server (ownerTakerKey, memberTakerKey of
 * src/lib/team/keys.ts, deriveIntegrationKeys of src/lib/integrations/keys.ts). Only they make it,
 * the owner checks it: a payer or another employee holding the sale's key cannot. Bound to the
 * sale, not to an invoice: a payment link carries it, and its page's declarations too.
 */
export function takerTag(takerKey: Uint8Array, saleAuthor: string): string {
  return bytesToHex(hmac(sha256, takerKey, hexToBytes(saleAuthor)).slice(0, TAKER_TAG_BYTES));
}

export function isTakerTag(value: unknown): value is string {
  return typeof value === "string" && new RegExp(`^[0-9a-f]{${TAKER_TAG_BYTES * 2}}$`).test(value);
}

/** What the declarations of a sale tell the owner about it, besides each invoice. */
export type DeclaredSale = {
  /** The fiat amount, in minor units of `currency` with its `digits`. */
  fiat: { minor: number; digits: number; currency: string };
  note: string;
};

/**
 * The currency of a sale asked in sats alone, without digits (an integration's server, when its
 * integrator gives no price: docs/integrations.md): its `minor` is the sats.
 */
export const SATS_CURRENCY = "SAT";

const declarationKeys = new WeakMap<Registry, Uint8Array>();

/**
 * The key a sale's declarations are encrypted with: its conversation with the business. Computed
 * once per registry (an ECDH): a sale reads its declarations every 30 s.
 */
export function declarationKey(registry: Registry): Uint8Array {
  let key = declarationKeys.get(registry);
  if (!key) {
    key = conversationKey(registry.saleKeys.nostr.secretKey, registry.reader);
    declarationKeys.set(registry, key);
  }
  return key;
}

/**
 * What opens the inside of a declaration (its `sealed`): the conversation of its sale with the
 * registry's reading key of before epochs (`key`), and with the reading key of an epoch its
 * envelope names (`epochKey`, null when the reader has none of it).
 */
export type InnerKeys = { key: Uint8Array; epochKey: (epoch: number) => Uint8Array | null };

/**
 * The inside of a declaration of `registry` holding `value`: sealed for the sale and the business
 * (declarationKey); at an export epoch (`readerEpoch`), sealed for the sale and that epoch's
 * reading key, inside an envelope sealed as before (src/lib/team/export-epoch.ts), so that a copy
 * of a withdrawn export grant (the reading key of before) opens the envelope only, and an owner's
 * app from before epochs reads a version above its own: a declaration of a newer format, never
 * taken for none (settledDeclarationsOf leaves its payment undecided).
 */
export function sealInside(registry: Registry, value: unknown): string {
  const text = JSON.stringify(value);
  const epoch = registry.readerEpoch;
  if (!epoch) return nip44Encrypt(text, declarationKey(registry));
  const sealed = nip44Encrypt(
    text,
    conversationKey(registry.saleKeys.nostr.secretKey, epoch.reader)
  );
  return nip44Encrypt(
    JSON.stringify({ version: EPOCH_ENVELOPE_VERSION, epoch: epoch.epoch, sealed }),
    declarationKey(registry)
  );
}

/**
 * The value inside a declaration (`sealed`, sealInside), opened with `inner`: null when it does not
 * open (or is no value); throws NewerRecordError for an envelope of an epoch the reader has no key
 * of (a declaration it cannot read, never taken for none).
 */
export function openInside(sealed: string, inner: InnerKeys): unknown {
  let value: unknown;
  try {
    value = JSON.parse(nip44Decrypt(sealed, inner.key));
  } catch {
    return null;
  }
  const envelope = value as { version?: unknown; epoch?: unknown; sealed?: unknown } | null;
  if (
    envelope === null ||
    typeof envelope !== "object" ||
    envelope.version !== EPOCH_ENVELOPE_VERSION
  ) {
    return value;
  }
  const { epoch } = envelope;
  if (
    !Number.isSafeInteger(epoch) ||
    (epoch as number) < 1 ||
    typeof envelope.sealed !== "string"
  ) {
    return null;
  }
  const key = inner.epochKey(epoch as number);
  if (!key) throw new NewerRecordError();
  try {
    const opened: unknown = JSON.parse(nip44Decrypt(envelope.sealed, key));
    // An envelope within an envelope: no app writes one.
    const again = opened as { version?: unknown } | null;
    return again !== null && typeof again === "object" && again.version === EPOCH_ENVELOPE_VERSION
      ? null
      : opened;
  } catch {
    return null;
  }
}

/**
 * What the owner opens the inside of a declaration of `author` with: `reader`, the registry's
 * reading key of before epochs, and the reading keys of the epochs this device holds for it
 * (epochReadersOf). Each conversation is computed once asked (an ECDH).
 */
export function ownerInnerKeys(reader: NostrKeys, author: string): InnerKeys {
  return {
    key: conversationKey(reader.secretKey, author),
    epochKey: (epoch) => {
      const held = epochReadersOf(epoch, reader.publicKey).find(({ secretKey }) => secretKey);
      return held?.secretKey ? conversationKey(held.secretKey, author) : null;
    }
  };
}

/**
 * What a sale opens its own declarations with (fetchDeclaredInvoices): its conversation with the
 * registry's reading key of before epochs, and with the reading key of the epoch it seals at, or
 * of another one this device holds the public half of.
 */
export function saleInnerKeys(registry: Registry): InnerKeys {
  return {
    key: declarationKey(registry),
    epochKey: (epoch) => {
      const reader =
        registry.readerEpoch?.epoch === epoch
          ? registry.readerEpoch.reader
          : epochReadersOf(epoch, registry.reader)[0]?.publicKey;
      return reader ? conversationKey(registry.saleKeys.nostr.secretKey, reader) : null;
    }
  };
}

/** d(H): where the declarations of payment hash `paymentHash` (hex) are. */
export function registryAddress(registryKey: Uint8Array, paymentHash: string): string {
  return bytesToHex(hmac(sha256, registryKey, hexToBytes(paymentHash)));
}

/**
 * The key a declaration at `address` (d(H)) by `author` (hex) is sealed with, outside: only a
 * holder of the registry key computes it, so that a declaration that opens with it was made by one
 * (the business's devices, a payment link's holders), for this address and this author.
 */
export function outerKey(registryKey: Uint8Array, address: string, author: string): Uint8Array {
  return deriveKey(registryKey, DECLARATION_SALT, `outer/v1/${address}/${author}`);
}

/** The outside of a declaration: the declaration, sealed for the sale and the business. */
type Outer = { sealed: string };

function parseOuter(value: unknown): Outer | null {
  if (value === null || typeof value !== "object") return null;
  const { sealed } = value as Record<string, unknown>;
  return typeof sealed === "string" ? { sealed } : null;
}

type Declaration = {
  version: typeof DECLARATION_VERSION;
  invoice: string;
  verifyUrl: string;
  /** The sale it was asked for: its own key (hex), for the owner, and what it is for. */
  sale: { key: string } & DeclaredSale;
  /** Who took the sale (takerTag), when its device could say it; optional in version 1. */
  taker?: string;
};

/**
 * A declaration opened: its invoice, the sale it was asked for, and who took it (takerTag), null
 * when it does not say (or not in its form).
 */
export type OpenedDeclaration = {
  invoice: Invoice;
  saleKey: Uint8Array;
  taker: string | null;
} & DeclaredSale;

export function parseSale(value: unknown): ({ key: Uint8Array } & DeclaredSale) | null {
  if (value === null || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const fiat = v.fiat as Record<string, unknown> | null;
  if (typeof v.key !== "string" || !/^[0-9a-f]{64}$/.test(v.key)) return null;
  if (typeof v.note !== "string" || fiat === null || typeof fiat !== "object") return null;
  const { minor, digits, currency } = fiat;
  if (typeof minor !== "number" || !Number.isSafeInteger(minor) || minor < 0) return null;
  if (typeof digits !== "number" || !Number.isInteger(digits) || digits < 0 || digits > 8) {
    return null;
  }
  if (typeof currency !== "string" || !/^[A-Z]{3}$/.test(currency)) return null;
  return { key: hexToBytes(v.key), fiat: { minor, digits, currency }, note: v.note };
}

/**
 * A declaration, if it opens with `innerKey` (its conversation between the sale and the business),
 * is valid and declared at its own d(H).
 */
function parseDeclaration(registryKey: Uint8Array, network: string, inner: InnerKeys) {
  return (outside: unknown, event: NostrEvent): OpenedDeclaration | null => {
    const outer = parseOuter(outside);
    if (!outer) return null;
    const value = openInside(outer.sealed, inner);
    if (value === null || typeof value !== "object") return null;
    const v = value as Record<string, unknown>;
    if (typeof v.version === "number" && v.version > DECLARATION_VERSION) {
      throw new NewerRecordError();
    }
    if (v.version !== DECLARATION_VERSION || typeof v.invoice !== "string") return null;
    if (!isHttpsUrl(v.verifyUrl)) return null;
    const sale = parseSale(v.sale);
    if (!sale) return null;
    const decoded = decodeBolt11(v.invoice);
    if (!decoded || decoded.network !== network || decoded.amountMsat === null) return null;
    if (decoded.amountMsat <= 0n || decoded.amountMsat % 1000n !== 0n) return null;
    const address = event.tags.find(([name]) => name === "d")?.[1];
    if (address !== registryAddress(registryKey, decoded.paymentHash)) return null;
    return {
      invoice: { pr: v.invoice, decoded, verifyUrl: v.verifyUrl },
      saleKey: sale.key,
      fiat: sale.fiat,
      note: sale.note,
      taker: isTakerTag(v.taker) ? v.taker : null
    };
  };
}

/** The signed declaration of `invoice` for the sale of `registry`, which `sale` describes. */
export function declarationEvent(
  registry: Registry,
  invoice: Invoice,
  sale: DeclaredSale,
  now: number = nowUnix()
): NostrEvent {
  const declaration: Declaration = {
    version: DECLARATION_VERSION,
    invoice: invoice.pr,
    verifyUrl: invoice.verifyUrl,
    sale: { key: bytesToHex(registry.saleKey), fiat: sale.fiat, note: sale.note },
    ...(registry.taker ? { taker: registry.taker } : {})
  };
  const address = registryAddress(registry.key, invoice.decoded.paymentHash);
  const value: Outer = { sealed: sealInside(registry, declaration) };
  return sealRecord({
    type: RECORD_TYPE,
    value,
    signer: registry.saleKeys.nostr.secretKey,
    encryptionKey: outerKey(registry.key, address, registry.saleKeys.nostr.publicKey),
    address,
    // No end: a payment declared once stays claimed by its sale.
    createdAt: now
  });
}

type RelayList = { relays?: readonly string[]; timeoutMs?: number };

/**
 * Declares `invoice` for the sale: resolves once a majority of the relays took the declaration,
 * rejects when they no longer can. Its code may be shown only then.
 */
export function declareInvoice(
  registry: Registry,
  invoice: Invoice,
  sale: DeclaredSale,
  { relays = registry.relays ?? currentRelays(), timeoutMs = REGISTRY_TIMEOUT_MS }: RelayList = {}
): Promise<void> {
  const event = declarationEvent(registry, invoice, sale);
  return publishToQuorum(
    event,
    { channel: "anonymous", relays, timeoutMs, authKey: registry.saleKeys.nostr.secretKey },
    majority(relays.length)
  );
}

/**
 * The invoices declared for the sale, by any device that holds its key: one per payment request,
 * checked as a declaration (author, address, signature), not yet as a payment of the merchant
 * (checkDeclaredInvoice). Null when fewer than a majority of the relays answered: every
 * declaration was published on a majority, so a majority's answers hold them all. Never rejects.
 */
export async function fetchDeclaredInvoices(
  registry: Registry,
  network: string,
  { relays = registry.relays ?? currentRelays(), timeoutMs = REGISTRY_TIMEOUT_MS }: RelayList = {}
): Promise<Invoice[] | null> {
  const author = registry.saleKeys.nostr.publicKey;
  const answers = await queryRelays(
    { kinds: [RECORD_KIND], authors: [author] },
    { channel: "anonymous", relays, timeoutMs, authKey: registry.saleKeys.nostr.secretKey },
    { quorum: "majority" }
  );
  if (answers.size < majority(relays.length)) return null;
  const parse = parseDeclaration(registry.key, network, saleInnerKeys(registry));
  const invoices = new Map<string, Invoice>();
  // One event goes to every relay: identical copies are opened (key, decryption, signature) once,
  // every 30 s of a sale. Keyed by the whole copy, so that an altered one is opened on its own.
  const seen = new Set<string>();
  for (const events of answers.values()) {
    for (const value of events) {
      const copy = JSON.stringify(value) ?? "";
      if (seen.has(copy)) continue;
      seen.add(copy);
      try {
        const address = dTagOf(value);
        if (address === null) continue;
        const opened = openRecord(value, {
          type: RECORD_TYPE,
          encryptionKey: outerKey(registry.key, address, author),
          address,
          author,
          parse
        });
        // One per payment: the same invoice may come written otherwise from another relay (BOLT11
        // is read in either case), it is still one payment.
        const { invoice } = opened?.status === "ok" ? opened.value : { invoice: null };
        if (invoice && !invoices.has(invoice.decoded.paymentHash)) {
          invoices.set(invoice.decoded.paymentHash, invoice);
        }
      } catch {
        // A damaged copy: another relay may hold a good one.
      }
    }
  }
  return [...invoices.values()];
}

/** Whether a payment belongs to one sale only. */
export type Uniqueness =
  | "unique"
  /** Another sale declared it too: it counts for none, the owner settles it. */
  | "conflict"
  /** Fewer than a majority of the relays answered: asked again later. */
  | "unknown";

/** d(H) → H, for each of `hashes`, at the addresses of registry key `key`. */
function addressesOf(key: Uint8Array, hashes: readonly string[]): Map<string, string> {
  return new Map(hashes.map((hash) => [registryAddress(key, hash), hash] as const));
}

/** The `d` tag of what a relay sent, null when it has none. */
export function dTagOf(value: unknown): string | null {
  const tags = (value as Partial<NostrEvent> | null)?.tags;
  if (!Array.isArray(tags)) return null;
  const tag = tags.find((entry) => Array.isArray(entry) && entry[0] === "d")?.[1];
  return typeof tag === "string" ? tag : null;
}

/**
 * At most this many events are asked of each relay at d(H) in a first read. Honest ones are one per
 * sale that declared the payment: one, two in a conflict. Anyone who saw d(H) can publish there,
 * and a relay sends the newest events first, up to its cap: an answer this long may have left a
 * declaration out, and is read again page after page (paymentUniqueness).
 */
export const UNIQUENESS_READ_LIMIT = 20;

/**
 * Whether d(H) holds a declaration of another author than the sale, read on every relay: only a
 * declaration made with the registry key counts (its outside opens with outerKey: a relay, or
 * anyone who saw d(H), cannot make one), whatever the declaration inside, which only its own sale
 * and the business can open. "unique" only from a majority of whole answers: shorter than
 * UNIQUENESS_READ_LIMIT, or, for the relays whose answer was that long, read page after page to the
 * end (else more than 20 events published there by anyone would hold the point of sale on
 * "checking" for good). A relay whose events at d(H) cannot all be read
 * (queryRelaysPaged, `whole`) does not count: events published there by anyone cannot push a
 * declaration out of a whole answer. Never rejects.
 */
export async function paymentUniqueness(
  registry: Registry,
  paymentHash: string,
  { relays = registry.relays ?? currentRelays(), timeoutMs = REGISTRY_TIMEOUT_MS }: RelayList = {}
): Promise<Uniqueness> {
  const address = registryAddress(registry.key, paymentHash);
  const call = {
    channel: "anonymous" as const,
    relays,
    timeoutMs,
    authKey: registry.saleKeys.nostr.secretKey
  };
  const answers = await queryRelays(
    { kinds: [RECORD_KIND], "#d": [address], limit: UNIQUENESS_READ_LIMIT },
    call,
    { quorum: "majority" }
  );
  if (answers.size < majority(relays.length)) return "unknown";
  const declaredByOther = otherDeclarationAt(registry, address);
  let whole = 0;
  const cut: string[] = [];
  for (const [relay, events] of answers) {
    if (events.some(declaredByOther)) return "conflict";
    if (events.length < UNIQUENESS_READ_LIMIT) whole += 1;
    else cut.push(relay);
  }
  if (whole >= majority(relays.length)) return "unique";
  if (whole + cut.length < majority(relays.length)) return "unknown";
  // Answers cut at the limit: every event at d(H), from the relays that send them all, as many
  // as the majority of whole answers lacks.
  const paged = await queryRelaysPaged(
    { kinds: [RECORD_KIND], "#d": [address] },
    { ...call, relays: cut },
    { whole: true, quorum: { count: majority(relays.length) - whole } }
  );
  for (const events of paged.values()) {
    if (events.some(declaredByOther)) return "conflict";
    whole += 1;
  }
  return whole >= majority(relays.length) ? "unique" : "unknown";
}

/** Whether what a relay sent at d(H) `address` is a declaration of another sale than `registry`. */
function otherDeclarationAt(registry: Registry, address: string): (value: unknown) => boolean {
  const ours = registry.saleKeys.nostr.publicKey;
  return (value) => {
    const author = (value as Partial<NostrEvent> | null)?.pubkey;
    if (typeof author !== "string" || author === ours) return false;
    const opened = openRecord(value, {
      type: RECORD_TYPE,
      encryptionKey: outerKey(registry.key, address, author),
      address,
      author,
      parse: parseOuter
    });
    return opened?.status === "ok";
  };
}

/** At most this many payment hashes per read: relays bound the size of a filter. */
const HASHES_PER_READ = 50;

/**
 * At most this many events are asked of each relay in a first read of ownerDeclarationsOf: no more
 * than any relay sends at once (PAGE_FLOOR), so that an answer shorter than it is whole. Honest
 * ones are one per sale that declared a payment; an answer this long may have left a declaration
 * out, and is read again page after page.
 */
export const OWNER_READ_LIMIT = PAGE_FLOOR;

/** A declaration as the owner reads it: which sale (its key's public half) declared what. */
export type OwnerDeclaration = OpenedDeclaration & {
  /** Hex: the sale's Nostr identity, the declaration's author (the same for all its invoices). */
  author: string;
};

/**
 * The declarations of payment hash `paymentHash` (hex), read by the owner with the business's
 * reading key (deriveRegistryReader): one per sale that declared it, each with the sale's own key,
 * fiat amount and note, whichever device made it (an employee's, a payer's page). Null when fewer
 * than a majority of the relays answered. Never rejects.
 */
export async function ownerDeclarations(
  owner: { key: Uint8Array; reader: NostrKeys },
  paymentHash: string,
  network: string,
  list: RelayList = {}
): Promise<OwnerDeclaration[] | null> {
  const found = await ownerDeclarationsOf(owner, [paymentHash], network, list);
  return found === null ? null : (found.get(paymentHash) ?? []);
}

/**
 * The declarations of several payment hashes (ownerDeclarations), in as few reads as they need, by
 * payment hash. Short of a majority of whole answers (shorter than OWNER_READ_LIMIT), the answers
 * cut at it are read again page after page, as far as they go: not a decision for good
 * (settledDeclarationsOf reads whole answers only). Null when a read
 * got fewer than a majority of the relays. Never rejects.
 */
export async function ownerDeclarationsOf(
  owner: { key: Uint8Array; reader: NostrKeys },
  paymentHashes: readonly string[],
  network: string,
  { relays = currentRelays(), timeoutMs = REGISTRY_TIMEOUT_MS }: RelayList = {}
): Promise<Map<string, OwnerDeclaration[]> | null> {
  const result = new Map<string, OwnerDeclaration[]>();
  const hashes = [...new Set(paymentHashes)];
  for (let start = 0; start < hashes.length; start += HASHES_PER_READ) {
    const byAddress = addressesOf(owner.key, hashes.slice(start, start + HASHES_PER_READ));
    const filter = { kinds: [RECORD_KIND], "#d": [...byAddress.keys()] };
    // A relay that asks to authenticate gets the anonymous connection's own key (relay.ts): never
    // the reading key, which would name the business behind the owner's reads.
    const call = { channel: "anonymous" as const, relays, timeoutMs };
    const answers = await queryRelays({ ...filter, limit: OWNER_READ_LIMIT }, call, {
      quorum: "majority"
    });
    if (answers.size < majority(relays.length)) return null;
    // Answers cut at the limit (anyone who saw d(H) can publish there, and a relay sends the
    // newest events first, up to its cap, which can push a declaration out). A majority of whole
    // answers holds every declaration (each was written to a majority, any two majorities share a
    // relay); short of it, the cut ones are read again page after page, as many as it lacks
    // (queryRelaysPaged), each kept as far as it went.
    const whole = [...answers.values()].filter((events) => events.length < OWNER_READ_LIMIT);
    const cut = [...answers.keys()].filter(
      (relay) => answers.get(relay)!.length >= OWNER_READ_LIMIT
    );
    const lacking = majority(relays.length) - whole.length;
    if (lacking > 0 && cut.length > 0) {
      const paged = await queryRelaysPaged(
        filter,
        { ...call, relays: cut },
        { quorum: { count: Math.min(lacking, cut.length) } }
      );
      for (const [relay, events] of paged) answers.set(relay, events);
    }
    const { opened } = ownerDeclarationsIn(owner, network, answers, byAddress);
    for (const hash of byAddress.values()) {
      result.set(hash, [...(opened.get(hash)?.values() ?? [])]);
    }
  }
  return result;
}

/**
 * Calls `open` with each event `answers` hold at one of `byAddress`'s addresses (d(H) → H), with
 * its address, payment hash and author, until one of an author's copies at an address opened
 * (`open` gives true): one event goes to every relay, and an author has one per address. A copy
 * that does not open hides no other: a relay may send a damaged copy, or garbage under a real
 * event's id, and a declaration left out could decide a conflict "unique" for good
 * (settledDeclarationsOf). `open` throwing (a key that is not a point, conversationKey) is a copy
 * that does not open.
 */
export function eachDeclaration(
  answers: ReadonlyMap<string, readonly unknown[]>,
  byAddress: ReadonlyMap<string, string>,
  open: (value: unknown, at: { address: string; hash: string; author: string }) => boolean
): void {
  const done = new Set<string>();
  for (const events of answers.values()) {
    for (const value of events) {
      const author = (value as Partial<NostrEvent> | null)?.pubkey;
      const address = dTagOf(value);
      const hash = address === null ? undefined : byAddress.get(address);
      if (typeof author !== "string" || address === null || hash === undefined) continue;
      const seen = `${address}:${author}`;
      if (done.has(seen)) continue;
      let opened = false;
      try {
        opened = open(value, { address, hash, author });
      } catch {
        // Not a declaration of this business: another relay may hold a good one.
      }
      if (opened) done.add(seen);
    }
  }
}

/**
 * The declarations the owner reads among `answers` at `byAddress`'s addresses (ownerDeclarationsOf,
 * settledDeclarationsOf), by payment hash: `opened`, each sale's that opens with the business's
 * reading key, for that very payment and signed by that very sale (the first copy that opens), and
 * `newer`, the authors of one of a newer format. Anything else at d(H) is no declaration of this
 * business.
 */
function ownerDeclarationsIn(
  owner: { key: Uint8Array; reader: NostrKeys },
  network: string,
  answers: ReadonlyMap<string, readonly unknown[]>,
  byAddress: ReadonlyMap<string, string>
): { opened: Map<string, Map<string, OwnerDeclaration>>; newer: Map<string, Set<string>> } {
  const opened = new Map<string, Map<string, OwnerDeclaration>>();
  const newer = new Map<string, Set<string>>();
  eachDeclaration(answers, byAddress, (value, { address, hash, author }) => {
    const found = openRecord(value, {
      type: RECORD_TYPE,
      encryptionKey: outerKey(owner.key, address, author),
      address,
      author,
      parse: parseDeclaration(owner.key, network, ownerInnerKeys(owner.reader, author)),
      // Anybody who saw d(H) may publish there under a key of their own: a content of a newer
      // NIP-44 version is no declaration (it would leave the payment undecided for good, its copy
      // held back). A newer format is one that opens outside with the registry key, its version
      // inside above DECLARATION_VERSION (parseDeclaration), which only a holder of the key seals.
      newerContentIgnored: true
    });
    // A declaration holds the invoice of its own address only (parseDeclaration), and is signed by
    // the sale it names: whoever holds another sale's key cannot speak for it.
    if (
      found?.status === "ok" &&
      found.value.invoice.decoded.paymentHash === hash &&
      deriveSaleKeys(found.value.saleKey).nostr.publicKey === author
    ) {
      const bySale = opened.get(hash) ?? new Map<string, OwnerDeclaration>();
      bySale.set(author, { ...found.value, author });
      opened.set(hash, bySale);
      return true;
    }
    // Not taken as opened: an older copy of the same author, on another relay, may open.
    if (found?.status === "newer") newer.set(hash, (newer.get(hash) ?? new Set()).add(author));
    return false;
  });
  return { opened, newer };
}

/** At most this many payment hashes per read of settledDeclarationsOf. */
const SETTLED_HASHES_PER_READ = 20;

/**
 * At most this many events are asked of each relay per read of settledDeclarationsOf. Honest ones
 * are one per sale that declared a payment: one per payment, two in a conflict. Anyone who saw
 * d(H) can publish there, and a relay sends the newest events first, up to its cap: an answer this
 * long may have left a declaration out, and never decides (as UNIQUENESS_READ_LIMIT).
 */
export const SETTLED_READ_LIMIT = 100;

/** What the registry holds of a payment, decided for good (settledDeclarationsOf). */
export type SettledDeclaration =
  /** One sale declared it: its declaration, opened. */
  | { status: "unique"; declaration: OwnerDeclaration }
  /** No sale of this business did (as ownerDeclarationsOf reads them, "Wallet"). */
  | { status: "none" }
  /** Two sales or more did: it counts for none. */
  | { status: "conflict" };

/**
 * For the owner's copy of the declarations (archive.ts): what the registry holds of each of
 * `paymentHashes`, decided for good, as "Wallet" reads it (ownerDeclarationsOf): the
 * declarations at d(H) that open with the business's reading key, each signed by the sale it names.
 * One sale's is "unique"; two sales' or more, a "conflict" (it counts for none); none, "none".
 * Anything else at d(H), sealed with the registry key or not (another sale's content, a value no
 * app writes), is no declaration of this business, as "Wallet" ignores it: whoever holds the
 * registry key (an employee or an integrator removed since, a payer) can neither take a sale's
 * "By" away from the copy nor hold back the copies of the months after it. A payment with a
 * declaration of a newer format, of another sale than the one opened, is left out: undecided (a
 * newer app's copy decides it). Decided only from a majority of whole answers (shorter than
 * SETTLED_READ_LIMIT), read SETTLED_HASHES_PER_READ addresses at a time. Null when a read got no
 * majority of whole answers. Never rejects.
 */
export async function settledDeclarationsOf(
  owner: { key: Uint8Array; reader: NostrKeys },
  paymentHashes: readonly string[],
  network: string,
  { relays = currentRelays(), timeoutMs = REGISTRY_TIMEOUT_MS }: RelayList = {}
): Promise<Map<string, SettledDeclaration> | null> {
  const result = new Map<string, SettledDeclaration>();
  const hashes = [...new Set(paymentHashes)];
  for (let start = 0; start < hashes.length; start += SETTLED_HASHES_PER_READ) {
    const byAddress = addressesOf(owner.key, hashes.slice(start, start + SETTLED_HASHES_PER_READ));
    const answers = await queryRelays(
      { kinds: [RECORD_KIND], "#d": [...byAddress.keys()], limit: SETTLED_READ_LIMIT },
      // The anonymous connection's own key (relay.ts): never the reading key (ownerDeclarationsOf).
      // A majority of whole answers or nothing decided: a relay given up meanwhile, or one whose
      // answer was cut, leaves the payments to the next read.
      { channel: "anonymous", relays, timeoutMs },
      { quorum: "majority" }
    );
    const whole = [...answers.values()].filter((events) => events.length < SETTLED_READ_LIMIT);
    if (whole.length < majority(relays.length)) return null;
    const { opened, newer } = ownerDeclarationsIn(owner, network, answers, byAddress);
    for (const hash of byAddress.values()) {
      const sales = opened.get(hash) ?? new Map<string, OwnerDeclaration>();
      // A newer app's declaration, of another sale than those opened: maybe a conflict.
      const unknown = [...(newer.get(hash) ?? [])].some((author) => !sales.has(author));
      if (sales.size > 1) result.set(hash, { status: "conflict" });
      else if (unknown) continue;
      else if (sales.size === 1) {
        result.set(hash, { status: "unique", declaration: [...sales.values()][0]! });
      } else result.set(hash, { status: "none" });
    }
  }
  return result;
}

/**
 * The keys a copy of declarations uses: where they are (`key`, the registry key), and what opens
 * them inside (`reader`, the owner's reading key: an employee's device has none).
 */
export type CopyKeys = { key: Uint8Array; reader?: NostrKeys };

/** What a copy of the declarations did (copyDeclarations). */
export type DeclarationsCopy = {
  /** Declarations found on the list left: every sale's, conflicts included. */
  found: number;
  /** Those a majority of the new list holds now: they count there (paymentUniqueness). */
  held: number;
  /**
   * Payment hashes whose read got fewer than a majority of the list left: a declaration of theirs
   * may have been missed (a declaration is on a majority, a minority may not hold it).
   */
  unread: number;
};

/** Two copies' counts together (the declarations of payment hashes and of transactions). */
export function sumCopies(a: DeclarationsCopy, b: DeclarationsCopy): DeclarationsCopy {
  return { found: a.found + b.found, held: a.held + b.held, unread: a.unread + b.unread };
}

/**
 * A kind of the registry's declarations, as a copy finds them: their record's type, the address a
 * subject gives them (d(H) of a payment hash; the on-chain payments' d(T) of a transaction,
 * onchain-payments.ts), and the sale's key of one opened inside with `innerKey` for that very
 * subject, null otherwise (throws NewerRecordError for a newer format).
 */
export type DeclarationKind = {
  type: string;
  addressOf: (registryKey: Uint8Array, subject: string) => string;
  saleKeyOf: (
    registryKey: Uint8Array,
    network: string,
    inner: InnerKeys,
    subject: string,
    outside: unknown,
    event: NostrEvent
  ) => Uint8Array | null;
};

/** The declarations of Lightning payments, by payment hash. */
const PAYMENT_DECLARATIONS: DeclarationKind = {
  type: RECORD_TYPE,
  addressOf: registryAddress,
  saleKeyOf: (registryKey, network, inner, hash, outside, event) => {
    const inside = parseDeclaration(registryKey, network, inner)(outside, event);
    return inside?.invoice.decoded.paymentHash === hash ? inside.saleKey : null;
  }
};

/** A declaration found on the list left, as it is copied (copyDeclarations). */
type FoundDeclaration = {
  event: NostrEvent;
  /** The sale's own key, when the owner opened the declaration inside: its author's identity. */
  saleKey: Uint8Array | null;
  /** The relays of the list left whose answer held this very event. */
  holders: Set<string>;
};

/**
 * Copies the declarations of `paymentHashes` (hex: the wallet's payments received, or a device's
 * own sales; of `kind`, its subjects: the transactions of the on-chain payments' declarations,
 * onchain-payments.ts) from the relays `from` (a list the account left) to the relays `to` (its new
 * one),
 * for "Wallet", which
 * reads them on the account's list (readDeclarations): each event as it is, signed by its sale,
 * never opened again nor signed again. Read HASHES_PER_READ addresses at a time, page by page
 * (queryRelaysPaged: anyone may publish at d(H), a relay caps what it sends). Every declaration at
 * d(H) is copied, conflicts included (each sale's, newestEvents: one per author and address), so
 * that a payment two sales declared still counts for none on the new list; only those that open
 * with the registry key (outerKey), as paymentUniqueness counts them: an event anyone else
 * published at d(H) stays behind.
 *
 * Each goes to the relays of `to` whose answer did not hold it (those `from` shares with `to` and
 * that sent it hold it already). A relay may only take an author's events once that author
 * authenticated (NIP-42 lets a relay restrict writes so): the owner opens each declaration with the
 * reading key, inside, which gives the sale's key, and authenticates as the sale; a declaration
 * it cannot open inside (a newer format), or a copy without the reading key (an employee's
 * device), goes with the anonymous connection's own key (relay.ts).
 *
 * `keys` is asked again before each read and each publication: it throws once the account closed
 * (its keys wiped), and the copy rejects with it, nothing more published. Never rejects otherwise.
 */
export async function copyDeclarations(
  keys: () => CopyKeys,
  paymentHashes: readonly string[],
  network: string,
  from: readonly string[],
  to: readonly string[],
  timeoutMs: number = REGISTRY_TIMEOUT_MS,
  kind: DeclarationKind = PAYMENT_DECLARATIONS
): Promise<DeclarationsCopy> {
  const result: DeclarationsCopy = { found: 0, held: 0, unread: 0 };
  const hashes = [...new Set(paymentHashes)];
  for (let start = 0; start < hashes.length; start += HASHES_PER_READ) {
    const batch = hashes.slice(start, start + HASHES_PER_READ);
    const { key } = keys();
    const byAddress = new Map(batch.map((hash) => [kind.addressOf(key, hash), hash] as const));
    const answers = await queryRelaysPaged(
      { kinds: [RECORD_KIND], "#d": [...byAddress.keys()] },
      // As ownerDeclarationsOf: the anonymous connection's own key, never the reading key.
      { channel: "anonymous", relays: from, timeoutMs },
      { quorum: "majority" }
    );
    if (answers.size < majority(from.length)) result.unread += batch.length;
    const { found, saleKeys } = foundDeclarations(answers, byAddress, keys(), network, kind);
    result.found += found.length;
    try {
      await publishFound(keys, found, to, timeoutMs, result);
    } finally {
      // The sales' keys go with their batch (AGENTS.md: no secret kept longer than needed).
      for (const saleKey of saleKeys) saleKey.fill(0);
    }
  }
  return result;
}

/** Publishes `found` to the relays of `to` that lack it (copyDeclarations), counting `held`. */
async function publishFound(
  keys: () => CopyKeys,
  found: readonly FoundDeclaration[],
  to: readonly string[],
  timeoutMs: number,
  result: DeclarationsCopy
): Promise<void> {
  for (let next = 0; next < found.length; next += COPIES_AT_ONCE) {
    keys();
    const held = await Promise.all(
      found.slice(next, next + COPIES_AT_ONCE).map(async ({ event, saleKey, holders }) => {
        const already = to.filter((relay) => holders.has(relay));
        const missing = to.filter((relay) => !holders.has(relay));
        const took =
          missing.length === 0
            ? []
            : await publishAgain(
                event,
                {
                  relays: missing,
                  timeoutMs,
                  channel: "anonymous",
                  // Without the sale's key: the connection's own (relay.ts).
                  authKey: saleKey
                    ? () => {
                        // Refused once the account closed.
                        keys();
                        return deriveSaleKeys(saleKey).nostr.secretKey;
                      }
                    : undefined
                },
                // What the majority of `to` lacks; the others take it in the background.
                { quorum: { count: majority(to.length) - already.length } }
              );
        return already.length + took.length >= majority(to.length);
      })
    );
    result.held += held.filter(Boolean).length;
  }
}

/**
 * Of what the relays sent at the addresses of `byAddress` (d(H) → H), the declarations made with
 * the registry key (copyDeclarations): the newest of each author at each address, with the relays
 * that sent it, and its sale's key when the owner opens it inside. Identical copies are opened once
 * (keyed by the whole copy, as fetchDeclaredInvoices: an altered one is opened on its own).
 */
function foundDeclarations(
  answers: ReadonlyMap<string, readonly unknown[]>,
  byAddress: ReadonlyMap<string, string>,
  { key, reader }: CopyKeys,
  network: string,
  kind: DeclarationKind
): { found: FoundDeclaration[]; saleKeys: Uint8Array[] } {
  const opened = new Map<string, { event: NostrEvent; saleKey: Uint8Array | null } | null>();
  const newest = new Map<string, FoundDeclaration>();
  for (const [relay, values] of answers) {
    for (const value of values) {
      const copy = JSON.stringify(value) ?? "";
      let declaration = opened.get(copy);
      if (declaration === undefined) {
        declaration = openFound(value, byAddress, key, reader, network, kind);
        opened.set(copy, declaration);
      }
      if (!declaration) continue;
      const { event } = declaration;
      const address = `${event.pubkey}:${dTagOf(event)}`;
      const known = newest.get(address);
      if (known?.event.id === event.id) {
        known.holders.add(relay);
        continue;
      }
      // The copy relays keep (NIP-01, newestEvents): the newest, and of two as old the lowest id.
      if (
        !known ||
        event.created_at > known.event.created_at ||
        (event.created_at === known.event.created_at && event.id < known.event.id)
      ) {
        newest.set(address, { ...declaration, holders: new Set([relay]) });
      }
    }
  }
  const saleKeys = [...opened.values()].flatMap((found) => (found?.saleKey ? [found.saleKey] : []));
  return { found: [...newest.values()], saleKeys };
}

/**
 * What a relay sent, if it is a declaration at one of `byAddress`'s addresses that opens with the
 * registry key (outerKey), its signature checked; with its sale's key when the owner's reading key
 * opens it inside, for that very payment and signed by that very sale (as ownerDeclarationsOf).
 */
function openFound(
  value: unknown,
  byAddress: ReadonlyMap<string, string>,
  registryKey: Uint8Array,
  reader: NostrKeys | undefined,
  network: string,
  kind: DeclarationKind
): { event: NostrEvent; saleKey: Uint8Array | null } | null {
  const author = (value as Partial<NostrEvent> | null)?.pubkey;
  const address = dTagOf(value);
  const hash = address === null ? undefined : byAddress.get(address);
  if (typeof author !== "string" || address === null || hash === undefined) return null;
  try {
    const opened = openRecord(value, {
      type: kind.type,
      encryptionKey: outerKey(registryKey, address, author),
      address,
      author,
      parse: (outside, event) => {
        if (!parseOuter(outside)) return null;
        if (!reader) return { saleKey: null };
        let saleKey: Uint8Array | null = null;
        try {
          saleKey = kind.saleKeyOf(
            registryKey,
            network,
            ownerInnerKeys(reader, author),
            hash,
            outside,
            event
          );
        } catch {
          // A newer format inside: copied all the same, as it is.
        }
        if (saleKey === null || deriveSaleKeys(saleKey).nostr.publicKey !== author) {
          return { saleKey: null };
        }
        return { saleKey };
      }
    });
    return opened?.status === "ok" ? { event: opened.event, saleKey: opened.value.saleKey } : null;
  } catch {
    // A damaged copy: another relay may hold a good one.
    return null;
  }
}

/**
 * A declared invoice may be dated this much before its sale's start, or after the last moment it
 * asks an invoice: those and the date are all on the issuer's clock (src/lib/clock.ts), as each
 * device estimates it.
 */
export const SALE_START_TOLERANCE_SECONDS = 60;

/**
 * Whether a declared invoice can be a payment of the sale, whenever it is dated: an invoice of the
 * merchant's Lightning address (its description hash is the metadata's, and its verify URL is on
 * the address's LNURL server, whose LUD-21 answer must name this very invoice and come from that
 * URL itself, never through a redirect: its path is the declarer's, paidPreimage), of
 * this network, for whole sats, and ending within the period of the point that prices its own date
 * (the point its amount was fixed at: 5 minutes after the next hour). Its date is judged against
 * the sale's (datedForSale), its payment with the verify URL (paidPreimage).
 *
 * The address's description follows the business name
 * (src/features/terminal/address-description.ts): an invoice made under a former name carries the
 * hash of the metadata of its time. `former` lists metadata the address served before (the open
 * account's settings, formerAddressMetadata): one naming the same address (`text/identifier`) is
 * as good as the current one. Its server hashes only its own users' metadata, each naming its own
 * address, so a hash of metadata naming the merchant's address is an invoice made for it.
 */
export function checkDeclaredInvoice(
  invoice: Invoice,
  pay: PayRequest,
  network: string,
  former: readonly string[] = []
): boolean {
  const { decoded } = invoice;
  if (decoded.network !== network || decoded.amountMsat === null) return false;
  if (decoded.amountMsat <= 0n || decoded.amountMsat % 1000n !== 0n) return false;
  if (!hashesMetadataOf(decoded.descriptionHash, pay.metadata, former)) return false;
  let verifyHost: string;
  try {
    verifyHost = new URL(invoice.verifyUrl).host;
  } catch {
    return false;
  }
  if (verifyHost !== pay.callback.host) return false;
  return fitsItsPeriod(decoded);
}

/** Whether `hash` is the SHA-256 of `metadata`, or of former metadata naming the same address. */
function hashesMetadataOf(
  hash: string | null,
  metadata: string,
  former: readonly string[]
): boolean {
  if (hash === null) return false;
  const hashOf = (text: string) => bytesToHex(sha256(utf8ToBytes(text)));
  if (hash === hashOf(metadata)) return true;
  const address = readPayeeMetadata(metadata)?.address;
  if (!address) return false;
  return former.some(
    (text) => readPayeeMetadata(text)?.address === address && hash === hashOf(text)
  );
}

/**
 * Whether a declared invoice lies within the sale (Unix seconds, on the issuer's clock as each
 * device estimates it, src/lib/clock.ts, with SALE_START_TOLERANCE_SECONDS between them): dated
 * from its start (an older invoice, paid for another sale, whose declaration relays may have
 * dropped since, never counts for this one; instants, whatever the day), and ending by its end, as
 * every invoice of the sale does (a sale's time never changes, an
 * underpayment's rest included): a later one would keep the sale waiting for its outcome.
 */
export function datedForSale(invoice: Invoice, saleStart: number, saleEnd: number): boolean {
  const { timestamp } = invoice.decoded;
  return (
    timestamp >= saleStart - SALE_START_TOLERANCE_SECONDS &&
    bolt11ExpiresAt(invoice.decoded) <= saleEnd + SALE_START_TOLERANCE_SECONDS
  );
}

/**
 * Whether an invoice ends within the period of the point that prices its own date (pointHourOf):
 * by 5 minutes after the next hour. Judged on the invoice alone (its issuer's date and its
 * expiry), without any clock: the device that asked it checks it so before declaring it (useSale),
 * so that every declared invoice passes on the other side, without tolerance.
 */
export function fitsItsPeriod(decoded: Invoice["decoded"]): boolean {
  return decoded.timestamp + decoded.expirySeconds <= pointEnd(pointHourOf(decoded.timestamp));
}
