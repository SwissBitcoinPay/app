import { majority } from "@/config/registry";
import { getAccountSettings } from "@/features/account/session";
import { satsToFiatMinor } from "@/features/wallet/model";
import { isErasedData } from "@/lib/card/card-record";
import { sameCardWallet, type CardWalletOf } from "@/lib/card/keys";
import {
  deriveLegacyHistoryKeys,
  legacyCopyOf,
  legacyCopyParts,
  legacyHistoryFilter,
  legacyHistoryOf,
  legacyNumberAddress,
  legacyNumberEvent,
  legacyPartAddress,
  legacyPartEvent,
  wipeLegacyHistoryKeys,
  type LegacyHistoryAnswers,
  type LegacyHistoryKeys
} from "@/lib/card/legacy-history-records";
import {
  LegacyCardHistoryError,
  fetchLegacyCardHistory,
  type LegacyCardRow
} from "@/lib/legacy-v2/card-history";
import { RATE_TOLERANCE_SECONDS, fetchLegacyRates, rateAt } from "@/lib/legacy-v2/history";
import { logFailure } from "@/lib/log/log";
import { deletionRequests } from "@/lib/nostr/deletion";
import type { NostrEvent } from "@/lib/nostr/event";
import {
  COPIES_AT_ONCE,
  publishToRelays,
  queryRelaysPaged,
  type RelayCall
} from "@/lib/nostr/pool";
import { signedAt } from "@/lib/nostr/record";
import { nowUnix } from "@/lib/rates/snapshot";
import { monthEnd, monthOf, monthStart } from "@/lib/registry/archive";
import { currentRelays } from "@/lib/relays/current";
import { sameRelayList } from "@/lib/relays/list";
import { currencyDigits } from "@/lib/terminal/amount";

import { publishToMajority } from "./history-copies";
import { CARD_RECORD_TIMEOUT_MS, withCardAccess, type CardAccess } from "./states";

/*
 * The copy of a v2 card's history to the account's relays (its history follows the card to
 * sattle.me, among its movements, without saying where it comes from;
 * for information only, never in its balance nor its limits).
 *
 * A copy reads the whole history of the card on the v2 server (src/lib/legacy-v2/card-history.ts)
 * by the number printed on it, with its v2 PIN when its holder set one, gives each row its value
 * at the v2 server's price of bitcoin nearest its date in the account's display currency (to the
 * minor unit, rounded to the nearest, as a sattle.me movement's value: movement-value.ts), then
 * writes it whole to a majority of the account's relays (legacy-history-records.ts). Once there, it
 * is never written again (the v2 card is closed by its migration: its history ends there), only
 * signed again each year (strfry refuses events over 3 years old).
 *
 * When:
 * - as a v2 card's migration ends (startMigratedCardHistory), its number from its server's answer:
 *   the number is first kept on the relays, then the copy is made without a PIN;
 * when "History" of a migrated card shows no copy (useCardHistory), once per run of the app and
 * card (legacyCopyState: a v2 server down is not asked at each opening), without a PIN; a card with
 * a PIN offers to give it there ("Get the history"), a failure to try again.
 * One copy of a card at a time: asked meanwhile, it is that one.
 *
 * The PIN is sent once to the v2 server, in a header, over HTTPS; never kept, logged nor written.
 */

/** How a copy ended. */
export type LegacyCopyOutcome =
  /** The relays hold the card's copy (made now, or before). */
  | "copied"
  /** The card has a PIN on the v2 portal: asked of its holder. */
  | "pinRequired"
  /** The PIN given is not the card's. */
  | "pinInvalid"
  /** Too many wrong PINs: the v2 server refuses the card's for a while. */
  | "pinLocked"
  /** The v2 server knows no card of that number: nothing to copy. */
  | "unknownCard"
  /** The v2 server, the relays or the account (closed meanwhile): to try again. */
  | "failed";

