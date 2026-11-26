import { majority } from "@/config/registry";
import { isErasedData } from "@/lib/card/card-record";
import {
  deriveHistoryRecordKeys,
  historyOf,
  monthHeadAddress,
  monthHeadEvent,
  monthKey,
  movementKey,
  wipeHistoryRecordKeys,
  type CardWalletMonth,
  type HeadCopy,
  type HistoryCopy,
  type HistoryRecordKeys,
  type MovementCopy
} from "@/lib/card/history-records";
import {
  deriveMonthPartKeys,
  monthCopy,
  monthCopyOf,
  monthEntries,
  monthPartEvent,
  monthPartsFilters,
  PARTS_PER_READ,
  wipeMonthPartKeys,
  type MonthCopyRead,
  type MonthPartKeys
} from "@/lib/card/history-months";
import type { CardWalletOf } from "@/lib/card/keys";
import { monthEnd, monthOf, monthSet, type MonthHead } from "@/lib/card/month-head";
import { logFailure } from "@/lib/log/log";
import { deletionRequests } from "@/lib/nostr/deletion";
import type { NostrEvent } from "@/lib/nostr/event";
import { RECORD_KIND } from "@/lib/nostr/record";
import {
  COPIES_AT_ONCE,
  publishAgainToQuorum,
  publishToRelays,
  queryRelays,
  type RelayCall
} from "@/lib/nostr/pool";
import { currentRelays } from "@/lib/relays/current";
import { sameRelayList } from "@/lib/relays/list";

import { readCardHistory, type CardHistory } from "./history-sync";
import { CARD_RECORD_TIMEOUT_MS, type CardAccess } from "./states";

/*
 * The copies of each card's months (src/lib/card/history-months.ts: the whole history kept,
 * rewritten each year as the account's own), as the account's devices write and read them.
 *
 * A device that read the history from a majority of the relays (readCardHistory), none of its
 * records of a newer format, copies each month that is over of each card's wallet: every tap and
 * movement of that wallet and month its records hold, merged with what the month's copy held
 * already (its parts, read again). A month copied already is copied again only when a record holds
 * an entry, or a later write of one, that its copy lacks: a payment told uncertain then sent, a
 * value worked out later. The parts go first, each to a majority, then the head that names them: a
 * head never names parts that are not there; the parts of the copy it replaced, which no head names
 * any more, are then deleted (deleteReplacedParts). Each copy is signed again once a year
 * (MONTH_REFRESH_SECONDS).
 * A round writes COPIES_PER_ROUND copies at most: the oldest months first, then the oldest
 * signatures.
 *
 * The records of the taps and movements live 90 days: a month is copied within the two months
 * that follow it as long as one of the account's devices opens "Cards" or syncs its cards.
 */

/** A copy signed this long ago is signed again: strfry refuses events over 3 years old. */
export const MONTH_REFRESH_SECONDS = 365 * 24 * 3600;

/** At most one copy round per this long on a device (each reads the whole history). */
export const COPY_INTERVAL_MS = 24 * 3600 * 1000;

/**
 * At most this many copies written per round, the rest at the next ones: the heads of a round
 * share its second, and a relay sends only so many events of one second (strfry: 500), past which
 * a read by date cannot page (queryRelaysPaged).
 */
export const COPIES_PER_ROUND = 50;

/** The last round of this device (in memory: an app start may run one again). */
let lastRound: { walletId: string; at: number } | null = null;

function relayCall(authKey: Uint8Array): RelayCall {
  return {
    relays: currentRelays(),
    channel: "account",
    timeoutMs: CARD_RECORD_TIMEOUT_MS,
    authKey
  };
}

/** The latest write of each entry among `copies` (by key), whatever their order. */
function latestTaps(copies: readonly HistoryCopy[]): Map<string, HistoryCopy> {
  const latest = new Map<string, HistoryCopy>();
  for (const copy of copies) {
    const known = latest.get(copy.entry.id);
    if (!known || copy.revision > known.revision) latest.set(copy.entry.id, copy);
  }
  return latest;
}

