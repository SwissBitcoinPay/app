import { majority } from "@/config/registry";
import {
  movementOf,
  type CardMovement,
  type CardWithdrawalNote,
  type WithdrawalNotes
} from "@/lib/card/card-movement";
import {
  deriveHistoryRecordKeys,
  historyEvent,
  historyFilter,
  historyOf,
  movementAddress,
  movementEvent,
  movementKey,
  wipeHistoryRecordKeys,
  withdrawalEvent,
  type HeadCopy,
  type HistoryCopy,
  type HistoryRecordKeys,
  type MovementCopy
} from "@/lib/card/history-records";
import {
  CARD_PAYMENTS_KEPT_MS,
  loadCardPaymentsToPublish,
  markCardPaymentsPublished,
  takeExtensionPayments,
  type CardPaymentEntry
} from "@/lib/card/payment-log";
import { logFailure } from "@/lib/log/log";
import {
  COPIES_AT_ONCE,
  publishAgain,
  publishAgainToQuorum,
  queryRelaysPaged,
  type RelayCall
} from "@/lib/nostr/pool";
import { currentRelays } from "@/lib/relays/current";
import { sameRelayList } from "@/lib/relays/list";

import {
  leaseCardWallet,
  listCardWalletPayments,
  readCardWallet,
  type CardWalletLease,
  type CardWalletOf
} from "./card-wallet";
import { valueCardPayments, valueCurrency, valuesOf, oldestValued } from "./history-value";
import { CARD_RECORD_TIMEOUT_MS, withCardAccess, type CardAccess } from "./states";

/*
 * The card payments on the account's relays (src/lib/card/history-records.ts). The phone publishes
 * each write of its log (payment-log.ts) that no majority of the relays took yet: when it syncs its
 * cards (sync.ts) and after a payment (payment.ts). "History" reads them back, on the web app, and
 *
 * The recharges, returns and withdrawals of a card (src/lib/card/card-movement.ts) are recorded by
 * the device that shows the card, its wallet connected (recordCardMovements): its wallet's payments
 * the relays do not hold yet, each with its value. A withdrawal is noted on a majority of the
 * relays before it leaves (noteCardWithdrawal): what tells it from a return.
 */

function relayCall(keys: HistoryRecordKeys): RelayCall {
  return {
    relays: currentRelays(),
    channel: "account",
    timeoutMs: CARD_RECORD_TIMEOUT_MS,
    authKey: keys.nostr.secretKey
  };
}

/**
 * Publishes the writes of the phone's log no majority of the account's relays took yet,
 * COPIES_AT_ONCE at a time, and keeps those a majority took (or holds newer: a copy as old is
 * refused for the one there, of the same write), once the values of its payments that left are
 * worked out where they can be (history-value.ts: each a write of its own). Resolves with how many
 * are left to publish. Rejects with NewerCardPaymentsError when a newer app wrote the log.
 */
export async function publishCardHistory(
  access: CardAccess,
  now: number = Date.now()
): Promise<number> {
  // First the payments the iOS extension ran (extension-records.ts): published as the app's own.
  await takeExtensionPayments();
  await valueCardPayments(access.walletId, now);
  const keys = deriveHistoryRecordKeys(access.root);
  try {
    const call = relayCall(keys);
    const copies = await loadCardPaymentsToPublish(call.relays, now);
    if (copies.length === 0) return 0;
    const quorum = majority(call.relays.length);
    const published = new Map<string, number>();
    for (let start = 0; start < copies.length; start += COPIES_AT_ONCE) {
      const batch = copies.slice(start, start + COPIES_AT_ONCE);
      const held = await Promise.all(
        batch.map((copy) => publishAgain(historyEvent(keys, copy), call, { quorum: "majority" }))
      );
      batch.forEach(({ entry, revision }, index) => {
        if (held[index].length >= quorum) published.set(entry.id, revision);
      });
    }
    await markCardPaymentsPublished(call.relays, published);
    return copies.length - published.size;
  } finally {
    wipeHistoryRecordKeys(keys);
  }
}

export type CardHistory = {
  /** The account's card payments the relays hold, of the last 90 days, newest first. */
  entries: CardPaymentEntry[];
  /**
   * The recharges, returns and withdrawals of the account's cards the relays hold, of the last 90
   * days, newest first.
   */
  movements: MovementCopy[];
  /** The heads of the copies of the cards' months (history-copies.ts), by card's month (monthKey). */
  heads: ReadonlyMap<string, HeadCopy>;
  /** The withdrawals' notes, of whatever age, by their payment (movementKey). */
  withdrawals: ReadonlyMap<string, CardWithdrawalNote>;
  /**
   * Every tap's and movement's latest write the relays sent, of whatever age (some keep expired
   * ones): what the copies of the months are made of.
   */
  recorded: { taps: readonly HistoryCopy[]; movements: readonly MovementCopy[] };
  /** The addresses holding a record of a newer format (never written over). */
  newerAt: ReadonlySet<string>;
  /** A majority of the relays answered whole: every payment a majority took is there. */
  conclusive: boolean;
  /** Some records are of a newer format: their payments are left out. */
  newer: boolean;
  /**
   * The relays it was read on, the account's list then: what is written from it goes there only
   * (a change of the account's relays meanwhile copies their records, history-copies.ts).
   */
  relays: readonly string[];
};

