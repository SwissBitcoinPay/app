import { majority } from "@/config/registry";
import { inBatches } from "@/lib/batches";
import {
  cardImagesOf,
  cardStatesFilter,
  cardStatesOf,
  erasedGenerations,
  isErasedData
} from "@/lib/card/card-record";
import {
  cardOwnAuthKeys,
  cardOwnFilter,
  cardOwnKeys,
  cardOwnSecret,
  wipeCardOwnKeys
} from "@/lib/card/card-own";
import {
  PARTS_PER_READ,
  deriveMonthPartKeys,
  monthCopyOf,
  monthPartAddresses,
  wipeMonthPartKeys
} from "@/lib/card/history-months";
import {
  deriveHistoryRecordKeys,
  historyAddress,
  historyFilter,
  historyOf,
  monthHeadAddress,
  movementAddress,
  withdrawalAddress,
  wipeHistoryRecordKeys,
  type HeadCopy
} from "@/lib/card/history-records";
import {
  cardPayeeEvents,
  derivePayeeRecordKeys,
  payeesFilter,
  wipePayeeRecordKeys
} from "@/lib/card/payee-records";
import { logFailure } from "@/lib/log/log";
import { copyImageTo, type ImageRef } from "@/lib/media/image";
import type { NostrEvent } from "@/lib/nostr/event";
import {
  COPIES_AT_ONCE,
  holdersOf,
  newestEvents,
  publishCopies,
  queryRelaysPaged,
  type RelayCall
} from "@/lib/nostr/pool";
import { RECORD_KIND } from "@/lib/nostr/record";
import type { RelayFilter } from "@/lib/nostr/relay";
import { sameRelayList } from "@/lib/relays/list";

import {
  MONTH_REFRESH_SECONDS,
  entriesToRewrite,
  headsStand,
  publishToMajority,
  queryMonthParts,
  writeMonthCopy,
  type MonthCopyKeys
} from "./history-copies";
import { copyLegacyCopies } from "./legacy-history";
import {
  CARD_RECORD_TIMEOUT_MS,
  cardStatesOnDevice,
  readAllCardIds,
  withCardAccess,
  type CardAccess
} from "./states";

/*
 * The cards' records at a change of the account's relays ("Settings", changeRelays): relays do
 * not copy between themselves, what is not copied stays on the list left.
 *
 * The copies of the cards' months (history-copies.ts) hold the history past its records' 90 days
 * (the whole history kept), and nothing else does: they go to the new list before the change is
 * saved, as "Wallet"'s copies of the declarations do
 * (copyArchive, in moveTeam), and the change is refused when they cannot. A copy signed over a
 * year ago, or one that lost parts, is written there signed again (what is left of it), as the
 * day's round would: a relay refuses an event over 3 years old (strfry), which no change of
 * relays could then copy. The other records follow once the change is saved (copyCardRecords):
 * the account's devices write them again anyway (the states and approved merchants they keep,
 * refreshCardStates and refreshCardPayees; the taps of their logs; the movements of the cards'
 * wallets), the copy keeps what only a device gone held.
 *
 * What a card's deletion erased (its wallets' data, card-erasure.ts) stays on the list left:
 * copied, it would wait on the new list for the account's next session to erase it again there.
 */

function recordsCall(relays: readonly string[], authKey: Uint8Array): RelayCall {
  return { relays, channel: "account", timeoutMs: CARD_RECORD_TIMEOUT_MS, authKey };
}

function dTag(event: NostrEvent): string {
  return event.tags.find(([name]) => name === "d")?.[1] ?? "";
}

/**
 * The newest copy of each address among the events relays sent (newestEvents: each checked), the
 * records of `filter`'s author only: a relay may send others' events, which are not to copy.
 */
function ownNewest(
  filter: RelayFilter,
  answers: ReadonlyMap<string, readonly unknown[]>
): NostrEvent[] {
  return newestEvents(answers).filter(
    (event) => event.kind === RECORD_KIND && filter.authors?.includes(event.pubkey) === true
  );
}