function latestMovements(copies: readonly MovementCopy[]): Map<string, MovementCopy> {
  const latest = new Map<string, MovementCopy>();
  for (const copy of copies) {
    const key = movementKey(copy.movement);
    const known = latest.get(key);
    if (!known || copy.revision > known.revision) latest.set(key, copy);
  }
  return latest;
}

/**
 * What `relays` hold of the parts `heads` name, by address (monthPartsFilters), each relay's
 * events of every read together. Null when a read got fewer than a majority of `relays`: any part
 * a majority took is in the others (any two majorities share a relay). Never rejects.
 */
export async function queryMonthParts(
  keys: MonthPartKeys,
  heads: readonly MonthHead[],
  relays: readonly string[]
): Promise<Map<string, unknown[]> | null> {
  const call = { ...relayCall(keys.nostr.secretKey), relays };
  const answers = new Map<string, unknown[]>();
  for (const filter of monthPartsFilters(keys, heads)) {
    const read = await queryRelays(filter, call, { quorum: "majority" });
    if (read.size < majority(relays.length)) return null;
    for (const [relay, events] of read) {
      const held = answers.get(relay);
      // A loop, not push(...events): a relay may send more events than a call takes arguments.
      if (held) for (const event of events) held.push(event);
      else answers.set(relay, [...events]);
    }
  }
  return answers;
}

/**
 * Reads the copy `head` names from `relays` (its parts, by address). Whole only when a majority of
 * the relays answered each read and every part is there (monthCopyOf). Never rejects.
 */
async function readCopy(
  keys: MonthPartKeys,
  head: MonthHead,
  relays: readonly string[]
): Promise<MonthCopyRead | null> {
  const answers = await queryMonthParts(keys, [head], relays);
  return answers && monthCopyOf(keys, head, answers);
}

/**
 * Publishes `events` as they are to `relays`, COPIES_AT_ONCE at a time, signed by `authKey`'s
 * author: whether a majority took each one (or holds newer), stopping at the first that no
 * majority took. A relay that does not answer costs no wait once a majority took an event.
 */
export async function publishToMajority(
  events: readonly NostrEvent[],
  relays: readonly string[],
  authKey: Uint8Array
): Promise<boolean> {
  const call = { ...relayCall(authKey), relays };
  const quorum = majority(relays.length);
  for (let start = 0; start < events.length; start += COPIES_AT_ONCE) {
    const held = await Promise.all(
      events
        .slice(start, start + COPIES_AT_ONCE)
        .map((event) => publishAgainToQuorum(event, call, quorum))
    );
    if (!held.every(Boolean)) return false;
  }
  return true;
}

/**
 * Whether `held` (a copy read back) holds every entry of `taps` and `movements`, at their revision
 * or a later one. From its parts: its head lists no entries (month-head.ts).
 */
function covers(
  held: MonthCopyRead,
  taps: readonly HistoryCopy[],
  movements: readonly MovementCopy[]
): boolean {
  const copied = new Map<string, number>();
  const note = (key: string, revision: number) =>
    copied.set(key, Math.max(revision, copied.get(key) ?? -1));
  for (const { entry, revision } of held.taps) note(`t/${entry.id}`, revision);
  for (const { movement, revision } of held.movements) note(`m/${movementKey(movement)}`, revision);
  return (
    taps.every(({ entry, revision }) => (copied.get(`t/${entry.id}`) ?? -1) >= revision) &&
    movements.every(
      ({ movement, revision }) => (copied.get(`m/${movementKey(movement)}`) ?? -1) >= revision
    )
  );
}

/** The keys a copy of a card's month is written with: its parts', its head's (the history's). */
export type MonthCopyKeys = { parts: MonthPartKeys; history: HistoryRecordKeys };