/** Reads the account's card payments on its relays (every page). Never rejects for the relays. */
export async function readCardHistory(
  access: CardAccess,
  now: number = Date.now()
): Promise<CardHistory> {
  const keys = deriveHistoryRecordKeys(access.root);
  try {
    const call = relayCall(keys);
    const answers = await queryRelaysPaged(historyFilter(keys), call, {
      whole: true,
      quorum: "majority"
    });
    const read = historyOf(keys, answers);
    return {
      // A relay that keeps expired records (NIP-40 is optional) shows nothing more than the log.
      entries: [...read.copies.values()]
        .map(({ entry }) => entry)
        .filter((entry) => entry.at + CARD_PAYMENTS_KEPT_MS > now)
        .sort((a, b) => b.at - a.at || (a.id < b.id ? -1 : 1)),
      movements: [...read.movements.values()]
        .filter(({ movement }) => movement.at + CARD_PAYMENTS_KEPT_MS > now)
        .sort((a, b) => newestFirst(a.movement, b.movement)),
      heads: read.heads,
      withdrawals: read.withdrawals,
      recorded: { taps: [...read.copies.values()], movements: [...read.movements.values()] },
      newerAt: read.newerAt,
      conclusive: read.answered >= majority(call.relays.length),
      newer: read.newer,
      relays: call.relays
    };
  } finally {
    wipeHistoryRecordKeys(keys);
  }
}

/** What `history` tells of the withdrawals (movementOf): their ways, and whether it is whole. */
export function withdrawalNotesOf(history: CardHistory): WithdrawalNotes {
  return {
    ways: new Map([...history.withdrawals].map(([key, note]) => [key, note.way])),
    conclusive: history.conclusive
  };
}

/**
 * Notes the withdrawal `note` of a card's wallet on a majority of the account's relays, before it
 * leaves (card-movement.ts): written again as it is when the same withdrawal is tried again.
 * Resolves with whether a majority took it; never rejects for the relays.
 */
export async function noteCardWithdrawal(
  access: CardAccess,
  note: CardWithdrawalNote
): Promise<boolean> {
  const keys = deriveHistoryRecordKeys(access.root);
  try {
    const call = relayCall(keys);
    return await publishAgainToQuorum(
      withdrawalEvent(keys, note, Math.floor(Date.now() / 1000)),
      call,
      majority(call.relays.length)
    );
  } finally {
    wipeHistoryRecordKeys(keys);
  }
}

function newestFirst(a: CardMovement, b: CardMovement): number {
  return b.at - a.at || (movementKey(a) < movementKey(b) ? -1 : 1);
}

/** The movements of a card's wallet: each of its payments read (card-movement.ts). */
async function walletMovements(
  lease: CardWalletLease,
  notes: WithdrawalNotes
): Promise<CardMovement[]> {
  const payments = await listCardWalletPayments(lease);
  const wallet = { cardId: lease.cardId, walletGeneration: lease.generation };
  return payments.flatMap((payment) => movementOf(wallet, payment, notes) ?? []);
}

/**
 * Records the recharges, returns and withdrawals of the card whose wallet is `lease` (synced:
 * readCardWallet) that `history` (readCardHistory) lacks, holds without a value that can be worked
 * out now (history-value.ts), or holds as a return though a withdrawal's note says otherwise (an
 * older version of the app recorded it so: written again as the withdrawal, its value kept), each a
 * record of its own, to the relays `history` was read on
 * (COPIES_AT_ONCE at a time), but those of a newer format there, never written over, and those
 * older than their records live (the copies of their months keep them). Only after a read of a
 * majority of the relays (`conclusive`): a newer app's record there is then known. Resolves with
 * the card's movements as kept now, newest first: those a relay took, and the others as the
 * wallet tells them. Rejects as the wallet's listing; never for the relays.
 */
