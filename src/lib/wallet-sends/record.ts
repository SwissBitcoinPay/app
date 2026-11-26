import { hmac } from "@noble/hashes/hmac.js";
import { epochSealFor } from "@/lib/nostr/epochs";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

import type { WalletPayment } from "@/lib/breez/types";
import type { NostrEvent } from "@/lib/nostr/event";
import { queryRelaysPaged, type RelayCall } from "@/lib/nostr/pool";
import { NewerRecordError, RECORD_KIND, openRecord, sealRecord } from "@/lib/nostr/record";
import type { RelayFilter } from "@/lib/nostr/relay";
import type { WalletSendKeys } from "@/lib/team/keys";

/*
 * A payment the account's wallet sent, as the owner's app publishes it (each sending and
 * withdrawal, as soon as the app makes it), for the assistants allowed to export the transactions
 * (the line "Sent" of "Export"). What only the
 * wallet knows of it, the sats, the fees, the network, the reference, the text that labels it: the
 * relays hold the sales already, never the wallet's own transfers. Its value in a currency comes
 * from the rate recorded at the payment (src/lib/rates/payment-rates.ts), read beside it.
 *
 * One sealed record per payment done, written once, never again: at an opaque address of its id,
 * dated by the payment (a period is read by the records' dates, page by page). A relay sees when a
 * payment was sent, never what nor where.
 *
 * IRREVERSIBLE: the keys (deriveWalletSendKeys), the address and the format (WALLET_SEND_VERSION;
 * vectors in wallet-sends.test.ts): a change needs a new version, which older readers read as newer.
 */

const RECORD_TYPE = "wallet-send";

/** 1: the first format. */
export const WALLET_SEND_VERSION = 1;

/** Records are padded to multiples of this many bytes (record.ts): they all look alike. */
const BLOCK = 256;

const MAX_ID_LENGTH = 200;
const MAX_TEXT_LENGTH = 1000;
const SATS = /^(0|[1-9][0-9]{0,15})$/;

export type WalletSendNetwork = WalletPayment["network"];
const NETWORKS: readonly WalletSendNetwork[] = ["lightning", "bitcoin", "spark", "unknown"];

/** A payment sent, done. */
export type WalletSend = {
  /** The wallet's id of the payment (WalletPayment.id). */
  payment: string;
  /** When it was made (Unix seconds, WalletPayment.timestamp). */
  at: number;
  /** What it moved, fees excluded. */
  sats: bigint;
  /** What the wallet paid on top. */
  feeSats: bigint;
  network: WalletSendNetwork;
  /** "Reference" (referenceOf): the payment hash, else the transaction id, else the wallet's id. */
  reference: string;
  /**
   * What labels it (titleOf): the Lightning address paid, else the invoice's description; null
   * without (an on-chain or unknown one is "Withdrawal", any other has no label).
   */
  text: string | null;
};

/** The record of `payment` (sent and done); null for any other. */
export function walletSendOf(payment: WalletPayment): WalletSend | null {
  if (payment.direction !== "send" || payment.status !== "completed") return null;
  // A withdrawal's reference is its transaction, and a record is written once: none before the
  // SDK gives it. Breez 0.28 storage drops the details of the withdrawals stored before it, until
  // its next sync fills them in again (spark-sdk 0.28.4, its storage migrations).
  if (payment.network === "bitcoin" && !payment.txId) return null;
  const lightning = payment.network === "lightning" || payment.network === "spark";
  const text = lightning ? (payment.lightningAddress ?? payment.description?.trim()) : undefined;
  return {
    payment: payment.id,
    at: payment.timestamp,
    sats: payment.amountSats,
    feeSats: payment.feeSats,
    network: payment.network,
    reference: payment.paymentHash ?? payment.txId ?? payment.id,
    text: text ? text.slice(0, MAX_TEXT_LENGTH) : null
  };
}

/** The opaque `d` tag of payment `id`'s record. */
export function walletSendAddress(keys: WalletSendKeys, id: string): string {
  return bytesToHex(hmac(sha256, keys.addressKey, utf8ToBytes(`wallet-send/${id}`)));
}

const isText = (value: unknown, max: number): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= max;

/** A record's value checked whole; null otherwise. Throws NewerRecordError for a newer version. */
export function parseWalletSend(value: unknown): WalletSend | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.version === "number" && v.version > WALLET_SEND_VERSION) {
    throw new NewerRecordError();
  }
  if (
    v.version !== WALLET_SEND_VERSION ||
    !isText(v.payment, MAX_ID_LENGTH) ||
    typeof v.at !== "number" ||
    !Number.isSafeInteger(v.at) ||
    v.at < 0 ||
    typeof v.sats !== "string" ||
    !SATS.test(v.sats) ||
    typeof v.feeSats !== "string" ||
    !SATS.test(v.feeSats) ||
    !NETWORKS.includes(v.network as WalletSendNetwork) ||
    !isText(v.reference, MAX_ID_LENGTH) ||
    !(v.text === null || isText(v.text, MAX_TEXT_LENGTH))
  ) {
    return null;
  }
  return {
    payment: v.payment,
    at: v.at,
    sats: BigInt(v.sats),
    feeSats: BigInt(v.feeSats),
    network: v.network as WalletSendNetwork,
    reference: v.reference,
    text: v.text as string | null
  };
}