/** A copy's history and its card, as one read of the relays tells them. */
export type LegacyHistoryRead = {
  /** A majority of the relays answered whole: a copy a majority took is there. */
  conclusive: boolean;
  /** The relays it was read on. */
  relays: readonly string[];
  answers: LegacyHistoryAnswers;
};

/** What "History" shows of a card's v2 history. */
export type CardLegacyHistory = {
  /** A majority of the relays answered whole. */
  conclusive: boolean;
  /** Its copy's rows; null when the relays hold no whole copy of it. */
  rows: LegacyCardRow[] | null;
  /** Its copy is of a newer format: neither shown nor written over. */
  newer: boolean;
  /** The number printed on the card, as the relays keep it for its copy; null when none. */
  number: string | null;
};

/** A part or number unchanged for this long is signed again: strfry refuses events over 3 years. */
export const LEGACY_REFRESH_SECONDS = 365 * 24 * 60 * 60;

function callOf(keys: LegacyHistoryKeys, relays: readonly string[]): RelayCall {
  return {
    relays,
    channel: "account",
    timeoutMs: CARD_RECORD_TIMEOUT_MS,
    authKey: keys.nostr.secretKey
  };
}

function walletKey(walletId: string, wallet: CardWalletOf): string {
  return `${walletId}/${wallet.cardId}/${wallet.walletGeneration}`;
}

/** Reads every copy of the account's cards on `relays` (one author, page by page). */
async function readAll(
  keys: LegacyHistoryKeys,
  relays: readonly string[]
): Promise<LegacyHistoryRead> {
  const raw = await queryRelaysPaged(legacyHistoryFilter(keys), callOf(keys, relays), {
    whole: true,
    quorum: "majority"
  });
  return {
    conclusive: raw.size >= majority(relays.length),
    relays,
    answers: legacyHistoryOf(keys, raw)
  };
}

/** What `read` tells of `wallet`'s copy and number. */
function cardOf(
  keys: LegacyHistoryKeys,
  read: LegacyHistoryRead,
  wallet: CardWalletOf
): CardLegacyHistory {
  const copy = legacyCopyOf(keys, wallet, read.answers.parts, read.answers.newer);
  const number = read.answers.numbers.get(legacyNumberAddress(keys, wallet))?.number.number ?? null;
  return {
    conclusive: read.conclusive,
    rows: copy.copied ? copy.rows : null,
    newer: copy.newer,
    number
  };
}

/**
 * Signs again what `read` holds of `wallet` unchanged for LEGACY_REFRESH_SECONDS (the newest copy
 * of each address, of this format), dated now. That wallet's only: the one shown, in use, never
 * another card's whose deletion may have erased it (a relay that kept an erased record would have
 * it written back everywhere). Best effort: the next read tries again. Never rejects.
 */
async function refresh(
  keys: LegacyHistoryKeys,
  read: LegacyHistoryRead,
  wallet: CardWalletOf,
  now: number
) {
  try {
    const signed = new Map<string, number>();
    const due: NostrEvent[] = [];
    for (const [address, { part, event }] of read.answers.parts) {
      if (!sameCardWallet(part, wallet)) continue;
      if (now - event.created_at <= LEGACY_REFRESH_SECONDS) continue;
      due.push(
        legacyPartEvent(keys, part, signedAt(signed, address, Math.max(now, event.created_at + 1)))
      );
    }
    for (const [address, { number, event }] of read.answers.numbers) {
      if (!sameCardWallet(number, wallet)) continue;
      if (now - event.created_at <= LEGACY_REFRESH_SECONDS) continue;
      due.push(
        legacyNumberEvent(
          keys,
          number,
          signedAt(signed, address, Math.max(now, event.created_at + 1))
        )
      );
    }
    const call = callOf(keys, read.relays);
    for (let start = 0; start < due.length; start += COPIES_AT_ONCE) {
      await Promise.all(
        due
          .slice(start, start + COPIES_AT_ONCE)
          .map((event) => publishToRelays(event, call, { quorum: "majority" }))
      );
    }
  } catch (error) {
    logFailure("Signing a card's v2 history again failed", error);
  }
}

