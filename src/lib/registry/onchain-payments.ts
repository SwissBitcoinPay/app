import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

import { REGISTRY_TIMEOUT_MS, majority } from "@/config/registry";
import type { NostrEvent } from "@/lib/nostr/event";
import type { NostrKeys } from "@/lib/nostr/keys";
import { publishToQuorum, queryRelays } from "@/lib/nostr/pool";
import { NewerRecordError, RECORD_KIND, openRecord, sealRecord } from "@/lib/nostr/record";
import { parseTaprootAddress } from "@/lib/onchain/address";
import { nowUnix } from "@/lib/rates/snapshot";
import { currentRelays } from "@/lib/relays/current";

import {
  deriveSaleKeys,
  dTagOf,
  eachDeclaration,
  isTakerTag,
  openInside,
  outerKey,
  ownerInnerKeys,
  parseSale,
  sealInside,
  type DeclarationKind,
  type DeclaredSale,
  type InnerKeys,
  type Registry
} from "./registry";

/*
 * The registry's declarations of the point of sale's on-chain payments. A deposit of the owner's
 * wallet names its
 * transaction, never its address nor its sale: the point of sale declares each transaction it sees
 * paying its sale's address, so that "Wallet" tells the deposit's sale for good, as it
 * tells a Lightning payment's (registry.ts); its device's records (`team-sale-tx`), read for a
 * month, tie it meanwhile, and the owner's copy keeps it past a year (archive.ts, format 2's
 * `onchain`, src/features/activity/archive.ts).
 *
 * As a Lightning payment's declaration: at an address only the transaction gives,
 * d(T) = HMAC(registry key, "onchain-payment/v1/" + txid); signed by the sale's key; sealed outside
 * with outerKey (only a holder of the registry key makes one that counts), inside for the sale and
 * the business (declarationKey). It is published once the transaction is seen (an on-chain address
 * is shown before anything pays it), and never ends. A transaction two sales declared counts for
 * none; "Wallet" counts only a declaration its mark vouches for (onchain-sales.ts: a
 * payer's page holds the registry key, never a mark of the business's).
 *
 * Only the business's devices declare (the point of sale and the follower of its sales,
 * src/features/team/sale-sightings.ts): a payment link's on-chain payments are told by its final
 * version, an integration's by its server's witnesses.
 *
 * Never change the record's type, its address (`onchain-payment/v1/…`) nor its keys once released:
 * the declarations of every business are there (registry.test.ts locks them with a vector).
 */

const RECORD_TYPE = "registry-onchain-payment";

/**
 * Format of a declaration, inside. A change of what it holds needs a new one. A later format keeps
 * the outside as it is (NIP-44 v2 under outerKey) and raises this version: anybody may publish at
 * d(T), so the owner's reads take a content of a newer NIP-44 version there for no declaration
 * (ownerOnchainPaymentsOf), never for a newer format.
 */
const VERSION = 1;

/** d(T): where the declarations of transaction `txid` (hex) are. */
export function onchainPaymentAddress(registryKey: Uint8Array, txid: string): string {
  return bytesToHex(hmac(sha256, registryKey, utf8ToBytes(`onchain-payment/v1/${txid}`)));
}

/** What a declaration says inside. */
type Inside = {
  version: typeof VERSION;
  /** Hex, lowercase: the transaction, as the wallet's deposits name it. */
  txid: string;
  /** The sale's on-chain address, which the transaction paid. */
  address: string;
  sale: { key: string } & DeclaredSale;
  /** Who took the sale (takerTag), when its device could say it. */
  taker?: string;
};

/** A declaration of an on-chain payment, opened by the owner. */
export type OnchainPaymentDeclaration = {
  txid: string;
  address: string;
  /** The sale's own key, and its Nostr identity: the declaration's author. */
  saleKey: Uint8Array;
  author: string;
  taker: string | null;
} & DeclaredSale;