/**
 * Up to which generation each card's wallets' data are erased (erasedGenerations), as the cards'
 * states `answers` gives (the list left's) and this device knows them.
 */
async function erasedOf(
  access: CardAccess,
  answers: ReadonlyMap<string, readonly unknown[]>
): Promise<Map<string, number>> {
  return erasedGenerations([
    ...cardStatesOf(access.keys, access.root, answers).states.values(),
    ...(await cardStatesOnDevice(access))
  ]);
}

/** The heads in groups of PARTS_PER_READ parts at most (a bigger one alone): one read each. */
function inGroups(heads: readonly HeadCopy[]): HeadCopy[][] {
  const groups: HeadCopy[][] = [];
  let group: HeadCopy[] = [];
  let parts = 0;
  for (const copy of heads) {
    if (group.length > 0 && parts + copy.head.parts > PARTS_PER_READ) {
      groups.push(group);
      group = [];
      parts = 0;
    }
    group.push(copy);
    parts += copy.head.parts;
  }
  if (group.length > 0) groups.push(group);
  return groups;
}

/** What copyCardMonths leaves for once the change is saved (copyCardRecords). */
export type CardMonthsCopy = {
  /** The taps and movements of this format the list left holds, as they are. */
  later: readonly NostrEvent[];
};

/**
 * Copies to the relays `next` what of the cards' history the relays `before` hold that nothing
 * else keeps, for a change of the account's relays, before it is saved: the copy of each card's
 * month (its parts, then its head; signed again when it was over MONTH_REFRESH_SECONDS ago or
 * lost parts, as the day's round would), and every other record of the history's author that is
 * no tap nor movement of this format (a newer app's: of a newer format, or of a type this one does
 * not know), as it is. The copies' parts are read and sent a few heads at a time: what one holds
 * goes before the next is read. Resolves with the taps and movements to copy once the change is
 * saved; null when no majority of `before` answered whole or no majority of `next` took a record.
 * Never rejects.
 */
