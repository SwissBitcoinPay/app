import {
  DEFAULT_CARD_DAY_SATS,
  DEFAULT_CARD_PAYMENT_SATS,
  DEFAULT_CARD_PAYMENTS_PER_HOUR
} from "@/config/card";
import { majority } from "@/config/registry";
import {
  erasedGenerations,
  erasedThrough,
  isErasedData,
  lookImagesOf,
  type CardState
} from "@/lib/card/card-record";
import {
  deriveMonthPartKeys,
  monthCopyOf,
  monthPartAddresses,
  wipeMonthPartKeys
} from "@/lib/card/history-months";
import {
  cardHistoryEvents,
  deriveHistoryRecordKeys,
  historyFilter,
  wipeHistoryRecordKeys
} from "@/lib/card/history-records";
import { FIRST_CARD_WALLET_GENERATION, type CardWalletOf } from "@/lib/card/keys";
import {
  cardPayeeEvents,
  derivePayeeRecordKeys,
  payeeModeAddress,
  payeesFilter,
  wipePayeeRecordKeys
} from "@/lib/card/payee-records";
import { updatePayeeBooks } from "@/lib/card/payees";
import { forgetCardPayments } from "@/lib/card/payment-log";
import { logFailure } from "@/lib/log/log";
import { IMAGE_TIMEOUT_MS, imageAuthor, imageFilter, type ImageRef } from "@/lib/media/image";
import { DELETION_KIND, deletionRequests, eventAddress } from "@/lib/nostr/deletion";
import { isValidEvent, type NostrEvent } from "@/lib/nostr/event";
import { publishToRelays, queryRelays, queryRelaysPaged, type RelayCall } from "@/lib/nostr/pool";
import { RECORD_KIND } from "@/lib/nostr/record";
import { nowUnix } from "@/lib/rates/snapshot";
import { currentRelays } from "@/lib/relays/current";

import { queryMonthParts } from "./history-copies";
import { eraseLegacyCopies } from "./legacy-history";
import { eraseOwnCopies } from "./own-copies";
import { CARD_RECORD_TIMEOUT_MS, recordCardState, type CardAccess } from "./states";

/*
 * What a deleted card leaves nowhere ("Delete" erases all its data: its name and settings, approved
 * merchants included, its history, its Lightning address). Its record stays, a trace no screen
 * shows (card-record.ts,
 * "deleted"): its keys' version kept so that the card, found again, never takes the keys of its
 * earlier taps back, and its wallet's generation so that it then pays from a new wallet, whose data
 * are its own (keys.ts, CardWalletOf). The rest goes, of each wallet a card's state says is erased
 * (erasedThrough: the deleted card's, and a card's earlier ones once it was added again):
 * - on each device: its payments in the phone's log, its book of merchants (its push mark goes
 *   with its channel, once the relay deleted it: manage.ts, sync.ts);
 * - on the account's relays, by deletion requests (NIP-09, src/lib/nostr/deletion.ts) each signed
 *   by its records' author, naming each record by id and by address: its payments, its movements,
 *   the heads and parts of its months' copies (history-records.ts, history-months.ts; the copies
 *   they replaced went as they were, history-copies.ts), the copy of its v2 history and its v2
 * number (legacy-history.ts), its mode and its merchants (payee-records.ts); and the deleted card's
 * settings: the image of its look, then its record written again without them. Its issuer's visual
 * stays: printed on the card, not its holder's, it is the card's own, found again when the card is
 * added again (keptSettings, pairing.ts); "Delete account" erases it with the rest.
 * Every device does it for what it knows erased, at each sync of its cards (sync.ts; the web app as
 * "Cards" opens, useCards.ts): its own data first, before anything of it could be published
 * again, then, once a majority of the relays gave the cards, the relays' until a majority of them
 * took every request, once a session (a device that did not know of the deletion may have
 * published some since: a payment, a merchant approved, a setting changed), and the settings
 * whenever a copy holds some again. Never data of a wallet in use: a device that knows an older
 * copy of a card erases less (erasedThrough), and the deleted card's settings only while a
 * majority's copy says it is deleted.
 */

/**
 * A deleted card's settings: none of its holder's (pairing.ts gives a card added again the same).
 * Its issuer's visual is not its holder's: it stays.
 */