const HEX_32 = /^[0-9a-f]{64}$/;

/** The outside of a declaration: what it says, sealed for the sale and the business. */
function parseOuter(value: unknown): { sealed: string } | null {
  if (value === null || typeof value !== "object") return null;
  const { sealed } = value as Record<string, unknown>;
  return typeof sealed === "string" ? { sealed } : null;
}

/**
 * A declaration that opens inside with `innerKey`, of transaction `txid` at its own d(T), with an
 * address of `network`; null otherwise. Throws NewerRecordError for a newer format.
 */
function parseInside(registryKey: Uint8Array, network: string, inner: InnerKeys, txid: string) {
  return (
    outside: unknown,
    event: NostrEvent
  ): Omit<OnchainPaymentDeclaration, "author"> | null => {
    const outer = parseOuter(outside);
    if (!outer) return null;
    const value = openInside(outer.sealed, inner);
    if (value === null || typeof value !== "object") return null;
    const v = value as Record<string, unknown>;
    if (typeof v.version === "number" && v.version > VERSION) throw new NewerRecordError();
    if (v.version !== VERSION || v.txid !== txid || typeof v.address !== "string") return null;
    if (parseTaprootAddress(v.address, network) !== v.address) return null;
    const sale = parseSale(v.sale);
    if (!sale) return null;
    if (dTagOf(event) !== onchainPaymentAddress(registryKey, txid)) return null;
    return {
      txid,
      address: v.address,
      saleKey: sale.key,
      fiat: sale.fiat,
      note: sale.note,
      taker: isTakerTag(v.taker) ? v.taker : null
    };
  };
}

/** The signed declaration that transaction `txid` paid the address of the sale of `registry`. */
export function onchainPaymentEvent(
  registry: Registry,
  { txid, address }: { txid: string; address: string },
  sale: DeclaredSale,
  now: number = nowUnix()
): NostrEvent {
  if (!HEX_32.test(txid)) throw new Error(`Not a transaction id: ${txid}`);
  const inside: Inside = {
    version: VERSION,
    txid,
    address,
    sale: { key: bytesToHex(registry.saleKey), fiat: sale.fiat, note: sale.note },
    ...(registry.taker ? { taker: registry.taker } : {})
  };
  const at = onchainPaymentAddress(registry.key, txid);
  return sealRecord({
    type: RECORD_TYPE,
    value: { sealed: sealInside(registry, inside) },
    signer: registry.saleKeys.nostr.secretKey,
    encryptionKey: outerKey(registry.key, at, registry.saleKeys.nostr.publicKey),
    address: at,
    // No end: a payment declared once stays its sale's.
    createdAt: now
  });
}

/**
 * Declares that `txid` paid the sale's address: resolves once a majority of the relays took the
 * declaration (a reader of a majority meets it), rejects otherwise (declared again later).
 */
export function declareOnchainPayment(
  registry: Registry,
  payment: { txid: string; address: string },
  sale: DeclaredSale,
  {
    relays = registry.relays ?? currentRelays(),
    timeoutMs = REGISTRY_TIMEOUT_MS
  }: { relays?: readonly string[]; timeoutMs?: number } = {}
): Promise<void> {
  const event = onchainPaymentEvent(registry, payment, sale);
  return publishToQuorum(
    event,
    { channel: "anonymous", relays, timeoutMs, authKey: registry.saleKeys.nostr.secretKey },
    majority(relays.length)
  );
}

/** At most this many transactions per read: relays bound the size of a filter. */
const TXIDS_PER_READ = 50;

/** What the owner reads of the declarations of several transactions (ownerOnchainPaymentsOf). */
export type OnchainPayments = {
  /** By txid: each sale's declaration that opens, the first copy of each author. */
  declared: Map<string, OnchainPaymentDeclaration[]>;
  /**
   * Transactions with a declaration of a newer format of a sale not opened (maybe a conflict):
   * told by a newer app.
   */
  newer: Set<string>;
};

