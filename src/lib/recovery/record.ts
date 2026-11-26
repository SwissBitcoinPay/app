import { isWalletGeneration, type CardWalletOf } from "@/lib/card/keys";
import type { BreezNetwork } from "@/lib/breez/config";
import type { NostrEvent } from "@/lib/nostr/event";
import { NewerRecordError, RECORD_KIND, openRecord, sealRecord } from "@/lib/nostr/record";
import type { RelayFilter } from "@/lib/nostr/relay";
import { parseDepositAddress } from "@/lib/onchain/address";
import { isSatsNumber } from "@/lib/sats";
import { fundsRecoveryAddressOf, type FundsRecoveryKeys } from "@/lib/team/keys";

/*
 * The recovery of each of the account's wallets' funds that left the balance (recovered
 * automatically, src/features/wallet/funds-recovery.ts), in one sealed record
 * per wallet on the account's relays (src/lib/nostr/record.ts, channel "account"), at an opaque
 * address naming the wallet: the account's, or a card's wallet (CardWalletOf, a card added again
 * pays from its next wallet). Written and read by the owner's devices, the web app included
 * (deriveFundsRecoveryKeys: from the team's root). It holds:
 * - the deposit address of the wallet reserved for the recovery (`destination`), the same on every
 *   device and at every attempt: the SDK keeps a cooperative recovery the operators co-signed for
 *   that address, and a new one to another address would have to outbid it on the network
 *   (spark-sdk 0.28.4). Never one of the point of sale's addresses (onchain-pool.ts): a recovery
 *   would pay a sale. The first one chosen wins (mergeFundsRecoveries);
 * - the transactions that bring funds back to it (`recoveries`: a cooperative recovery, a sweep),
 *   each with the value of the leaves it recovers, written before they are broadcast: the deposit
 *   that arrives is then shown as "Funds recovered" on every device (never a sale nor a
 *   reception), its fees being that value less what was credited.
 * Several devices may write a wallet's record: each copy a relay holds is merged with the others,
 * entry by entry, and the merge is published again (a relay keeps the latest copy, NIP-01).
 *
 * IRREVERSIBLE: the keys' and the addresses' `info` strings (src/lib/team/keys.ts; vectors in
 * funds-recovery-record.test.ts), the type, and the format: a change needs a new `version` and a
 * migration from the older ones; a copy of a newer version is never written over.
 */

const RECORD_TYPE = "funds-recovery";
/** 1: the wallet, its reserved address, the transactions that brought funds back. */
export const FUNDS_RECOVERY_VERSION = 1;
/** Records are padded to multiples of this many bytes (record.ts): their size tells little. */
const BLOCK = 1024;
/**
 * Most recoveries a record keeps, the newest: each attempt at a new fee rate makes new
 * transactions, of which one confirms. Far above what a wallet's recoveries need, far below what a
 * record holds (NIP-44: 64 KiB).
 */
export const MAX_RECORDED_RECOVERIES = 200;

/** The wallet a record is about: the account's own, or a card's wallet. */
export type RecoverySubject = { kind: "account" } | ({ kind: "card" } & CardWalletOf);

/** A transaction that brings funds back to the reserved address, and what it recovers. */
export type RecordedRecovery = {
  /** Lowercase hex. */
  txid: string;
  /** The value of the leaves it recovers, before any fee. */
  valueSats: bigint;
  /** Unix seconds: when it was built. */
  at: number;
};

export type FundsRecoveries = {
  subject: RecoverySubject;
  /** The wallet's id (its identity key, lowercase hex). */
  walletId: string;
  /** The deposit address reserved for the recovery, and when it was chosen (Unix seconds). */
  destination: { address: string; at: number } | null;
  /** The newest first, each transaction once. */
  recoveries: RecordedRecovery[];
};

const WALLET_ID = /^0[23][0-9a-f]{64}$/;
const TXID = /^[0-9a-f]{64}$/;
const CARD_ID = /^[0-9a-f]{32}$/;