/**
 * Writes to `relays` the copy of a card's wallet's month holding `taps` and `movements`, its parts
 * then its head, dated now and after `formerAt` (the date of the head the relays hold, if any): all
 * of it to one list, even if the account's changes meanwhile. Whether a majority took them all.
 */
export async function writeMonthCopy(
  keys: MonthCopyKeys,
  card: CardWalletOf,
  month: string,
  taps: readonly HistoryCopy[],
  movements: readonly MovementCopy[],
  formerAt: number | null,
  now: number,
  relays: readonly string[]
): Promise<boolean> {
  const { head, parts } = monthCopy(card, month, taps, movements);
  const at = Math.max(Math.floor(now / 1000), (formerAt ?? 0) + 1);
  const partsTaken = await publishToMajority(
    parts.map((part) => monthPartEvent(keys.parts, part, at)),
    relays,
    keys.parts.nostr.secretKey
  );
  if (!partsTaken) return false;
  return publishToMajority(
    [monthHeadEvent(keys.history, head, at)],
    relays,
    keys.history.nostr.secretKey
  );
}

/**
 * Whether each head of `heads` (read with the history) is still the one a majority of `relays`
 * holds, none signed since: what a copy is checked against before it is written again from what is
 * left of it, and the copies a change of relays took along before the change is saved. A round
 * that replaced one (another device, another tab) deletes its parts once its own head is on a
 * majority (deleteReplacedParts): any majority then holds that newer head, which the next round
 * copies from. Written again from the parts left, or moved without it, the copy would have come
 * after it, and the entries only it held been lost. By their addresses,
 * PARTS_PER_READ a read. Not read from a majority: not known, so no.
 */
export async function headsStand(
  keys: HistoryRecordKeys,
  heads: readonly HeadCopy[],
  relays: readonly string[]
): Promise<boolean> {
  const call = { ...relayCall(keys.nostr.secretKey), relays };
  for (let start = 0; start < heads.length; start += PARTS_PER_READ) {
    const group = heads.slice(start, start + PARTS_PER_READ);
    const answers = await queryRelays(
      {
        kinds: [RECORD_KIND],
        authors: [keys.nostr.publicKey],
        "#d": group.map(({ head }) => monthHeadAddress(keys, head))
      },
      call,
      { quorum: "majority" }
    );
    if (answers.size < majority(relays.length)) return false;
    const standing = historyOf(keys, answers).heads;
    for (const { head, createdAt } of group) {
      const there = standing.get(monthKey(head));
      if (there?.createdAt !== createdAt || there.head.set !== head.set) return false;
    }
  }
  return true;
}

/**
 * Deletes the parts of a copy that one of another set replaced (`held`, read before it was), once
 * the new head is on a majority (writeMonthCopy): no head names them any more, nothing reads them
 * again, and a card deleted leaves none of its history behind (card-erasure.ts). By their ids only
 * (deletionRequests, `byIdOnly`): the same parts signed again meanwhile by another device, whose
 * head may still prevail, are kept. Best effort: a relay that keeps them keeps what nothing reads.
 * Never rejects.
 */
async function deleteReplacedParts(
  keys: MonthPartKeys,
  held: MonthCopyRead,
  set: string,
  head: MonthHead,
  relays: readonly string[],
  now: number
): Promise<void> {
  if (set === head.set || held.events.length === 0) return;
  try {
    const call = { ...relayCall(keys.nostr.secretKey), relays };
    const requests = deletionRequests(
      keys.nostr.secretKey,
      held.events,
      Math.floor(now / 1000),
      [],
      {
        byIdOnly: true
      }
    );
    await Promise.all(
      requests.map((request) => publishToRelays(request, call, { quorum: "majority" }))
    );
  } catch (error) {
    logFailure("Deleting a card's month copy replaced failed", error);
  }
}

/**
 * A copy to sign again (MONTH_REFRESH_SECONDS), or to write again from what is left of it (its
 * parts a majority took gone since): the entries `held` holds, if it holds any.
 */
