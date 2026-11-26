import { CARD_RECORD_TIMEOUT_MS } from "@/config/card";
import { majority } from "@/config/registry";
import {
  addsToCardState,
  cardRecordAddress,
  cardStateEvent,
  mergeCardStates,
  type CardState
} from "@/lib/card/card-record";
import {
  cardOwnAuthKeys,
  cardOwnCopiesOf,
  cardOwnFilter,
  cardOwnKeys,
  cardOwnSecret,
  wipeCardOwnKeys,
  type CardOwnKeys,
  type CardOwnRead
} from "@/lib/card/card-own";
import type { CardPass } from "@/lib/card/card-pass";
import { sameCardWallet, type CardWalletOf } from "@/lib/card/keys";
import { PAYEE_MODE_KEY, mergeRemotePayees, type PayeeBook } from "@/lib/card/payee-book";
import { payeeEvent, payeeModeAddress, payeeModeEvent } from "@/lib/card/payee-records";
import { logFailure } from "@/lib/log/log";
import { DELETION_KIND, deletionRequests, eventAddress } from "@/lib/nostr/deletion";
import { isValidEvent, type NostrEvent } from "@/lib/nostr/event";
import { RECORD_KIND } from "@/lib/nostr/record";
import {
  COPIES_AT_ONCE,
  publishAgainToQuorum,
  publishToRelays,
  queryRelaysPaged,
  type RelayCall
} from "@/lib/nostr/pool";
import { currentRelays } from "@/lib/relays/current";

import type { CardAccess } from "./states";

/*
 * Each card's own copies of its state and of its wallet's book (src/lib/card/card-own.ts), on the
 * account's relays: what a phone keeping the card's pass reads before paying it with the app closed
 * (payment.ts), in place of the account's records, which the pass cannot read. Written with the
 * card root wherever the account's copies are, before them (states.ts, payees-sync.ts: the phone
 * and the web app; what the account shows as made, the card's copy already holds), and filled in at
 * each card sync for the cards this phone keeps a pass of (card-passes.ts: a write of them that
 * failed).
 *
 * Each write merges what the relays hold of the copy first, dated after it (a relay keeps the
 * newest copy of an address): a decision never goes, whichever device wrote last. A copy of a
 * newer format is never written over.
 */

function callOf(keys: CardOwnKeys, timeoutMs: number = CARD_RECORD_TIMEOUT_MS): RelayCall {
  return {
    relays: currentRelays(),
    channel: "account",
    timeoutMs,
    authKey: cardOwnAuthKeys(keys)
  };
}

/**
 * Publishes `events`, COPIES_AT_ONCE at a time: whether a majority of the relays took each, or
 * holds a newer copy at its address (publishAgainToQuorum: another device's write of the same merge
 * has another id, which a relay holding it refuses half of the time). A relay that does not answer
 * costs no wait once a majority took an event.
 */
async function publishAll(events: readonly NostrEvent[], call: RelayCall): Promise<boolean> {
  const quorum = majority(call.relays.length);
  let all = true;
  for (let start = 0; start < events.length; start += COPIES_AT_ONCE) {
    const taken = await Promise.all(
      events
        .slice(start, start + COPIES_AT_ONCE)
        .map((event) => publishAgainToQuorum(event, call, quorum))
    );
    if (!taken.every(Boolean)) all = false;
  }
  return all;
}

/**
 * Brings the own copies of the card's wallet `wallet` up to `state` (that wallet's) and `book`, as
 * this device knows them with the account's keys: what the copies lack, merged over them and dated
 * after them, published to a majority of the relays. Whether they now hold it all (nothing to
 * write counts; a copy of a newer format, which is never written over, counts too: trying again
 * would change nothing). Never rejects.
 */