/**
 * The declarations of `txids` (the wallet's deposits), read by the owner with the business's
 * reading key: one per sale that declared it, each opened for that very transaction and signed by
 * the sale it names (whoever holds another sale's key cannot speak for it). Anything else at d(T)
 * is no declaration of this business. Null when a read got fewer than a majority of the relays.
 * Never rejects.
 */
export async function ownerOnchainPaymentsOf(
  owner: { key: Uint8Array; reader: NostrKeys },
  txids: readonly string[],
  network: string,
  {
    relays = currentRelays(),
    timeoutMs = REGISTRY_TIMEOUT_MS
  }: { relays?: readonly string[]; timeoutMs?: number } = {}
): Promise<OnchainPayments | null> {
  const result: OnchainPayments = { declared: new Map(), newer: new Set() };
  // The authors of a declaration of a newer format, by txid.
  const newer = new Map<string, Set<string>>();
  const all = [...new Set(txids)];
  for (let start = 0; start < all.length; start += TXIDS_PER_READ) {
    const byAddress = new Map(
      all
        .slice(start, start + TXIDS_PER_READ)
        .map((txid) => [onchainPaymentAddress(owner.key, txid), txid] as const)
    );
    const answers = await queryRelays(
      { kinds: [RECORD_KIND], "#d": [...byAddress.keys()] },
      // The anonymous connection's own key (relay.ts): never the reading key, which would name the
      // business behind the owner's reads (as ownerDeclarationsOf).
      { channel: "anonymous", relays, timeoutMs },
      { quorum: "majority" }
    ).catch(() => null);
    if (answers === null || answers.size < majority(relays.length)) return null;
    const bySale = new Map<string, Map<string, OnchainPaymentDeclaration>>();
    eachDeclaration(answers, byAddress, (value, { address, hash: txid, author }) => {
      const found = openRecord(value, {
        type: RECORD_TYPE,
        encryptionKey: outerKey(owner.key, address, author),
        address,
        author,
        parse: parseInside(owner.key, network, ownerInnerKeys(owner.reader, author), txid),
        // Anybody who saw d(T) may publish there under a key of their own: a content of a newer
        // NIP-44 version is no declaration (it would have the deposit read again for good). A newer
        // format is one that opens outside with the registry key, its version inside above VERSION
        // (parseInside), which only a holder of the key seals.
        newerContentIgnored: true
      });
      if (
        found?.status === "ok" &&
        deriveSaleKeys(found.value.saleKey).nostr.publicKey === author
      ) {
        const sales = bySale.get(txid) ?? new Map<string, OnchainPaymentDeclaration>();
        sales.set(author, { ...found.value, author });
        bySale.set(txid, sales);
        return true;
      }
      // Not taken as opened: an older copy of the same author, on another relay, may open.
      if (found?.status === "newer") newer.set(txid, (newer.get(txid) ?? new Set()).add(author));
      return false;
    });
    for (const txid of byAddress.values()) {
      result.declared.set(txid, [...(bySale.get(txid)?.values() ?? [])]);
    }
  }
  // A newer app's declaration of another sale than those opened: maybe a conflict.
  for (const [txid, authors] of newer) {
    const opened = new Set((result.declared.get(txid) ?? []).map(({ author }) => author));
    if ([...authors].some((author) => !opened.has(author))) result.newer.add(txid);
  }
  return result;
}

/**
 * The kind of these declarations, as registry.ts copies them at a change of relays
 * (copyDeclarations): d(T) of a transaction, and the sale's key of one opened inside.
 */
export const ONCHAIN_PAYMENT_DECLARATIONS: DeclarationKind = {
  type: RECORD_TYPE,
  addressOf: onchainPaymentAddress,
  saleKeyOf: (registryKey, network, inner, txid, outside, event) =>
    parseInside(registryKey, network, inner, txid)(outside, event)?.saleKey ?? null
};