function isUnixSeconds(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** The name of `subject` in its record's address: never told by the address. */
function subjectName(subject: RecoverySubject): string {
  return subject.kind === "account"
    ? "account"
    : `card/${subject.cardId}/${subject.walletGeneration}`;
}

export function sameSubject(a: RecoverySubject, b: RecoverySubject): boolean {
  return subjectName(a) === subjectName(b);
}

/** The `d` tag of the record of `subject`'s wallet. */
export function fundsRecoveryAddress(keys: FundsRecoveryKeys, subject: RecoverySubject): string {
  return fundsRecoveryAddressOf(keys, subjectName(subject));
}

function parseSubject(value: unknown): RecoverySubject | null {
  if (!isObject(value)) return null;
  if (value.kind === "account") return { kind: "account" };
  if (value.kind !== "card") return null;
  const { cardId, walletGeneration } = value;
  if (
    typeof cardId !== "string" ||
    !CARD_ID.test(cardId) ||
    !isWalletGeneration(walletGeneration)
  ) {
    return null;
  }
  return { kind: "card", cardId, walletGeneration };
}

/** The newest first, each txid once (its earliest entry), at most MAX_RECORDED_RECOVERIES. */
function normalized(recoveries: readonly RecordedRecovery[]): RecordedRecovery[] {
  const byTxid = new Map<string, RecordedRecovery>();
  for (const entry of recoveries) {
    const held = byTxid.get(entry.txid);
    if (!held || entry.at < held.at || (entry.at === held.at && entry.valueSats < held.valueSats)) {
      byTxid.set(entry.txid, entry);
    }
  }
  return [...byTxid.values()]
    .sort((a, b) => b.at - a.at || (a.txid < b.txid ? -1 : 1))
    .slice(0, MAX_RECORDED_RECOVERIES);
}

/**
 * A record's value, checked whole against the subject it must be about and this build's network.
 * Null when invalid; NewerRecordError when of a newer version.
 */
export function parseFundsRecoveries(
  value: unknown,
  subject: RecoverySubject,
  network: BreezNetwork
): FundsRecoveries | null {
  if (!isObject(value)) return null;
  if (typeof value.version === "number" && value.version > FUNDS_RECOVERY_VERSION) {
    throw new NewerRecordError();
  }
  if (value.version !== FUNDS_RECOVERY_VERSION) return null;
  const read = parseSubject(value.subject);
  if (!read || !sameSubject(read, subject)) return null;
  const { walletId } = value;
  if (typeof walletId !== "string" || !WALLET_ID.test(walletId)) return null;
  let destination: FundsRecoveries["destination"] = null;
  if (value.destination !== null) {
    if (!isObject(value.destination)) return null;
    const { address, at } = value.destination;
    if (typeof address !== "string" || !isUnixSeconds(at)) return null;
    const parsed = parseDepositAddress(address, network);
    if (parsed === null || parsed !== address) return null;
    destination = { address, at };
  }
  if (!Array.isArray(value.recoveries) || value.recoveries.length > MAX_RECORDED_RECOVERIES) {
    return null;
  }
  const recoveries: RecordedRecovery[] = [];
  for (const entry of value.recoveries as unknown[]) {
    if (!isObject(entry)) return null;
    const { txid, valueSats, at } = entry;
    if (typeof txid !== "string" || !TXID.test(txid) || !isSatsNumber(valueSats)) return null;
    if (!isUnixSeconds(at)) return null;
    recoveries.push({ txid, valueSats: BigInt(valueSats), at });
  }
  if (new Set(recoveries.map(({ txid }) => txid)).size !== recoveries.length) return null;
  return { subject: read, walletId, destination, recoveries: normalized(recoveries) };
}

/** The record's value of `recoveries` (amounts as JSON numbers: src/lib/sats.ts). */
export function fundsRecoveriesValue(recoveries: FundsRecoveries): unknown {
  return {
    version: FUNDS_RECOVERY_VERSION,
    subject:
      recoveries.subject.kind === "account"
        ? { kind: "account" }
        : {
            kind: "card",
            cardId: recoveries.subject.cardId,
            walletGeneration: recoveries.subject.walletGeneration
          },
    walletId: recoveries.walletId,
    destination: recoveries.destination,
    recoveries: normalized(recoveries.recoveries).map(({ txid, valueSats, at }) => ({
      txid,
      valueSats: Number(valueSats),
      at
    }))
  };
}

/**
 * Two copies of a wallet's record merged: the reserved address chosen first (on a tie, the lowest:
 * every device keeps the same), and every recovery of either. Throws when they name two wallets: a
 * copy of another wallet's record at this address is no copy of it.
 */
export function mergeFundsRecoveries(a: FundsRecoveries, b: FundsRecoveries): FundsRecoveries {
  if (!sameSubject(a.subject, b.subject) || a.walletId !== b.walletId) {
    throw new Error("Two wallets' recoveries");
  }
  let destination = a.destination ?? b.destination;
  if (a.destination && b.destination) {
    const [first, second] = [a.destination, b.destination];
    destination =
      first.at < second.at || (first.at === second.at && first.address <= second.address)
        ? first
        : second;
  }
  return {
    subject: a.subject,
    walletId: a.walletId,
    destination,
    recoveries: normalized([...a.recoveries, ...b.recoveries])
  };
}

/** Whether `merged` holds something `held` lacks: a copy to publish again. */
export function addsTo(merged: FundsRecoveries, held: FundsRecoveries | null): boolean {
  if (!held) return true;
  if (merged.destination?.address !== held.destination?.address) return true;
  const known = new Set(held.recoveries.map(({ txid }) => txid));
  return merged.recoveries.some(({ txid }) => !known.has(txid));
}

/** The signed record of `recoveries`, dated `createdAt`. */
export function fundsRecoveriesEvent(
  keys: FundsRecoveryKeys,
  recoveries: FundsRecoveries,
  createdAt: number
): NostrEvent {
  return sealRecord({
    type: RECORD_TYPE,
    value: fundsRecoveriesValue(recoveries),
    signer: keys.nostr.secretKey,
    encryptionKey: keys.encryptionKey,
    address: fundsRecoveryAddress(keys, recoveries.subject),
    createdAt,
    block: BLOCK
  });
}

/** What the relays hold of `subject`'s wallet's record: its author's events at its address. */
export function fundsRecoveryFilter(
  keys: FundsRecoveryKeys,
  subject: RecoverySubject
): RelayFilter {
  return {
    kinds: [RECORD_KIND],
    authors: [keys.nostr.publicKey],
    "#d": [fundsRecoveryAddress(keys, subject)]
  };
}

/** Every record of the author (a change of the account's relays copies them all). */
export function fundsRecoveriesAuthorFilter(keys: FundsRecoveryKeys): RelayFilter {
  return { kinds: [RECORD_KIND], authors: [keys.nostr.publicKey] };
}

export type FundsRecoveryRead = {
  /** Every readable copy merged; null when none. */
  recoveries: FundsRecoveries | null;
  /** A relay holds a copy of a newer version: never written over (a newer app wrote it). */
  newer: boolean;
  /** `created_at` of the newest copy, readable or not: a new copy is dated after it. */
  newestAt: number | null;
};

/**
 * `subject`'s wallet's record among the events relays sent: each copy checked (openRecord: its
 * author, address, signature, and its value: parseFundsRecoveries), the readable ones merged.
 * `walletId`: the wallet's id when known (a copy naming another is ignored).
 */
export function fundsRecoveriesOf(
  keys: FundsRecoveryKeys,
  subject: RecoverySubject,
  network: BreezNetwork,
  answers: Map<string, unknown[]>,
  walletId: string | null
): FundsRecoveryRead {
  const address = fundsRecoveryAddress(keys, subject);
  let merged: FundsRecoveries | null = null;
  let newer = false;
  let newestAt: number | null = null;
  const checked = new Map<string, ReturnType<typeof open>>();
  function open(value: unknown) {
    return openRecord(value, {
      type: RECORD_TYPE,
      encryptionKey: keys.encryptionKey,
      address,
      author: keys.nostr.publicKey,
      parse: (payload) => parseFundsRecoveries(payload, subject, network)
    });
  }
  for (const events of answers.values()) {
    for (const value of events) {
      const key = JSON.stringify(value) ?? "";
      let copy = checked.get(key);
      if (copy === undefined) {
        copy = open(value);
        checked.set(key, copy);
      }
      if (!copy) continue;
      newestAt = Math.max(newestAt ?? -1, copy.event.created_at);
      if (copy.status === "newer") {
        newer = true;
        continue;
      }
      if (walletId !== null && copy.value.walletId !== walletId.toLowerCase()) continue;
      // The first copy names the wallet: one naming another is no copy of its record.
      if (merged && merged.walletId !== copy.value.walletId) continue;
      merged = merged ? mergeFundsRecoveries(merged, copy.value) : copy.value;
    }
  }
  return { recoveries: merged, newer, newestAt };
}

/** A record's newest copy, and the relays that hold it (or a newer one). */
export type HeldFundsRecoveries = { event: NostrEvent; holders: string[] };

/**
 * The newest copy of each of the author's records among the events relays sent, by address, of a
 * newer format too (as it is), each checked (openRecord: its author, key, type and signature), with
 * the relays that hold it: what a change of the account's relays copies (copyFundsRecoveries).
 */
export function heldFundsRecoveries(
  keys: FundsRecoveryKeys,
  answers: Map<string, unknown[]>
): Map<string, HeldFundsRecoveries> {
  const newest = new Map<string, NostrEvent>();
  const held = new Map<string, Map<string, number>>();
  for (const [relay, events] of answers) {
    const holding = new Map<string, number>();
    for (const value of events) {
      const copy = openRecord(value, {
        type: RECORD_TYPE,
        encryptionKey: keys.encryptionKey,
        address: () => true,
        author: keys.nostr.publicKey,
        // Copied as it is: its value is the reader's to check.
        parse: () => true
      });
      const address = copy?.event.tags.find(([name]) => name === "d")?.[1];
      if (!copy || address === undefined) continue;
      holding.set(address, Math.max(holding.get(address) ?? -1, copy.event.created_at));
      const known = newest.get(address);
      if (!known || copy.event.created_at > known.created_at) newest.set(address, copy.event);
    }
    held.set(relay, holding);
  }
  return new Map(
    [...newest].map(([address, event]) => [
      address,
      {
        event,
        holders: [...held]
          .filter(([, holding]) => (holding.get(address) ?? -1) >= event.created_at)
          .map(([relay]) => relay)
      }
    ])
  );
}