const ERASED_SETTINGS = {
  name: "",
  look: null,
  maxPaymentSats: DEFAULT_CARD_PAYMENT_SATS,
  maxDaySats: DEFAULT_CARD_DAY_SATS,
  maxPaymentsPerHour: DEFAULT_CARD_PAYMENTS_PER_HOUR,
  suspended: false
} as const satisfies Partial<CardState>;

/** Whether `state` holds none of its holder's settings any more (ERASED_SETTINGS). */
export function holdsErasedSettings(state: CardState): boolean {
  return (
    state.name === ERASED_SETTINGS.name &&
    state.look === ERASED_SETTINGS.look &&
    state.maxPaymentSats === ERASED_SETTINGS.maxPaymentSats &&
    state.maxDaySats === ERASED_SETTINGS.maxDaySats &&
    state.maxPaymentsPerHour === ERASED_SETTINGS.maxPaymentsPerHour &&
    state.suspended === ERASED_SETTINGS.suspended
  );
}

/**
 * Publishes the deletion requests of `events` and `addresses`, signed by `secretKey`, to the
 * relays of `call`: whether a majority of them took every one (the others take them in the
 * background, while the app runs).
 */
async function requestDeletion(
  secretKey: Uint8Array,
  events: readonly NostrEvent[],
  addresses: readonly string[],
  call: RelayCall,
  now: number
): Promise<boolean> {
  const quorum = majority(call.relays.length);
  const taken = await Promise.all(
    deletionRequests(secretKey, events, now, addresses).map((request) =>
      publishToRelays(request, call, { quorum: "majority" })
    )
  );
  return taken.every((relays) => relays.length >= quorum);
}

/**
 * Erases the images `images` names from the account's relays: each record read as its author from a
 * majority of them, then named by id and by address in a request it signs. Whether a majority took
 * every request (false: a majority did not answer, or take one). Never rejects.
 */
async function eraseImages(images: readonly ImageRef[], now: number): Promise<boolean> {
  const relays = currentRelays();
  const quorum = majority(relays.length);
  const erased = await Promise.all(
    images.map(async (ref) => {
      const author = imageAuthor(ref);
      const filter = imageFilter(ref);
      const call: RelayCall = {
        relays,
        channel: "account",
        timeoutMs: IMAGE_TIMEOUT_MS,
        authKey: author.secretKey
      };
      try {
        const answers = await queryRelays(filter, call, { quorum: "majority" });
        if (answers.size < quorum) return false;
        const events = [...answers.values()]
          .flat()
          .filter(
            (value): value is NostrEvent =>
              isValidEvent(value) &&
              value.pubkey === author.publicKey &&
              value.kind !== DELETION_KIND
          );
        const addresses = (filter["#d"] ?? []).map((d) =>
          eventAddress(RECORD_KIND, author.publicKey, d)
        );
        return await requestDeletion(author.secretKey, events, addresses, call, now);
      } catch (error) {
        logFailure("Erasing a deleted card's image failed", error);
        return false;
      }
    })
  );
  return erased.every(Boolean);
}

/**
 * Erases the settings the deleted card `state` still holds: the image of its look first
 * (lookImagesOf: its reference goes with the settings, nothing would find it again), then its
 * record written again without them (ERASED_SETTINGS), its issuer's visual kept, dated just after
 * the settings it holds: over them, never over settings changed since (the card added again elsewhere meanwhile has settings of its own; ones a
 * device not told of the deletion changed are erased at the next sync). Whether its record holds
 * none of them on a majority of the relays. Never rejects.
 */
async function eraseSettings(access: CardAccess, state: CardState, now: number): Promise<boolean> {
  if (holdsErasedSettings(state)) return true;
  try {
    const images = lookImagesOf(state);
    if (images.length > 0 && !(await eraseImages(images, now))) return false;
    const { updatedAt: _updatedAt, ...kept } = state;
    const { state: written, published } = await recordCardState(access, {
      ...kept,
      ...ERASED_SETTINGS,
      settingsAt: state.settingsAt + 1
    });
    return published && holdsErasedSettings(written);
  } catch (error) {
    logFailure("Erasing a deleted card's settings failed", error);
    return false;
  }
}