/**
 * The v2 history of `wallet` as the account's relays hold it (its copy, its number), read now; what
 * is due signed again meanwhile. Rejects only when the account closed (NoAccountError) or the keys
 * could not be derived.
 */
export async function readCardLegacyHistory(
  access: CardAccess,
  wallet: CardWalletOf,
  now: number = nowUnix()
): Promise<CardLegacyHistory> {
  const keys = deriveLegacyHistoryKeys(access.root);
  try {
    const read = await readAll(keys, currentRelays());
    if (read.conclusive) await refresh(keys, read, wallet, now);
    return cardOf(keys, read, wallet);
  } finally {
    wipeLegacyHistoryKeys(keys);
  }
}

/**
 * `rows` with their value: the v2 server's price of bitcoin in `currency` nearest each row's date
 * (within RATE_TOLERANCE_SECONDS), one read of the prices per month (UTC). A row without a price
 * near enough keeps none: its sats alone show. Rejects when a month's prices could not be read.
 */
async function withValues(rows: LegacyCardRow[], currency: string): Promise<LegacyCardRow[]> {
  const digits = currencyDigits(currency);
  const byMonth = new Map<string, LegacyCardRow[]>();
  for (const row of rows) {
    const month = monthOf(row.at);
    const ofMonth = byMonth.get(month);
    if (ofMonth) ofMonth.push(row);
    else byMonth.set(month, [row]);
  }
  const valued: LegacyCardRow[] = [];
  for (const [month, ofMonth] of byMonth) {
    const points = await fetchLegacyRates(
      currency,
      monthStart(month) - RATE_TOLERANCE_SECONDS,
      monthEnd(month) - 1 + RATE_TOLERANCE_SECONDS
    );
    for (const row of ofMonth) {
      const price = rateAt(points, row.at);
      if (price === null) {
        valued.push(row);
        continue;
      }
      const minor = satsToFiatMinor(row.sats, digits, price);
      // Beyond Number's exact range only past 90 trillion: never a card's. Never rounded silently.
      valued.push(
        minor <= BigInt(Number.MAX_SAFE_INTEGER)
          ? { ...row, value: { minor: Number(minor), digits, currency } }
          : row
      );
    }
  }
  return valued;
}

/**
 * Writes `events` to a majority of `relays`, read as the account's relays (publishToMajority):
 * false, nothing written, once the account moved to other relays meanwhile (what is written goes
 * to its relays only).
 */
function publishAll(
  keys: LegacyHistoryKeys,
  events: readonly NostrEvent[],
  relays: readonly string[]
): Promise<boolean> {
  if (!sameRelayList(currentRelays(), relays)) return Promise.resolve(false);
  return publishToMajority(events, relays, keys.nostr.secretKey);
}

/** The outcome a failure of the v2 server's read says. */
function outcomeOf(error: unknown): LegacyCopyOutcome {
  if (error instanceof LegacyCardHistoryError) {
    switch (error.code) {
      case "pinRequired":
      case "pinInvalid":
      case "pinLocked":
      case "unknownCard":
        return error.code;
      default:
        return "failed";
    }
  }
  return "failed";
}

/** The copies running, by account and card's wallet. */
const running = new Map<string, Promise<LegacyCopyOutcome>>();

/** How the last copy of each card's wallet ended this run of the app, by account and wallet. */
const outcomes = new Map<string, LegacyCopyOutcome>();

/**
 * Copies the v2 history of the card printed `number` to `wallet`'s copy, with its v2 `pin` (null:
 * none given), unless a majority of the relays holds one already (or one of a newer format). One
 * copy of a card at a time: asked meanwhile, it is that one's outcome ("History" asks a PIN
 * only once its copy without one ended). `keepNumber`: the card's number is kept on the
 * relays first, when they hold no copy (the migration's end, startMigratedCardHistory). Never
 * rejects: a failure goes to the journal and says `failed`.
 */