export function entriesToRewrite(held: MonthCopyRead): boolean {
  return held.taps.length + held.movements.length > 0;
}

/**
 * Copies the months of the account's cards' wallets that are over, from `history`
 * (readCardHistory), and signs again the copies signed over MONTH_REFRESH_SECONDS ago: only after a
 * read of a majority of the relays without a record of a newer format (a newer app copies what this
 * one cannot read). Never those of the wallets `erased` says are erased (card-record.ts,
 * erasedGenerations), whose history goes (card-erasure.ts). Resolves with how many copies a
 * majority took. Never rejects.
 */
export async function copyCardHistory(
  access: CardAccess,
  history: CardHistory,
  now: number = Date.now(),
  erased: ReadonlyMap<string, number> = new Map()
): Promise<number> {
  if (!history.conclusive || history.newer) return 0;
  const keys: MonthCopyKeys = {
    parts: deriveMonthPartKeys(access.root),
    history: deriveHistoryRecordKeys(access.root)
  };
  // The list the history was read on: a round never writes to another one (a change of the
  // account's relays since the read ends it, the next round copies on the new list).
  const { relays } = history;
  const listLeft = () => !sameRelayList(currentRelays(), relays);
  let written = 0;
  try {
    // The records of each card's wallet's months that are over.
    type Recorded = CardWalletMonth & { taps: HistoryCopy[]; movements: MovementCopy[] };
    const months = new Map<string, Recorded>();
    const monthOfKey = (wallet: CardWalletOf, at: number) => {
      if (isErasedData(wallet, erased)) return null;
      const month = monthOf(at);
      if (monthEnd(month) > now) return null;
      const of = { cardId: wallet.cardId, walletGeneration: wallet.walletGeneration, month };
      const key = monthKey(of);
      let found = months.get(key);
      if (!found) {
        found = { ...of, taps: [], movements: [] };
        months.set(key, found);
      }
      return found;
    };
    for (const copy of history.recorded.taps)
      monthOfKey(copy.entry, copy.entry.at)?.taps.push(copy);
    for (const copy of history.recorded.movements) {
      monthOfKey(copy.movement, copy.movement.at)?.movements.push(copy);
    }
    const rewritten = new Set<string>();
    let tried = 0;
    // The oldest months first: their records are the first to expire.
    const byMonth = [...months].sort(([keyA, a], [keyB, b]) =>
      a.month < b.month ? -1 : a.month > b.month ? 1 : keyA < keyB ? -1 : 1
    );
    for (const [key, recorded] of byMonth) {
      const { month } = recorded;
      const wallet = { cardId: recorded.cardId, walletGeneration: recorded.walletGeneration };
      const former = history.heads.get(key) ?? null;
      const taps = [...latestTaps(recorded.taps).values()];
      const movements = [...latestMovements(recorded.movements).values()];
      if (tried >= COPIES_PER_ROUND || listLeft()) break;
      try {
        let held: MonthCopyRead | null = null;
        if (former) {
          held = await readCopy(keys.parts, former.head, relays);
          // What the copy held must be read before it is replaced: not now, then.
          if (!held || held.newer) continue;
          // Every record copied already: nothing to write.
          if (covers(held, taps, movements)) continue;
          // Parts a majority took, gone since: the copy keeps what is left of them, unless another
          // round replaced it meanwhile (headsStand).
          if (!held.complete) {
            if (!(await headsStand(keys.history, [former], relays))) continue;
            logFailure("A card's month copy lacked parts");
          }
        }
        tried += 1;
        const mergedTaps = [...latestTaps([...(held?.taps ?? []), ...taps]).values()];
        const mergedMovements = [
          ...latestMovements([...(held?.movements ?? []), ...movements]).values()
        ];
        const merged = await writeMonthCopy(
          keys,
          wallet,
          month,
          mergedTaps,
          mergedMovements,
          former?.createdAt ?? null,
          now,
          relays
        );
        if (merged) {
          written += 1;
          rewritten.add(key);
          if (former && held) {
            const set = monthSet(monthEntries(mergedTaps, mergedMovements));
            await deleteReplacedParts(keys.parts, held, set, former.head, relays, now);
          }
        } else {
          // Not taken by a majority (relays down, or refusing it): tried again at the next round,
          // told to support meanwhile, its records expiring at 90 days.
          logFailure("A card's month copy was not taken");
        }
      } catch (error) {
        logFailure("Copying a card's month failed", error);
      }
    }
    // Signed again once a year, the oldest signed first: as they are, or what is left of a copy
    // whose parts went (else it would never be signed again, and strfry refuse it at 3 years).
    const signed = [...history.heads].sort(([, a], [, b]) => a.createdAt - b.createdAt);
    for (const [key, copy] of signed) {
      if (Math.floor(now / 1000) - copy.createdAt <= MONTH_REFRESH_SECONDS) continue;
      if (rewritten.has(key) || isErasedData(copy.head, erased)) continue;
      if (tried >= COPIES_PER_ROUND || listLeft()) break;
      try {
        const held = await readCopy(keys.parts, copy.head, relays);
        if (!held || held.newer) continue;
        if (!held.complete) {
          if (!(await headsStand(keys.history, [copy], relays))) continue;
          logFailure("A card's month copy lacked parts");
          if (!entriesToRewrite(held)) continue;
        }
        tried += 1;
        const signedAgain = await writeMonthCopy(
          keys,
          copy.head,
          copy.head.month,
          held.taps,
          held.movements,
          copy.createdAt,
          now,
          relays
        );
        if (signedAgain) {
          written += 1;
          // What was left of a copy whose parts went is a copy of another set.
          const set = monthSet(monthEntries(held.taps, held.movements));
          await deleteReplacedParts(keys.parts, held, set, copy.head, relays, now);
        } else {
          logFailure("A card's month copy signed again was not taken");
        }
      } catch (error) {
        logFailure("Signing a card's month again failed", error);
      }
    }
    return written;
  } catch (error) {
    logFailure("Copying the cards' months failed", error);
    return written;
  } finally {
    wipeMonthPartKeys(keys.parts);
    wipeHistoryRecordKeys(keys.history);
  }
}