/**
 * Erases what the account's relays hold of the history and books of the cards' wallets `erased`
 * says are erased (erasedGenerations): each record found once a majority of them answered whole,
 * their months' parts by the heads naming them, named in a deletion request signed by its author,
 * by id and by address (a request deletes an address's every copy up to its date), their modes'
 * addresses too. Resolves with whether every request is on a majority of the relays: false,
 * nothing proven (no majority answered, or took them), to try again. Never rejects.
 */
export async function eraseCardRecords(
  access: CardAccess,
  erased: ReadonlyMap<string, number>,
  now: number = nowUnix()
): Promise<boolean> {
  const relays = currentRelays();
  const quorum = majority(relays.length);
  const history = deriveHistoryRecordKeys(access.root);
  const parts = deriveMonthPartKeys(access.root);
  const payees = derivePayeeRecordKeys(access.root);
  const callAs = (secretKey: Uint8Array): RelayCall => ({
    relays,
    channel: "account",
    timeoutMs: CARD_RECORD_TIMEOUT_MS,
    authKey: secretKey
  });
  try {
    const [historyAnswers, payeeAnswers] = await Promise.all([
      queryRelaysPaged(historyFilter(history), callAs(history.nostr.secretKey), {
        whole: true,
        quorum: "majority"
      }),
      queryRelaysPaged(payeesFilter(payees), callAs(payees.nostr.secretKey), {
        whole: true,
        quorum: "majority"
      })
    ]);
    if (historyAnswers.size < quorum || payeeAnswers.size < quorum) return false;
    const isErased = (wallet: CardWalletOf) => isErasedData(wallet, erased);
    const found = cardHistoryEvents(history, historyAnswers, isErased);
    const { heads } = found;
    // Their months' parts, read by address as every reader does: a majority's answers to each read.
    const partAnswers =
      heads.length > 0 ? await queryMonthParts(parts, heads, relays) : new Map<string, unknown[]>();
    if (partAnswers === null) return false;
    const partEvents = heads.flatMap((head) => monthCopyOf(parts, head, partAnswers).events);
    const partAddresses = heads.flatMap((head) =>
      monthPartAddresses(parts, head).map((d) =>
        eventAddress(RECORD_KIND, parts.nostr.publicKey, d)
      )
    );
    // Each erased wallet's mode, read or not: one relay may hold it without having answered.
    const modeAddresses = [...erased].flatMap(([cardId, through]) =>
      Array.from({ length: through }, (_, index) =>
        eventAddress(
          RECORD_KIND,
          payees.nostr.publicKey,
          payeeModeAddress(payees, {
            cardId,
            walletGeneration: FIRST_CARD_WALLET_GENERATION + index
          })
        )
      )
    );
    const taken = await Promise.all([
      requestDeletion(
        history.nostr.secretKey,
        found.events,
        [],
        callAs(history.nostr.secretKey),
        now
      ),
      requestDeletion(
        parts.nostr.secretKey,
        partEvents,
        partAddresses,
        callAs(parts.nostr.secretKey),
        now
      ),
      requestDeletion(
        payees.nostr.secretKey,
        cardPayeeEvents(payees, payeeAnswers, isErased),
        modeAddresses,
        callAs(payees.nostr.secretKey),
        now
      ),
      // Each erased wallet's v2 history and number (legacy-history.ts).
      eraseLegacyCopies(access, isErased, relays, now),
      // Each erased wallet's own copies (own-copies.ts), which its pass read.
      eraseOwnCopies(
        access,
        [...erased].flatMap(([cardId, through]) =>
          Array.from({ length: through }, (_, index) => ({
            cardId,
            walletGeneration: FIRST_CARD_WALLET_GENERATION + index
          }))
        ),
        now
      )
    ]);
    return taken.every(Boolean);
  } catch (error) {
    logFailure("Erasing a deleted card's records failed", error);
    return false;
  } finally {
    wipeHistoryRecordKeys(history);
    wipeMonthPartKeys(parts);
    wipePayeeRecordKeys(payees);
  }
}