export function copyCardLegacyHistory(
  access: CardAccess,
  wallet: CardWalletOf,
  number: string,
  pin: string | null,
  options: { keepNumber?: boolean } = {}
): Promise<LegacyCopyOutcome> {
  const key = walletKey(access.walletId, wallet);
  const known = running.get(key);
  if (known) return known;
  const copy = copyNow(access, wallet, number, pin, options)
    .then((outcome) => {
      outcomes.set(key, outcome);
      return outcome;
    })
    .finally(() => {
      running.delete(key);
    });
  running.set(key, copy);
  return copy;
}

/**
 * Where `wallet`'s copy stands this run of the app, for "History": the copy running (its
 * outcome to come), else how the last one ended, else null (none tried yet).
 */
export function legacyCopyState(
  access: CardAccess,
  wallet: CardWalletOf
): Promise<LegacyCopyOutcome> | LegacyCopyOutcome | null {
  const key = walletKey(access.walletId, wallet);
  return running.get(key) ?? outcomes.get(key) ?? null;
}

async function copyNow(
  access: CardAccess,
  wallet: CardWalletOf,
  number: string,
  pin: string | null,
  { keepNumber = false }: { keepNumber?: boolean }
): Promise<LegacyCopyOutcome> {
  const keys = deriveLegacyHistoryKeys(access.root);
  try {
    const relays = currentRelays();
    const read = await readAll(keys, relays);
    if (!read.conclusive) {
      logFailure("Copying a card's v2 history failed: no majority of the relays answered");
      return "failed";
    }
    const held = legacyCopyOf(keys, wallet, read.answers.parts, read.answers.newer);
    // Copied already, here or elsewhere; a newer app's copy is never written over.
    if (held.copied || held.newer) return "copied";
    if (keepNumber) {
      // Its number kept first (LegacyCardNumber): the copy can be made later from there, its PIN
      // asked, whatever its issuer visual. Written over nothing the relays hold.
      const address = legacyNumberAddress(keys, wallet);
      if (!read.answers.numbers.has(address) && !read.answers.newer.has(address)) {
        const event = legacyNumberEvent(keys, { ...wallet, number }, nowUnix());
        if (!(await publishAll(keys, [event], relays))) {
          logFailure("Keeping a v2 card's number failed: no majority of the relays took it");
        }
      }
    }
    let rows: LegacyCardRow[];
    try {
      const history = await fetchLegacyCardHistory(number, pin);
      // Left out, never guessed: support sees that some were (the code's text, never values).
      if (history.invalid > 0) logFailure("The v2 card history had rows out of shape, left out");
      rows = history.rows;
    } catch (error) {
      const outcome = outcomeOf(error);
      // A PIN to give, a wrong one, too many: the holder's, not a failure of the app's.
      if (outcome === "failed" || outcome === "unknownCard") {
        logFailure("Reading a card's v2 history failed", error);
      }
      return outcome;
    }
    const currency = getAccountSettings()?.displayCurrency;
    if (currency && rows.length > 0) rows = await withValues(rows, currency);
    const now = nowUnix();
    const signed = new Map<string, number>();
    const events = legacyCopyParts(wallet, rows).map((part) => {
      const address = legacyPartAddress(keys, wallet, part.part);
      const after = read.answers.events.get(address)?.created_at ?? -1;
      return legacyPartEvent(keys, part, signedAt(signed, address, Math.max(now, after + 1)));
    });
    if (!(await publishAll(keys, events, relays))) {
      logFailure("Copying a card's v2 history failed: no majority of the relays took it");
      return "failed";
    }
    return "copied";
  } catch (error) {
    logFailure("Copying a card's v2 history failed", error);
    return "failed";
  } finally {
    wipeLegacyHistoryKeys(keys);
  }
}

/**
 * As a v2 card's migration ends (its card now `wallet`, printed `number`): its number kept on the
 * relays, then its history copied without a PIN, in the background. Never rejects.
 */