export async function copyCardMonths(
  before: readonly string[],
  next: readonly string[],
  now: number = Date.now()
): Promise<CardMonthsCopy | null> {
  try {
    return await withCardAccess(async (access) => {
      const { root } = access;
      const keys: MonthCopyKeys = {
        parts: deriveMonthPartKeys(root),
        history: deriveHistoryRecordKeys(root)
      };
      try {
        const historyKey = keys.history.nostr.secretKey;
        const recordsFilter = historyFilter(keys.history);
        const records = await queryRelaysPaged(recordsFilter, recordsCall(before, historyKey), {
          whole: true,
          quorum: "majority"
        });
        if (records.size < majority(before.length)) return null;
        const read = historyOf(keys.history, records);
        const headOf = ({ head }: HeadCopy) => monthHeadAddress(keys.history, head);
        // A deleted card's wallets' taps, movements, withdrawals' notes and month copies stay behind; a newer app's
        // record at one of their addresses goes as it is, with the others.
        const erased = await erasedOf(
          access,
          await queryRelaysPaged(
            cardStatesFilter(access.keys),
            recordsCall(before, access.keys.nostr.secretKey),
            { quorum: "majority" }
          )
        );
        const left = new Set(
          [
            ...[...read.copies.values()]
              .filter(({ entry }) => isErasedData(entry, erased))
              .map(({ entry }) => historyAddress(keys.history, entry.id)),
            ...[...read.movements.values()]
              .filter(({ movement }) => isErasedData(movement, erased))
              .map(({ movement }) => movementAddress(keys.history, movement)),
            ...[...read.heads.values()]
              .filter(({ head }) => isErasedData(head, erased))
              .map(headOf),
            ...[...read.withdrawals.values()]
              .filter((note) => isErasedData(note, erased))
              .map((note) => withdrawalAddress(keys.history, note))
          ].filter((address) => !read.newerAt.has(address))
        );
        // The taps and movements of this format: copied once the change is saved.
        const tapsAndMovements = new Set(
          [
            ...[...read.copies.values()].map(({ entry }) => historyAddress(keys.history, entry.id)),
            ...[...read.movements.values()].map(({ movement }) =>
              movementAddress(keys.history, movement)
            )
          ].filter((address) => !read.newerAt.has(address) && !left.has(address))
        );
        // The heads of this format; one a newer app wrote over goes as it is, with the others.
        const heads = [...read.heads.values()].filter(
          (copy) => !read.newerAt.has(headOf(copy)) && !left.has(headOf(copy))
        );
        const headAddresses = new Set(heads.map(headOf));
        const own = ownNewest(recordsFilter, records);
        const byAddress = new Map(own.map((event) => [dTag(event), event]));
        const nowSeconds = Math.floor(now / 1000);
        const partsAuthor = { kinds: [RECORD_KIND], authors: [keys.parts.nostr.publicKey] };
        for (const group of inGroups(heads)) {
          const answers = await queryMonthParts(
            keys.parts,
            group.map(({ head }) => head),
            before
          );
          if (!answers) return null;
          for (const copy of group) {
            const { head } = copy;
            const held = monthCopyOf(keys.parts, head, answers);
            const old = nowSeconds - copy.createdAt > MONTH_REFRESH_SECONDS;
            if (held.newer || (held.complete && !old)) {
              // As it is: its parts, then its head.
              const named = new Set(monthPartAddresses(keys.parts, head));
              const parts = ownNewest(partsAuthor, answers).filter((event) =>
                named.has(dTag(event))
              );
              const headEvent = byAddress.get(headOf(copy));
              if (!(await publishToMajority(parts, next, keys.parts.nostr.secretKey))) return null;
              if (headEvent && !(await publishToMajority([headEvent], next, historyKey))) {
                return null;
              }
              continue;
            }
            if (!held.complete) {
              // Replaced meanwhile by another device's round, which deleted its parts (headsStand):
              // the change waits, its next try copies that newer copy.
              if (!(await headsStand(keys.history, [copy], before))) return null;
              logFailure("A card's month copy lacked parts");
            }
            // Nothing left of it: nothing to keep.
            if (!entriesToRewrite(held)) continue;
            const signed = await writeMonthCopy(
              keys,
              head,
              head.month,
              held.taps,
              held.movements,
              copy.createdAt,
              now,
              next
            );
            if (!signed) return null;
          }
        }
        // A newer app's records, or of a type this one does not know: as they are.
        const others = own.filter(
          (event) =>
            !tapsAndMovements.has(dTag(event)) &&
            !headAddresses.has(dTag(event)) &&
            !left.has(dTag(event))
        );
        if (!(await publishToMajority(others, next, historyKey))) return null;
        // Another device's round may have replaced one of them on the list left meanwhile: the
        // copies that went must be the ones that still stand there, or the change waits.
        if (!(await headsStand(keys.history, heads, before))) return null;
        // The cards' v2 histories (legacy-history.ts): nothing else keeps them once the v2 service
        // ends.
        if (!(await copyLegacyCopies(access, erased, before, next, nowSeconds))) return null;
        return { later: own.filter((event) => tapsAndMovements.has(dTag(event))) };
      } finally {
        wipeMonthPartKeys(keys.parts);
        wipeHistoryRecordKeys(keys.history);
      }
    });
  } catch (error) {
    // No account open, or it closed meanwhile (the card root wiped).
    logFailure("Copying the cards' months to the new relays failed", error);
    return null;
  }
}

/**
 * After a change of the account's relays (changeRelays), the cards' records the relays `before`
 * hold (read from a majority), as they are, copied to a majority of `next` (publishCopies): their
 * states, approved
 * merchants (a deleted card's wallets' left behind), the taps and movements copyCardMonths left
 * (`months`), then the images their states name (their looks, their issuers' visuals), those of
 * the states this device keeps included. Resolves with whether a majority of `before` gave them
 * and a majority of `next` holds each one, each image found; a card's own copies, which the phone
 * keeping its pass writes again, are not counted. Never rejects.
 */