export async function recordCardMovements(
  access: CardAccess,
  lease: CardWalletLease,
  history: CardHistory,
  now: number = Date.now()
): Promise<MovementCopy[]> {
  const known = new Map(history.movements.map((copy) => [movementKey(copy.movement), copy]));
  const fresh = (await walletMovements(lease, withdrawalNotesOf(history))).filter(
    (movement) => movement.at + CARD_PAYMENTS_KEPT_MS > now
  );
  const keys = deriveHistoryRecordKeys(access.root);
  try {
    // Those the relays lack, and those they hold without a value: valued where it can be.
    const due = fresh.flatMap((movement): MovementCopy[] => {
      const kept = known.get(movementKey(movement));
      if (!history.conclusive) return [];
      if (history.newerAt.has(movementAddress(keys, movement))) return [];
      if (kept?.movement.kind === "return" && movement.kind === "withdrawal") {
        // Told otherwise now (a withdrawal's note): the wallet's, with the value kept. Never the
        // other way: a withdrawal was recorded with its proof (its note, its transaction).
        return [
          { movement: { ...movement, value: kept.movement.value }, revision: kept.revision + 1 }
        ];
      }
      if (kept?.movement.value) return [];
      return [
        kept ? { movement: kept.movement, revision: kept.revision + 1 } : { movement, revision: 0 }
      ];
    });
    const currency = due.length > 0 ? await valueCurrency(access.walletId) : null;
    const values = currency
      ? await valuesOf(
          due
            .filter(({ movement }) => movement.at >= oldestValued(now))
            .map(({ movement }) => ({
              id: movementKey(movement),
              sats: movement.amountSats,
              at: movement.at
            })),
          currency,
          now
        )
      : new Map();
    const writes = due.flatMap((copy): MovementCopy[] => {
      const key = movementKey(copy.movement);
      const value = copy.movement.value ?? values.get(key) ?? null;
      // Held already as it is, still no value to add: nothing to write.
      if (
        copy.revision > 0 &&
        value === null &&
        known.get(key)?.movement.kind === copy.movement.kind
      ) {
        return [];
      }
      return [{ ...copy, movement: { ...copy.movement, value } }];
    });
    // To the list `history` was read on, while it is the account's: its revisions and newer formats
    // are that list's (after a change of the account's relays, the next read records them there).
    const call = { ...relayCall(keys), relays: history.relays };
    for (let start = 0; start < writes.length; start += COPIES_AT_ONCE) {
      if (!sameRelayList(currentRelays(), history.relays)) break;
      const batch = writes.slice(start, start + COPIES_AT_ONCE);
      const held = await Promise.all(
        batch.map((copy) => publishAgain(movementEvent(keys, copy), call, { quorum: "majority" }))
      );
      // Held once a majority took it: else it is written again at the next run, which reads it
      // from a majority (readCardHistory).
      batch.forEach((copy, index) => {
        if (held[index].length >= majority(call.relays.length)) {
          known.set(movementKey(copy.movement), copy);
        }
      });
    }
    const written = new Map(writes.map((copy) => [movementKey(copy.movement), copy]));
    return fresh
      .map(
        (movement) =>
          known.get(movementKey(movement)) ??
          written.get(movementKey(movement)) ?? { movement, revision: 0 }
      )
      .sort((a, b) => newestFirst(a.movement, b.movement));
  } finally {
    wipeHistoryRecordKeys(keys);
  }
}

/** At most one recording of a card's movements from "Cards" per this long while the app runs. */
export const MOVEMENTS_RECORD_INTERVAL_MS = 24 * 3600 * 1000;

/**
 * When this app last recorded each card's movements from "Cards", by wallet and card: in memory, as
 * the day's copy round (history-copies.ts), so the first "Cards" of each start records them.
 */
const lastRecorded = new Map<string, number>();

/**
 * Records the top-ups, returns and withdrawals of the card's wallet `card` (recordCardMovements)
 * from "Cards", its balance under it: at the first "Cards" since the app started, then at most once
 * a MOVEMENTS_RECORD_INTERVAL_MS per card while it runs. A movement no "History" showed within
 * its records' 90 days would miss the copy of its month (history-copies.ts), and with it its value.
 * Its wallet leased for it, synced, and released once done. Never rejects.
 */
export async function recordCardMovementsDaily(
  walletId: string,
  card: CardWalletOf,
  now: number = Date.now()
): Promise<void> {
  const key = `${walletId.toLowerCase()}/${card.cardId}/${card.walletGeneration}`;
  const last = lastRecorded.get(key);
  if (last !== undefined && now - last < MOVEMENTS_RECORD_INTERVAL_MS) return;
  lastRecorded.set(key, now);
  try {
    await withCardAccess(async (access) => {
      if (access.walletId.toLowerCase() !== walletId.toLowerCase()) return;
      const lease = await leaseCardWallet(access, card);
      try {
        // Synced first: what it holds once connected may miss its latest payments.
        await readCardWallet(lease);
        await recordCardMovements(access, lease, await readCardHistory(access, now), now);
      } finally {
        await lease.release();
      }
    });
  } catch (error) {
    logFailure("Recording a card's movements failed", error);
  }
}

/** Forgets the last recordings (tests). */
export function resetCardMovementRecords(): void {
  lastRecorded.clear();
}