export async function startMigratedCardHistory(
  wallet: CardWalletOf,
  number: string
): Promise<LegacyCopyOutcome> {
  try {
    return await withCardAccess((access) =>
      copyCardLegacyHistory(access, wallet, number, null, { keepNumber: true })
    );
  } catch (error) {
    // No account open, or it closed meanwhile.
    logFailure("Copying a migrated card's v2 history failed", error);
    return "failed";
  }
}

/** For the tests: a new run of the app. */
export function resetLegacyCardHistory(): void {
  outcomes.clear();
  running.clear();
}

/**
 * Erases what the account's relays hold of the v2 copies and numbers of the cards' wallets
 * `isErased` says are erased (card-erasure.ts): each record found once a majority of `relays`
 * answered whole, named in a deletion request signed by its author, by id and by address. Whether
 * every request is on a majority of the relays (none to make: true). Never rejects.
 */
export async function eraseLegacyCopies(
  access: CardAccess,
  isErased: (wallet: CardWalletOf) => boolean,
  relays: readonly string[],
  now: number
): Promise<boolean> {
  const keys = deriveLegacyHistoryKeys(access.root);
  try {
    const read = await readAll(keys, relays);
    if (!read.conclusive) return false;
    const events = [
      ...[...read.answers.parts.values()].flatMap(({ part, event }) =>
        isErased(part) ? [event] : []
      ),
      ...[...read.answers.numbers.values()].flatMap(({ number, event }) =>
        isErased(number) ? [event] : []
      )
    ];
    if (events.length === 0) return true;
    const call = callOf(keys, relays);
    const quorum = majority(relays.length);
    const taken = await Promise.all(
      deletionRequests(keys.nostr.secretKey, events, now).map((request) =>
        publishToRelays(request, call, { quorum: "majority" })
      )
    );
    return taken.every((took) => took.length >= quorum);
  } catch (error) {
    logFailure("Erasing a deleted card's v2 history failed", error);
    return false;
  } finally {
    wipeLegacyHistoryKeys(keys);
  }
}

/**
 * The v2 copies and numbers the relays `before` hold, of the cards' wallets not erased
 * (`erased`: erasedGenerations), copied as they are to a majority of `next`, for a change of the
 * account's relays before it is saved: nothing else keeps them once the v2 service ends. Signed
 * again first when over LEGACY_REFRESH_SECONDS old (a relay refuses an event over 3 years old).
 * Whether a majority of `before` answered whole and a majority of `next` took each one. Never
 * rejects.
 */
export async function copyLegacyCopies(
  access: CardAccess,
  erased: ReadonlyMap<string, number>,
  before: readonly string[],
  next: readonly string[],
  now: number = nowUnix()
): Promise<boolean> {
  const keys = deriveLegacyHistoryKeys(access.root);
  try {
    const read = await readAll(keys, before);
    if (!read.conclusive) return false;
    const signed = new Map<string, number>();
    const fresh = (address: string, event: NostrEvent, again: (at: number) => NostrEvent) =>
      now - event.created_at > LEGACY_REFRESH_SECONDS
        ? again(signedAt(signed, address, Math.max(now, event.created_at + 1)))
        : event;
    const events: NostrEvent[] = [];
    for (const [address, { part, event }] of read.answers.parts) {
      if (isErasedData(part, erased)) continue;
      events.push(fresh(address, event, (at) => legacyPartEvent(keys, part, at)));
    }
    for (const [address, { number, event }] of read.answers.numbers) {
      if (isErasedData(number, erased)) continue;
      events.push(fresh(address, event, (at) => legacyNumberEvent(keys, number, at)));
    }
    // A newer app's records go as they are: never read, never lost.
    for (const address of read.answers.newer) {
      const event = read.answers.events.get(address);
      if (event) events.push(event);
    }
    return await publishToMajority(events, next, keys.nostr.secretKey);
  } catch (error) {
    logFailure("Copying the cards' v2 history to the new relays failed", error);
    return false;
  } finally {
    wipeLegacyHistoryKeys(keys);
  }
}
