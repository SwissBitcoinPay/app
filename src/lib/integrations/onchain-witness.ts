import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

import { majority } from "@/config/registry";
import type { NostrEvent } from "@/lib/nostr/event";
import { queryRelaysPaged, type RelayCall } from "@/lib/nostr/pool";
import { NewerRecordError, RECORD_KIND, openRecord, sealRecord } from "@/lib/nostr/record";
import { parseTaprootAddress } from "@/lib/onchain/address";
import type { ChainTx } from "@/lib/onchain/esplora";
import {
  MAX_RECORDED_INPUTS,
  isOutpoint,
  paymentParts,
  type PaymentPart
} from "@/lib/onchain/replacement";
import { isSatsNumber } from "@/lib/sats";

import type { IntegrationKeys } from "./keys";

/*
 * An integration's witnesses (checkout-spec SPEC.md §31): its server
 * records each transaction it sees paying an address of its lot. Seen while an order's lease ran,
 * for that order's sale: the transaction came in time, it is that order's for every reader, the
 * owner's "Wallet" included (src/features/activity/onchain-sales.ts). Seen later, or found
 * when leasing, for none: no order's. The explorers say nothing of when a transaction was broadcast
 * (mempool.space's first-seen times are 0 once it is confirmed): a check that
 * saw it is the only proof that it came in time.
 *
 * One record per address, transaction and sale (or none), signed by the integration's seen key and
 * sealed with its channel's: a witness of a sale and one of none never replace each other. Only the
 * integration's servers write them; the owner reads them, and takes the addresses they name out of
 * the integration's lot (src/features/team/integration-addresses.ts).
 *
 * A transaction replaced by another (RBF, src/lib/onchain/replacement.ts) keeps its order: a
 * witness holds what its transaction pays and the coins it spends, so that a replacement seen later
 * is told by the coins it spends too; the server then witnesses the replacement for the sale
 * (`replacement`), for what it takes of the payments in time it replaces. An `o` tag (orderTag)
 * gathers the witnesses of one order, which its server reads by it; a second `o` tag (addressTag)
 * every witness of an address, whatever its sale, and `expiresAt` tells which invoice of the order
 * it is of (an address may be leased again for a later invoice of the order once nothing paid it).
 * A witness without both does not open (checkout-spec 0.1.0).
 *
 * Never change the record's type, the derivations of its key and `d` tags (deriveIntegrationKeys)
 * once released: every server writes them (checkout-spec's vectors/onchain-witnesses.json locks
 * them).
 */

const RECORD_TYPE = "integration-onchain-seen";

/** Format of a witness's value. */
export const WITNESS_VERSION = 1;

/** What a witness says. */
export type Witness = {
  /** The deposit address the transaction pays. */
  address: string;
  /** Lowercase hex. */
  txid: string;
  /** Hex: the sale author of the order whose lease held the address then; null: none. */
  sale: string | null;
  /** What the transaction pays the address. */
  sats: bigint;
  /** The coins it spends (`<txid>:<vout>`), its first MAX_RECORDED_INPUTS. */
  inputs: string[];
  /**
   * Held for the sale only as a replacement (RBF): it came after the lease's end, and counts for
   * what it takes of the payments in time it replaces. Always false for none.
   */
  replacement: boolean;
  /**
   * The `expiresAt` of the invoice whose lease the transaction came in (or stands for), null for
   * none.
   */
  expiresAt: number | null;
};

const HEX_32 = /^[0-9a-f]{64}$/;

/** The `d` tag of the witness of `txid` paying `address`, for `sale` (null: none). */
export function witnessAddress(
  keys: IntegrationKeys,
  address: string,
  txid: string,
  sale: string | null
): string {
  return bytesToHex(
    hmac(sha256, keys.seen.addressKey, utf8ToBytes(`${address}/${txid}/${sale ?? "none"}`))
  );
}

/** The `o` tag of the witnesses of the order of `sale` (null: none) at `address`. */
export function orderTag(keys: IntegrationKeys, address: string, sale: string | null): string {
  return bytesToHex(
    hmac(sha256, keys.seen.addressKey, utf8ToBytes(`order/${address}/${sale ?? "none"}`))
  );
}

/**
 * The address tag of `address`: a witness's second `o` tag, which finds every witness of the
 * address, whatever its sale.
 */
export function addressTag(keys: IntegrationKeys, address: string): string {
  return bytesToHex(hmac(sha256, keys.seen.addressKey, utf8ToBytes(`address/${address}`)));
}

/**
 * A witness's value, checked against its event's `d` and `o` tags: null when anything is off. More
 * fields, and more tags, are ignored (a later version's).
 */
function parseWitness(
  value: unknown,
  event: NostrEvent,
  keys: IntegrationKeys,
  network: string
): Witness | null {
  if (value === null || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.version === "number" && v.version > WITNESS_VERSION) throw new NewerRecordError();
  if (v.version !== WITNESS_VERSION || typeof v.address !== "string") return null;
  if (parseTaprootAddress(v.address, network) !== v.address) return null;
  if (typeof v.txid !== "string" || !HEX_32.test(v.txid)) return null;
  if (v.sale !== null && (typeof v.sale !== "string" || !HEX_32.test(v.sale))) return null;
  if (!isSatsNumber(v.sats)) return null;
  if (!Array.isArray(v.inputs) || v.inputs.length > MAX_RECORDED_INPUTS) return null;
  if (!v.inputs.every(isOutpoint) || new Set(v.inputs).size !== v.inputs.length) return null;
  if (typeof v.replacement !== "boolean" || (v.sale === null && v.replacement)) return null;
  // Null for none, a safe integer for a sale.
  if (v.sale === null ? v.expiresAt !== null : !Number.isSafeInteger(v.expiresAt)) return null;
  const witness: Witness = {
    address: v.address,
    txid: v.txid,
    sale: v.sale,
    sats: BigInt(v.sats as number),
    inputs: v.inputs,
    replacement: v.replacement,
    expiresAt: v.expiresAt as number | null
  };
  const d = event.tags.find(([name]) => name === "d")?.[1];
  if (d !== witnessAddress(keys, witness.address, witness.txid, witness.sale)) return null;
  const order = orderTag(keys, witness.address, witness.sale);
  const address = addressTag(keys, witness.address);
  const tagged = (tag: string) => event.tags.some(([name, value]) => name === "o" && value === tag);
  return tagged(order) && tagged(address) ? witness : null;
}