/** The signed record of a payment sent, dated by the payment. */
export function walletSendEvent(keys: WalletSendKeys, send: WalletSend): NostrEvent {
  return sealRecord({
    type: RECORD_TYPE,
    value: {
      version: WALLET_SEND_VERSION,
      payment: send.payment,
      at: send.at,
      sats: send.sats.toString(),
      feeSats: send.feeSats.toString(),
      network: send.network,
      reference: send.reference,
      text: send.text
    },
    signer: keys.nostr.secretKey,
    encryptionKey: keys.encryptionKey,
    address: walletSendAddress(keys, send.payment),
    createdAt: send.at,
    block: BLOCK,
    epoch: epochSealFor(keys.encryptionKey)
  });
}

/** The records of the payments sent from `since` to `until` (Unix seconds, both included). */
export function walletSendsFilter(
  keys: WalletSendKeys,
  since: number,
  until?: number
): RelayFilter {
  const filter: RelayFilter = {
    kinds: [RECORD_KIND],
    authors: [keys.nostr.publicKey],
    since: Math.max(0, since)
  };
  return until === undefined ? filter : { ...filter, until };
}

function addressOf(event: NostrEvent): string | undefined {
  return event.tags.find(([name]) => name === "d")?.[1];
}

/** The payments sent among events relays sent (walletSendsOf). */
export type WalletSends = {
  /** By payment id. */
  sends: Map<string, WalletSend>;
  /** The record of each, by payment id (the copy relays keep). */
  events: Map<string, NostrEvent>;
  /** The addresses of records of a newer format: neither told nor written over. */
  newer: Set<string>;
};

/**
 * The sendings among `events` (openRecord: author, decryption, type, signature), each checked
 * against its address and its date (the payment's); of two copies of one (two devices wrote it at
 * once), the one of the lower id, which relays keep (NIP-01).
 */
export function walletSendsOf(keys: WalletSendKeys, events: readonly unknown[]): WalletSends {
  const sends = new Map<string, WalletSend>();
  const records = new Map<string, NostrEvent>();
  const newer = new Set<string>();
  const checked = new Set<string>();
  for (const value of events) {
    const id = (value as { id?: unknown } | null)?.id;
    if (typeof id === "string" && checked.has(id)) continue;
    const opened = openRecord(value, {
      type: RECORD_TYPE,
      encryptionKey: keys.encryptionKey,
      address: () => true,
      author: keys.nostr.publicKey,
      parse: (payload, event) => {
        const send = parseWalletSend(payload);
        return send &&
          event.created_at === send.at &&
          addressOf(event) === walletSendAddress(keys, send.payment)
          ? send
          : null;
      }
    });
    if (!opened) continue;
    checked.add(opened.event.id);
    if (opened.status === "newer") {
      const address = addressOf(opened.event);
      if (address !== undefined) newer.add(address);
      continue;
    }
    const known = records.get(opened.value.payment);
    if (!known || opened.event.id < known.id) {
      sends.set(opened.value.payment, opened.value);
      records.set(opened.value.payment, opened.event);
    }
  }
  for (const [payment] of sends) {
    if (newer.has(walletSendAddress(keys, payment))) {
      sends.delete(payment);
      records.delete(payment);
    }
  }
  return { sends, events: records, newer };
}

export type WalletSendsRead = WalletSends & {
  /** How many relays answered, each with every page of its events. */
  answered: number;
  /** How many of them hold each sending's record, by payment id. */
  copies: Map<string, number>;
};

/**
 * The sendings of `since` to `until` that the relays of `call` hold, read whole, page by page.
 * Never rejects: `answered` says how many relays did.
 */
export async function fetchWalletSends(
  keys: WalletSendKeys,
  call: RelayCall,
  since: number,
  until?: number
): Promise<WalletSendsRead> {
  const answers = await queryRelaysPaged(walletSendsFilter(keys, since, until), call, {
    whole: true,
    quorum: "majority"
  });
  const read = walletSendsOf(keys, [...answers.values()].flat());
  const copies = new Map<string, number>();
  for (const events of answers.values()) {
    const ids = new Set(events.map((event) => (event as { id?: unknown } | null)?.id));
    for (const [payment, event] of read.events) {
      if (ids.has(event.id)) copies.set(payment, (copies.get(payment) ?? 0) + 1);
    }
  }
  return { ...read, answered: answers.size, copies };
}