/**
 * Forgets on this device what it keeps of the cards' wallets `erased` says are erased
 * (erasedGenerations) of the account `walletId`: their payments in the phone's log, their books of
 * approved merchants. Rejects with the log's or the books' error (a newer app wrote them): nothing
 * of theirs is written then.
 */
export async function forgetCardsOnDevice(
  walletId: string,
  erased: ReadonlyMap<string, number>
): Promise<void> {
  if (erased.size === 0) return;
  await forgetCardPayments(erased);
  await updatePayeeBooks(walletId, (books) => {
    const kept = new Map([...books.books].filter(([, book]) => !isErasedData(book, erased)));
    return kept.size === books.books.size ? null : { ...books, books: kept };
  });
}

/**
 * The cards' wallets whose data this session saw erased from the relays:
 * `<account's wallet id>/<card id>/<erasedThrough>`.
 */
const done = new Set<string>();

function erasureKey(access: CardAccess, state: CardState): string {
  return `${access.walletId.toLowerCase()}/${state.cardId}/${erasedThrough(state)}`;
}

/**
 * Erases what the relays hold of the wallets the cards' states `states` say are erased: the
 * deleted cards' settings first, then their history and books. Whether all of it is proven gone
 * (each request on a majority of the relays), kept for the session. Never rejects.
 */
async function eraseOnRelays(access: CardAccess, states: readonly CardState[]): Promise<boolean> {
  const now = nowUnix();
  const settings: boolean[] = [];
  // One after the other: each writes its card's record.
  for (const state of states) {
    settings.push(state.status === "deleted" ? await eraseSettings(access, state, now) : true);
  }
  const records = await eraseCardRecords(access, erasedGenerations(states), now);
  if (records) {
    states.forEach((state, index) => {
      if (settings[index]) done.add(erasureKey(access, state));
    });
  }
  return records && settings.every(Boolean);
}

/**
 * Right after the card `state` was recorded deleted (manage.ts): its data erased, on this device and
 * on the relays. Resolves with whether all of it is proven gone; what is not is done again at the
 * next syncs (eraseCardLeftoversOnRelays). Never rejects.
 */
export async function finishCardDeletion(access: CardAccess, state: CardState): Promise<boolean> {
  let device = true;
  try {
    await forgetCardsOnDevice(access.walletId, erasedGenerations([state]));
  } catch (error) {
    logFailure("Forgetting a deleted card on this device failed", error);
    device = false;
  }
  const relays = await eraseOnRelays(access, [state]);
  return device && relays;
}

/**
 * At a sync of the cards (sync.ts; on the web app, as "Cards" opens: useCards.ts), before
 * anything of theirs is published: forgets on this device what it keeps of the wallets the cards'
 * `states` say are erased (erasedThrough). Never rejects: a failure is tried again at the next sync.
 */
export async function forgetErasedCards(
  access: CardAccess,
  states: readonly CardState[]
): Promise<void> {
  const erased = erasedGenerations(states);
  if (erased.size === 0) return;
  try {
    await forgetCardsOnDevice(access.walletId, erased);
  } catch (error) {
    logFailure("Forgetting a deleted card on this device failed", error);
  }
}

/**
 * Then, when a majority of the relays gave the cards' `states` (`conclusive`: a card added again
 * elsewhere is known by then), erases what the relays still hold of the wallets they say are
 * erased, once this session (a deletion request stays on the relays for good, a copy published
 * later is refused there), and a deleted card's settings whenever a copy holds some again. Beside
 * the rest of a sync, never before it (a relay down would hold the cards in service until its
 * timeouts): nothing of those wallets is published again once forgotten on this
 * device (forgetErasedCards), the books and copies leave them out. Never rejects: a failure is tried
 * again at the next sync.
 */
export async function eraseCardLeftoversOnRelays(
  access: CardAccess,
  states: readonly CardState[],
  conclusive: boolean
): Promise<void> {
  if (!conclusive) return;
  const pending = states.filter(
    (state) =>
      erasedThrough(state) > 0 &&
      (!done.has(erasureKey(access, state)) ||
        (state.status === "deleted" && !holdsErasedSettings(state)))
  );
  if (pending.length > 0) await eraseOnRelays(access, pending);
}

/** Forgets the erasures this session saw (tests). */
export function resetCardErasures(): void {
  done.clear();
}