/**
 * The witness `witness`, seen at `seenAt`, signed by the integration (a server's, the tests), as
 * checkout-spec writes it: its order tag, then its address tag.
 */
export function witnessEvent(keys: IntegrationKeys, witness: Witness, seenAt: number): NostrEvent {
  return sealRecord({
    type: RECORD_TYPE,
    value: {
      version: WITNESS_VERSION,
      address: witness.address,
      txid: witness.txid,
      sale: witness.sale,
      // A JSON number: exact up to 21 000 000 BTC (MAX_SATS, src/lib/sats.ts).
      sats: Number(witness.sats),
      inputs: witness.inputs.slice(0, MAX_RECORDED_INPUTS),
      replacement: witness.replacement,
      expiresAt: witness.expiresAt
    },
    signer: keys.seen.nostr.secretKey,
    encryptionKey: keys.channel.encryptionKey,
    address: witnessAddress(keys, witness.address, witness.txid, witness.sale),
    tags: [
      ["o", orderTag(keys, witness.address, witness.sale)],
      ["o", addressTag(keys, witness.address)]
    ],
    createdAt: seenAt
  });
}

/** `value`, if it is a witness of the integration of `keys` on `network` ("bc"). */
export function openWitness(value: unknown, keys: IntegrationKeys, network: string) {
  return openRecord(value, {
    type: RECORD_TYPE,
    encryptionKey: keys.channel.encryptionKey,
    address: () => true,
    author: keys.seen.nostr.publicKey,
    parse: (payload, event) => parseWitness(payload, event, keys, network)
  });
}

/**
 * A witness as the owner reads it: whose integration, when it was seen, and its event as it is
 * (copied to the account's new relays at a change of relays).
 */
export type SeenWitness = Witness & { integration: string; seenAt: number; event: NostrEvent };

/**
 * The parts of the transactions `listed` at a sale's address (paymentParts), as its server counts
 * them (checkout-spec SPEC.md §31): the witnesses of the sale there (`ofSale`) at their own times,
 * listed or not any more, then the listed transactions no witness names, after every known time.
 */
export function witnessedParts(
  ofSale: readonly SeenWitness[],
  listed: readonly ChainTx[]
): Map<string, PaymentPart[]> {
  const witnessed = new Set(ofSale.map(({ txid }) => txid));
  const onChain = new Set(listed.map(({ txid }) => txid));
  return paymentParts([
    ...ofSale.map((witness) => ({
      txid: witness.txid,
      sats: witness.sats,
      inputs: witness.inputs,
      at: witness.seenAt,
      listed: onChain.has(witness.txid)
    })),
    ...listed
      .filter(({ txid }) => !witnessed.has(txid))
      .map((tx) => ({
        txid: tx.txid,
        sats: tx.received,
        inputs: tx.inputs,
        at: null,
        listed: true
      }))
  ]);
}

/** What a read of the witnesses gave. */
export type WitnessesRead = {
  witnesses: SeenWitness[];
  /** Integrations with a witness of a newer format: what it says cannot be read. */
  newer: Set<string>;
};

/**
 * The witnesses of `integrations` made since `since` (Unix seconds), read page by page by their
 * authors on the relays of `call` (authenticated as each of them). Null when fewer than a majority
 * answered: a witness may be on the others.
 */
export async function fetchWitnesses(
  integrations: readonly { id: string; keys: IntegrationKeys }[],
  network: string,
  since: number,
  call: Omit<RelayCall, "authKey">
): Promise<WitnessesRead | null> {
  if (integrations.length === 0) return { witnesses: [], newer: new Set() };
  const answers = await queryRelaysPaged(
    {
      kinds: [RECORD_KIND],
      authors: integrations.map(({ keys }) => keys.seen.nostr.publicKey),
      since
    },
    { ...call, authKey: integrations.map(({ keys }) => keys.seen.nostr.secretKey) },
    { quorum: "majority" }
  );
  if (answers.size < majority(call.relays.length)) return null;
  const byAuthor = new Map(integrations.map((entry) => [entry.keys.seen.nostr.publicKey, entry]));
  const seen = new Map<string, SeenWitness>();
  const newer = new Set<string>();
  for (const events of answers.values()) {
    for (const value of events) {
      const author = (value as Partial<NostrEvent> | null)?.pubkey;
      const of = typeof author === "string" ? byAuthor.get(author) : undefined;
      if (!of) continue;
      const opened = openWitness(value, of.keys, network);
      if (!opened) continue;
      if (opened.status === "newer") {
        newer.add(of.id);
        continue;
      }
      const { event, value: witness } = opened;
      const key = `${of.id}:${witnessAddress(of.keys, witness.address, witness.txid, witness.sale)}`;
      const known = seen.get(key);
      // The same witness on several relays, or published again: the first time it was seen.
      if (!known || event.created_at < known.seenAt) {
        seen.set(key, { ...witness, integration: of.id, seenAt: event.created_at, event });
      }
    }
  }
  return { witnesses: [...seen.values()], newer };
}