export async function copyCardRecords(
  before: readonly string[],
  next: readonly string[],
  months: CardMonthsCopy
): Promise<boolean> {
  if (sameRelayList(before, next)) return true;
  const quorum = majority(before.length);
  let whole = true;
  /** Notes whether `copied` of `events` a majority of `next` holds, read from `answers`. */
  const count = (
    answers: ReadonlyMap<string, unknown>,
    events: readonly unknown[],
    copied: number
  ) => {
    if (answers.size < quorum || copied < events.length) whole = false;
  };
  try {
    await withCardAccess(async (access) => {
      const images = new Map<string, ImageRef>();
      const states = recordsCall(before, access.keys.nostr.secretKey);
      const statesFilter = cardStatesFilter(access.keys);
      const answers = await queryRelaysPaged(statesFilter, states, { quorum: "majority" });
      const ownStates = ownNewest(statesFilter, answers);
      count(
        answers,
        ownStates,
        await publishCopies(ownStates, states, next, holdersOf(answers, ownStates))
      );
      const erased = await erasedOf(access, answers);
      const read = cardStatesOf(access.keys, access.root, answers).states;
      for (const state of read.values()) {
        for (const image of cardImagesOf(state)) images.set(`${image.key} ${image.hash}`, image);
      }
      // Each card's own copies (own-copies.ts), of its wallets not erased, COPIES_AT_ONCE wallets
      // at a time: one read and its copies each.
      const wallets = [...read.values()].flatMap((state) =>
        Array.from({ length: state.walletGeneration }, (_, index) => ({
          cardId: state.cardId,
          walletGeneration: index + 1
        })).filter((wallet) => !isErasedData(wallet, erased))
      );
      await inBatches(wallets, COPIES_AT_ONCE, async (wallet) => {
        const own = cardOwnSecret(access.root, wallet);
        const keys = cardOwnKeys(own);
        own.fill(0);
        try {
          const filter = cardOwnFilter(keys);
          const call: RelayCall = {
            ...recordsCall(before, keys.state.nostr.secretKey),
            authKey: cardOwnAuthKeys(keys)
          };
          const held = await queryRelaysPaged(filter, call, { quorum: "majority" });
          const copies = ownNewest(filter, held);
          await publishCopies(copies, call, next, holdersOf(held, copies));
        } catch (error) {
          // Filled in again by the next sync of the phone keeping the card's pass.
          logFailure("Copying a card's own copies to the new relays failed", error);
        } finally {
          wipeCardOwnKeys(keys);
        }
        return true;
      });
      const payeeKeys = derivePayeeRecordKeys(access.root);
      const historyKeys = deriveHistoryRecordKeys(access.root);
      try {
        const payees = recordsCall(before, payeeKeys.nostr.secretKey);
        const filter = payeesFilter(payeeKeys);
        const held = await queryRelaysPaged(filter, payees, { quorum: "majority" });
        const left = new Set(
          cardPayeeEvents(payeeKeys, held, (wallet) => isErasedData(wallet, erased)).map(
            ({ id }) => id
          )
        );
        const books = ownNewest(filter, held).filter(({ id }) => !left.has(id));
        count(held, books, await publishCopies(books, payees, next, holdersOf(held, books)));
        const later = await publishCopies(
          months.later,
          recordsCall(before, historyKeys.nostr.secretKey),
          next
        );
        if (later < months.later.length) whole = false;
      } finally {
        wipePayeeRecordKeys(payeeKeys);
        wipeHistoryRecordKeys(historyKeys);
      }
      try {
        for (const image of (await readAllCardIds(access)).images) {
          images.set(`${image.key} ${image.hash}`, image);
        }
      } catch (error) {
        // The device's copy unreadable: the images of the states the relays hold still go.
        logFailure("Reading the cards this device keeps failed", error);
      }
      const found = await inBatches([...images.values()], COPIES_AT_ONCE, (image) =>
        copyImageTo(image, next, before)
      );
      if (found === null || !found.every(Boolean)) whole = false;
    });
    return whole;
  } catch (error) {
    // No account open, or it closed meanwhile: the devices write their records again.
    logFailure("Copying the cards' records to the new relays failed", error);
    return false;
  }
}