export async function syncOwnCopies(
  access: CardAccess,
  wallet: CardWalletOf,
  { state, book }: { state?: CardState; book?: PayeeBook }
): Promise<boolean> {
  let keys: CardOwnKeys | null = null;
  try {
    if ((state && !sameCardWallet(state, wallet)) || (book && !sameCardWallet(book, wallet))) {
      throw new Error("Another card's wallet");
    }
    const own = cardOwnSecret(access.root, wallet);
    try {
      keys = cardOwnKeys(own);
    } finally {
      own.fill(0);
    }
    const call = callOf(keys);
    const quorum = majority(call.relays.length);
    const answers = await queryRelaysPaged(cardOwnFilter(keys), call, {
      whole: true,
      quorum: "majority"
    });
    const read = cardOwnCopiesOf(keys, wallet, answers, { root: access.root });
    // A newer app's copy: never written over (it decides), as the account's records of a newer
    // format are not (states.ts). Not a failure to try again: the state or the book waiting for it
    // would be published again at every refresh, dated later each time.
    if (read.newer) return true;
    const events: NostrEvent[] = [];
    const theirs = read.state;
    if (state && (!theirs || addsToCardState(theirs, state))) {
      const merged = theirs ? mergeCardStates(theirs, state) : state;
      events.push(
        cardStateEvent(keys.state, {
          ...merged,
          updatedAt: theirs ? Math.max(merged.updatedAt, theirs.updatedAt + 1) : merged.updatedAt
        })
      );
    }
    if (book) {
      // What the copies lack, dated after them (mergeRemotePayees); an entry none of them sent,
      // only when a majority answered (any two majorities share a relay).
      const merged = mergeRemotePayees({ ...book, unpublished: new Set() }, read.payees, {
        conclusive: read.answered >= quorum
      });
      for (const key of merged.unpublished) {
        if (key === PAYEE_MODE_KEY) {
          events.push(payeeModeEvent(keys.payees, merged.mode));
        } else {
          const entry = merged.payees.get(key);
          if (entry) events.push(payeeEvent(keys.payees, entry));
        }
      }
    }
    if (events.length === 0) return read.answered >= quorum;
    return await publishAll(events, call);
  } catch (error) {
    logFailure("Writing a card's own copies failed", error);
    return false;
  } finally {
    if (keys) wipeCardOwnKeys(keys);
  }
}

/** The own copies a payment with the app closed read, and whether they are a majority's. */
export type OwnCopiesRead = CardOwnRead & {
  /**
   * A majority of the relays answered whole: they hold every decision a majority took (each write
   * reaches one, publishAll), a pause made on the web app included (any two majorities share one).
   */
  conclusive: boolean;
};

/**
 * The own copies of the card of `pass` as the account's relays hold them (a payment with the app
 * closed), each relay waited `timeoutMs` at most; null when none answered. Never rejects.
 */
export async function readOwnCopies(
  pass: CardPass,
  timeoutMs: number = CARD_RECORD_TIMEOUT_MS
): Promise<OwnCopiesRead | null> {
  const keys = cardOwnKeys(pass.ownSecret);
  try {
    const call = callOf(keys, timeoutMs);
    const answers = await queryRelaysPaged(cardOwnFilter(keys), call, {
      whole: true,
      quorum: "majority"
    });
    if (answers.size === 0) return null;
    return {
      ...cardOwnCopiesOf(keys, pass, answers, { uid: pass.uid }),
      conclusive: answers.size >= majority(call.relays.length)
    };
  } catch (error) {
    logFailure("Reading a card's own copies failed", error);
    return null;
  } finally {
    wipeCardOwnKeys(keys);
  }
}

/**
 * Erases the own copies of the cards' wallets `wallets`, each one a card's deletion erased
 * (card-erasure.ts: "Delete" erases all its data): every record of their authors, found once a
 * majority of the relays answered whole, and the addresses of their state and mode, named in
 * deletion requests (NIP-09) each author signs. Whether a majority of the relays took every
 * request: false, nothing proven, to try again. Never rejects.
 */
export async function eraseOwnCopies(
  access: CardAccess,
  wallets: readonly CardWalletOf[],
  now: number
): Promise<boolean> {
  const erased = await Promise.all(
    wallets.map(async (wallet) => {
      const own = cardOwnSecret(access.root, wallet);
      const keys = cardOwnKeys(own);
      own.fill(0);
      try {
        const call = callOf(keys);
        const quorum = majority(call.relays.length);
        const answers = await queryRelaysPaged(cardOwnFilter(keys), call, {
          whole: true,
          quorum: "majority"
        });
        if (answers.size < quorum) return false;
        const events = [...answers.values()]
          .flat()
          .filter(
            (value): value is NostrEvent => isValidEvent(value) && value.kind !== DELETION_KIND
          );
        const authors = [
          { author: keys.state.nostr, d: cardRecordAddress(keys.state, wallet.cardId) },
          { author: keys.payees.nostr, d: payeeModeAddress(keys.payees, wallet) }
        ];
        const taken = await Promise.all(
          authors.flatMap(({ author, d }) =>
            deletionRequests(author.secretKey, events, now, [
              eventAddress(RECORD_KIND, author.publicKey, d)
            ]).map((request) => publishToRelays(request, call, { quorum: "majority" }))
          )
        );
        return taken.every((relays) => relays.length >= quorum);
      } catch (error) {
        logFailure("Erasing a card's own copies failed", error);
        return false;
      } finally {
        wipeCardOwnKeys(keys);
      }
    })
  );
  return erased.every(Boolean);
}