/**
 * The copy of a card's wallet's month that `head` names (CardHistory.heads), read from the
 * account's relays, for "History" beyond the records' 90 days. Null when no majority of the
 * relays answered. Never rejects.
 */
export async function readCardHistoryMonth(
  access: CardAccess,
  head: MonthHead
): Promise<MonthCopyRead | null> {
  const partKeys = deriveMonthPartKeys(access.root);
  try {
    return await readCopy(partKeys, head, currentRelays());
  } catch (error) {
    logFailure("Reading a card's month failed", error);
    return null;
  } finally {
    wipeMonthPartKeys(partKeys);
  }
}

/**
 * A copy round of the open account's cards' wallets but those `erased` (erasedGenerations): the
 * history read (readCardHistory), then copyCardHistory, at most once a COPY_INTERVAL_MS for the
 * account on this device (its card sync, sync.ts). Resolves with how many copies a majority took.
 * Never rejects.
 */
export async function copyCardHistoryDaily(
  access: CardAccess,
  now: number = Date.now(),
  erased: ReadonlyMap<string, number> = new Map()
): Promise<number> {
  const walletId = access.walletId.toLowerCase();
  if (lastRound?.walletId === walletId && now - lastRound.at < COPY_INTERVAL_MS) return 0;
  lastRound = { walletId, at: now };
  try {
    return await copyCardHistory(access, await readCardHistory(access, now), now, erased);
  } catch (error) {
    logFailure("Copying the cards' months failed", error);
    return 0;
  }
}

/** Forgets the last round (tests). */
export function resetCardHistoryCopies(): void {
  lastRound = null;
}
