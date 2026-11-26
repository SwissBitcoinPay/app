import { CARD_RECORD_TIMEOUT_MS } from "@/config/card";
import { getAccountSeed, getAccountWalletId } from "@/features/account/session";
import { majority } from "@/config/registry";
import { walletSecret } from "@/lib/breez/seed";
import type { WalletSeed } from "@/lib/breez/types";
import {
  addsToCardState,
  cardRecordAddress,
  cardStateEvent,
  cardStateValue,
  cardStatesFilter,
  cardImagesOf,
  cardStatesOf,
  deriveCardRecordKeys,
  mergeCardStates,
  parseCardState,
  wipeCardRecordKeys,
  type CardRecordKeys,
  type CardState,
  type CardStatesRead
} from "@/lib/card/card-record";
import {
  cardOrderEvent,
  cardOrderFilter,
  cardOrderOf,
  newerCardOrder,
  orderToSave,
  type CardOrder
} from "@/lib/card/card-order";
import {
  CARD_STATES_KEPT_ON_DEVICE,
  loadStoredCardStates,
  saveStoredCardStates
} from "@/lib/card/card-store";
import { deriveCardRoot, type CardWalletOf } from "@/lib/card/keys";
import {
  extensionTapCounter,
  raiseToExtensionTaps,
  readExtensionTaps
} from "@/lib/card/extension-records";
import type { ImageRef } from "@/lib/media/image";
import { publishToQuorum, queryRelays, type RelayCall } from "@/lib/nostr/pool";
import { NewerRecordError } from "@/lib/nostr/record";
import { currentRelays } from "@/lib/relays/current";

import { syncOwnCopies } from "./own-copies";
import { NoAccountError, TapAlreadySeenError } from "./state-errors";

/*
 * The open account's cards: their states (src/lib/card/card-record.ts) as the device keeps them
 * and as a majority of the account's relays hold them, merged. Written to the device first, then
 * to a majority of the relays; a state the relays did not take is published again at the next
 * refresh. A decision that must not be missed (the keys' version of a card being programmed) waits
 * for a majority of the relays to answer (`conclusive`).
 *
 * A relay keeps one copy of a card's record, the latest (of two as old, the one of the lower id,
 * NIP-01): every copy is published merged with the one the relays hold, and dated after it. Another
 * device's change (a setting changed on the web app) is never written over, only merged into.
 */

export { CARD_RECORD_TIMEOUT_MS };

/** The card root and the records' keys of the open account, for one operation. */
export type CardAccess = { walletId: string; root: Uint8Array; keys: CardRecordKeys };

export { NoAccountError, TapAlreadySeenError };

/**
 * The compare-and-set of a tap's counter: refuses `state` (TapAlreadySeenError) unless its counter
 * is above the one `previous` keeps, for the same keys and wallet. Called where nothing is awaited
 * up to the write: two checks of one tap never both pass.
 */
function checkTapCounter(
  previous: CardState | undefined,
  state: Omit<CardState, "updatedAt">
): void {
  // The last counter the iOS extension took of that card (extension-records.ts), read now: one it
  // took while the app was in the background is not in `previous`. NewerExtensionTapsError.
  const extension = extensionTapCounter(
    readExtensionTaps(),
    state.cardId,
    state.keyVersion,
    state.walletGeneration
  );
  if (extension !== null && extension >= state.lastCounter) throw new TapAlreadySeenError();
  if (!previous) return;
  if (
    previous.keyVersion !== state.keyVersion ||
    previous.walletGeneration !== state.walletGeneration ||
    previous.lastCounter >= state.lastCounter
  ) {
    throw new TapAlreadySeenError();
  }
}

/**
 * Runs `run` with the open account's card keys, derived from its seed for this call and wiped
 * after it (they never outlive the operation, as the seed does not outlive the account).
 */
export async function withCardAccess<T>(run: (access: CardAccess) => Promise<T>): Promise<T> {
  const walletId = getAccountWalletId();
  const seed = getAccountSeed();
  if (!walletId || !seed) throw new NoAccountError();
  return withCardAccessOf(seed, walletId, run);
}

/**
 * As withCardAccess, with the seed a passkey just gave for the wallet of `walletId` (a card
 * payment while the app is locked, payment.ts): the caller has checked that it is this wallet's.
 */
export async function withCardAccessOf<T>(
  seed: WalletSeed,
  walletId: string,
  run: (access: CardAccess) => Promise<T>
): Promise<T> {
  const secret = walletSecret(seed);
  const root = deriveCardRoot(secret);
  secret.fill(0);
  return withRoot(root, walletId, run);
}

/** Runs `run` with `root`'s keys, then wipes them and `root`. */
async function withRoot<T>(
  root: Uint8Array,
  walletId: string,
  run: (access: CardAccess) => Promise<T>
): Promise<T> {
  const keys = deriveCardRecordKeys(root);
  try {
    return await run({ walletId, root, keys });
  } finally {
    root.fill(0);
    wipeCardRecordKeys(keys);
  }
}

type Known = {
  walletId: string;
  states: ReadonlyMap<string, CardState>;
  /** Cards whose latest state is not on a majority of the relays yet. */
  unpublished: ReadonlySet<string>;
  /** Record addresses holding a state of a newer format: never written over. */
  newer: ReadonlySet<string>;
  /**
   * The cards' order (card-order.ts) the relays gave this session or it saved: never kept on the
   * device, read again with the cards.
   */
  order: CardOrder | null;
  /** A relay holds the order in a newer format: never written over. */
  orderNewer: boolean;
};

let known: Known | null = null;
const listeners = new Set<() => void>();
/** knownCardStates' last answer, kept until a change: a snapshot for useSyncExternalStore. */
let snapshot: { walletId: string | null; states: CardState[] } = { walletId: null, states: [] };

function changed(): void {
  snapshot = { walletId: null, states: [] };
  for (const listener of listeners) listener();
}

/** Calls `listener` whenever the known states change; returns the unsubscribe function. */
export function subscribeCardStates(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** knownCardStates without known states: always the same, a snapshot must not change by itself. */
const NONE: CardState[] = [];

/** The states known of `walletId`'s cards (this session's last refresh or write). */
export function knownCardStates(walletId: string | null): CardState[] {
  if (!walletId || known?.walletId !== walletId) return NONE;
  if (snapshot.walletId !== walletId) {
    snapshot = { walletId, states: [...known.states.values()] };
  }
  return snapshot.states;
}

/**
 * The cards' order known of `walletId`'s account (this session's last refresh or save), null when
 * none: the cards keep the order they had before one existed (orderCards).
 */
export function knownCardOrder(walletId: string | null): CardOrder | null {
  return walletId && known?.walletId === walletId ? known.order : null;
}

/** The state known of one of `walletId`'s cards. */
export function knownCardState(walletId: string, cardId: string): CardState | null {
  return known?.walletId === walletId ? (known.states.get(cardId) ?? null) : null;
}

/** Forgets what is known (tests; another account). */
export function resetCardStates(): void {
  known = null;
  changed();
}

function relayCall(keys: CardRecordKeys): RelayCall {
  return {
    relays: currentRelays(),
    channel: "account",
    timeoutMs: CARD_RECORD_TIMEOUT_MS,
    authKey: keys.nostr.secretKey
  };
}

/** What is known of the wallet of `access`: this session's, else the device's copy. */
function loadDevice(access: CardAccess): Promise<Known> {
  return loadDeviceOf(access.walletId, access.root);
}

/**
 * What is known of `walletId`'s cards: this session's, else the device's copy, each state's id
 * checked against its UID with `root` (none: not checked, a payment with a card's pass).
 */
async function loadDeviceOf(walletId: string, root: Uint8Array | null = null): Promise<Known> {
  if (known?.walletId === walletId) return known;
  const stored = await loadStoredCardStates();
  const states = new Map<string, CardState>();
  const unpublished = new Set<string>();
  if (stored?.walletId === walletId) {
    for (const value of stored.states) {
      let state: CardState | null = null;
      try {
        state = parseCardState(value, root);
      } catch {
        // A newer app's copy: the relays tell what it holds.
      }
      if (!state) continue;
      const other = states.get(state.cardId);
      states.set(state.cardId, other ? mergeCardStates(other, state) : state);
    }
    for (const id of stored.unpublished) if (states.has(id)) unpublished.add(id);
    raiseToExtensionTaps(states);
  }
  return {
    walletId,
    states,
    unpublished,
    newer: new Set(),
    order: null,
    orderNewer: false
  };
}

/** Device writes, one at a time, each of what is known then: the last one holds every change. */
let saving: Promise<void> = Promise.resolve();

function saveKnown(): Promise<void> {
  const run = saving.then(async () => {
    const latest = known;
    if (!latest) return;
    await saveStoredCardStates({
      walletId: latest.walletId,
      states: [...latest.states.values()].map(cardStateValue),
      unpublished: [...latest.unpublished]
    });
  });
  saving = run.catch(() => undefined);
  return run;
}

/**
 * Applies `change` to what is known of the wallet of `access` at that very moment (never to an
 * older copy: a tap's counter written meanwhile is never dropped), then keeps it on the device.
 * Resolves with what is known then; rejects with what `change` throws, nothing changed.
 */
async function update(access: CardAccess, change: (current: Known) => Known): Promise<Known> {
  const loaded = await loadDevice(access);
  // Nothing awaited from here to the assignment: no other change comes in between.
  const current = known?.walletId === access.walletId ? known : loaded;
  const next = change(current);
  known = next;
  changed();
  await saveKnown();
  return next;
}

/**
 * As update, for what is never kept on the device (the cards' order): known here only, the
 * device's copy of the states left as it is.
 */
async function note(access: CardAccess, change: (current: Known) => Known): Promise<void> {
  const loaded = await loadDevice(access);
  // Nothing awaited from here to the assignment: no other change comes in between.
  known = change(known?.walletId === access.walletId ? known : loaded);
  changed();
}

/** `state` as the card's, merged with what is known of it, to publish. */
function withState(current: Known, state: CardState): Known {
  const previous = current.states.get(state.cardId);
  return {
    ...current,
    states: new Map(current.states).set(
      state.cardId,
      previous ? mergeCardStates(previous, state) : state
    ),
    unpublished: new Set(current.unpublished).add(state.cardId)
  };
}

/** Taken by a majority of the relays: each card unless written again since (by `updatedAt`). */
function withPublished(current: Known, published: ReadonlyMap<string, number>): Known {
  const unpublished = new Set(current.unpublished);
  for (const [id, updatedAt] of published) {
    if (current.states.get(id)?.updatedAt === updatedAt) unpublished.delete(id);
  }
  return { ...current, unpublished };
}

/**
 * Publishes the card's own copy of `state` (own-copies.ts: what a phone keeping the card's pass
 * reads, a pause or limits changed on the web app included), then `state` to a majority of the
 * relays. The card's copy first: a write cut short never leaves the account's record ahead of
 * what a phone paying with the app closed reads (the account's devices see the state unpublished).
 * Whether both are there: otherwise the state waits for the next refresh, both written again.
 */
async function publish(access: CardAccess, state: CardState): Promise<boolean> {
  // A deleted card's wallet keeps no own copy: its deletion erases them (card-erasure.ts), and its
  // channel is gone (its pass, if a lost phone still holds one, is never woken).
  if (state.status !== "deleted" && !(await syncOwnCopies(access, state, { state }))) return false;
  const call = relayCall(access.keys);
  try {
    await publishToQuorum(cardStateEvent(access.keys, state), call, majority(call.relays.length));
    return true;
  } catch {
    return false;
  }
}

/** `mine` merged with the relays' copy of the card (`theirs`), dated after it. */
function over(theirs: CardState | undefined, mine: CardState): CardState {
  if (!theirs) return mine;
  const merged = mergeCardStates(theirs, mine);
  return { ...merged, updatedAt: Math.max(merged.updatedAt, theirs.updatedAt + 1) };
}

/**
 * The cards' states this device keeps for the wallet of `access` (and this session's writes),
 * without asking the relays: what a payment checks a tap against at once.
 */
export async function cardStatesOnDevice(access: CardAccess): Promise<CardState[]> {
  return [...(await loadDevice(access)).states.values()];
}

/**
 * The cards' states the device keeps for `walletId` (and this session's writes), read without any
 * key (a payment with the app closed, with a card's pass: payment.ts). The device's own copy: each
 * state is checked whole, its id against its UID only once the keys are there (parseCardState).
 */
export async function cardStatesOnDeviceOf(walletId: string): Promise<CardState[]> {
  return [...(await loadDeviceOf(walletId)).states.values()];
}

/**
 * Keeps on the device the new state of one of `walletId`'s cards, without any key (a tap's counter
 * recorded with the app closed, the hashes deposited with a card's pass): merged with what is known
 * of it, dated after its last write, unpublished until the account's next refresh publishes it.
 * Resolves with the state kept. Rejects for a card the device does not keep (none, or a newer
 * app's copy), or when the device could not keep it; with `tap` (a tap's counter), with
 * TapAlreadySeenError unless its counter is above the one kept (checkTapCounter).
 */
export async function recordCardStateOnDevice(
  walletId: string,
  state: Omit<CardState, "updatedAt">,
  now: number = Math.floor(Date.now() / 1000),
  { tap = false }: { tap?: boolean } = {}
): Promise<CardState> {
  const loaded = await loadDeviceOf(walletId);
  // Nothing awaited from here to the assignment: no other change comes in between.
  const current = known?.walletId === walletId ? known : loaded;
  const previous = current.states.get(state.cardId);
  if (!previous) throw new Error("A card this device does not keep");
  if (tap) checkTapCounter(previous, state);
  const next = withState(current, {
    ...state,
    updatedAt: Math.max(now, previous.updatedAt + 1)
  });
  known = next;
  changed();
  await saveKnown();
  return next.states.get(state.cardId)!;
}

/**
 * The relays of the active cards the device keeps for `walletId`, read without the wallet's keys
 * (before a payment's passkey): a wake packet naming another relay is not one of its cards'. Each
 * state is checked whole, but its id against its UID only once the keys are there.
 */
export async function activeCardsOnDevice(
  walletId: string
): Promise<
  { cardId: string; walletGeneration: number; relayHost: string; maxPaymentSats: bigint }[]
> {
  const stored = await loadStoredCardStates();
  if (stored?.walletId !== walletId) return [];
  return stored.states.flatMap((value) => {
    let state: CardState | null = null;
    try {
      state = parseCardState(value, null);
    } catch {
      // A newer app's copy.
    }
    return state?.status === "active"
      ? [
          {
            cardId: state.cardId,
            walletGeneration: state.walletGeneration,
            relayHost: state.relayHost,
            maxPaymentSats: state.maxPaymentSats
          }
        ]
      : [];
  });
}

export type CardStatesRefresh = {
  states: CardState[];
  /** The cards' order the relays hold (or this session saved since), null when none. */
  order: CardOrder | null;
  /** A majority of the relays answered: a card absent from `states` has no record there. */
  conclusive: boolean;
};

/**
 * Reads the account's cards from the relays, merges them into what is known (the device's copy,
 * and what this session wrote meanwhile), keeps the result on the device, and publishes again what
 * the relays lack, over their copy. `timeoutMs`: each relay's time to answer the read. `onRead`
 * hears the cards as soon as they are read and kept, before anything is published again (a card
 * payment decides with them, payment.ts).
 */
export async function refreshCardStates(
  access: CardAccess,
  {
    timeoutMs = CARD_RECORD_TIMEOUT_MS,
    onRead
  }: { timeoutMs?: number; onRead?: (read: CardStatesRefresh) => void } = {}
): Promise<CardStatesRefresh> {
  const call = { ...relayCall(access.keys), timeoutMs };
  const answers = await queryRelays(cardStatesFilter(access.keys), call, { quorum: "majority" });
  const read = cardStatesOf(access.keys, access.root, answers);
  const conclusive = read.answered >= majority(call.relays.length);
  // The order's record is the cards' records' author's: it came with them.
  const orderRead = cardOrderOf(access.keys, answers);
  const merged = await update(access, (current) => {
    const states = new Map(read.states);
    const lacking = new Set(current.unpublished);
    for (const [id, mine] of current.states) {
      const theirs = read.states.get(id);
      if (!theirs || addsToCardState(theirs, mine)) lacking.add(id);
      // What is published again goes over the relays' copy.
      states.set(id, lacking.has(id) ? over(theirs, mine) : mergeCardStates(theirs!, mine));
    }
    return {
      walletId: access.walletId,
      states,
      unpublished: lacking,
      newer: new Set([...current.newer, ...read.newer]),
      order: newerCardOrder(current.order, orderRead.order),
      orderNewer: current.orderNewer || orderRead.newer
    };
  });
  onRead?.({ states: [...merged.states.values()], order: merged.order, conclusive });
  const published = new Map<string, number>();
  for (const id of merged.unpublished) {
    const state = merged.states.get(id)!;
    if (merged.newer.has(cardRecordAddress(access.keys, id))) continue;
    if (await publish(access, state)) published.set(id, state.updatedAt);
  }
  const final =
    published.size > 0
      ? await update(access, (current) => withPublished(current, published))
      : merged;
  return { states: [...final.states.values()], order: final.order, conclusive };
}

/**
 * Whether a relay was found holding the card's record in a newer format (a read or a write saw it):
 * never written over, a newer app decides.
 */
export async function newerCardRecord(access: CardAccess, cardId: string): Promise<boolean> {
  return (await loadDevice(access)).newer.has(cardRecordAddress(access.keys, cardId));
}

/** A card's channel on a card relay: its secret derives from both (channelSecretOf). */
export type CardChannel = { cardId: string; relayHost: string };

/** Every card of the account the relays and this device know (readAllCardIds). */
export type CardIdsRead = {
  cardIds: string[];
  /**
   * Every wallet the cards paid from: each card's generations up to its highest (card-record.ts), a
   * deleted card's earlier ones included, whose sats no screen shows any more.
   */
  wallets: { cardId: string; walletGeneration: number }[];
  /** Each card's relay as the relays and the device say (both, where they differ). */
  channels: CardChannel[];
  /** The images the cards' states name (cardImagesOf), each once. */
  images: ImageRef[];
  /** A majority of the relays answered: a card absent from `cardIds` has no record there. */
  conclusive: boolean;
  /** A relay holds a record of a newer format: a card whose id this app cannot read. */
  newer: boolean;
};

/**
 * Every card of the account the relays and this device know (its copy, this session's writes),
 * reset and deleted ones included, read only: nothing is published nor kept, as "Delete account"
 * needs (refreshCardStates publishes what the relays lack).
 */
export async function readAllCardIds(access: CardAccess): Promise<CardIdsRead> {
  const call = relayCall(access.keys);
  const answers = await queryRelays(cardStatesFilter(access.keys), call, { quorum: "majority" });
  const read = cardStatesOf(access.keys, access.root, answers);
  const states = [...read.states.values(), ...(await loadDevice(access)).states.values()];
  const channels = new Map<string, CardChannel>();
  const images = new Map<string, ImageRef>();
  for (const state of states) {
    channels.set(`${state.cardId} ${state.relayHost}`, {
      cardId: state.cardId,
      relayHost: state.relayHost
    });
    for (const image of cardImagesOf(state)) images.set(`${image.key} ${image.hash}`, image);
  }
  const generations = new Map<string, number>();
  for (const { cardId, walletGeneration } of states) {
    generations.set(cardId, Math.max(generations.get(cardId) ?? 0, walletGeneration));
  }
  return {
    cardIds: [...generations.keys()],
    wallets: [...generations].flatMap(([cardId, highest]) =>
      Array.from({ length: highest }, (_, index) => ({ cardId, walletGeneration: index + 1 }))
    ),
    channels: [...channels.values()],
    images: [...images.values()],
    conclusive: read.answered >= majority(call.relays.length),
    newer: read.newer.size > 0
  };
}

/** The card's record on the relays: its copies merged, whether one is of a newer format. */
async function readCard(access: CardAccess, cardId: string): Promise<CardStatesRead> {
  const filter = {
    ...cardStatesFilter(access.keys),
    "#d": [cardRecordAddress(access.keys, cardId)]
  };
  return cardStatesOf(
    access.keys,
    access.root,
    await queryRelays(filter, relayCall(access.keys), { quorum: "majority" })
  );
}

/**
 * Writes a card's new state: merged with what is known of it (a counter never goes down), dated
 * after its last write, kept on the device (then `onSaved`); then merged with the copy the relays
 * hold now (another device may have written it since this one read it), dated after it, and
 * published to a majority of them. Resolves with the state kept, and whether the relays took it
 * (else it waits for the next refresh). Rejects with NewerRecordError when the card's record is
 * of a newer format; with `tap` (a tap's counter), with TapAlreadySeenError unless its counter is
 * above the one kept (checkTapCounter), nothing written. The web app keeps nothing past the page:
 * there, recordOnRelays.
 */
export async function recordCardState(
  access: CardAccess,
  state: Omit<CardState, "updatedAt">,
  now: number = Math.floor(Date.now() / 1000),
  { onSaved, tap = false }: { onSaved?: (state: CardState) => void; tap?: boolean } = {}
): Promise<{ state: CardState; published: boolean }> {
  if (!CARD_STATES_KEPT_ON_DEVICE) return recordOnRelays(access, state, now, onSaved, tap);
  const address = cardRecordAddress(access.keys, state.cardId);
  const written = await update(access, (current) => {
    if (current.newer.has(address)) throw new NewerRecordError();
    const previous = current.states.get(state.cardId);
    if (tap) checkTapCounter(previous, state);
    return withState(current, {
      ...state,
      updatedAt: Math.max(now, (previous?.updatedAt ?? -1) + 1)
    });
  });
  const kept = written.states.get(state.cardId)!;
  onSaved?.(kept);
  const read = await readCard(access, state.cardId);
  if (read.newer.has(address)) {
    // Never written over: a newer app decides (the next write is refused, the refresh tells).
    await update(access, (current) => ({ ...current, newer: new Set(current.newer).add(address) }));
    return { state: kept, published: false };
  }
  const theirs = read.states.get(state.cardId);
  const final = theirs
    ? (
        await update(access, (current) => {
          const mine = current.states.get(state.cardId) ?? kept;
          return withState(current, over(theirs, mine));
        })
      ).states.get(state.cardId)!
    : kept;
  const published = await publish(access, final);
  if (published) {
    await update(access, (current) =>
      withPublished(current, new Map([[final.cardId, final.updatedAt]]))
    );
  }
  return { state: final, published };
}

/**
 * recordCardState in the web app, which keeps nothing past the page (CARD_STATES_KEPT_ON_DEVICE):
 * the state, merged with what is known and with the relays' copy, is published to a majority of
 * them first, and known (shown, then `onSaved`) only once they took it. A write no majority took
 * is not kept here: never shown as made, nor published again behind its author's back (a page
 * closed at once would lose it while showing it made). The relays that took it keep it: a later
 * read, here or elsewhere, may still find it (manage.ts says so: "notConfirmed").
 */
async function recordOnRelays(
  access: CardAccess,
  state: Omit<CardState, "updatedAt">,
  now: number,
  onSaved: ((state: CardState) => void) | undefined,
  tap = false
): Promise<{ state: CardState; published: boolean }> {
  const address = cardRecordAddress(access.keys, state.cardId);
  const current = await loadDevice(access);
  if (current.newer.has(address)) throw new NewerRecordError();
  const previous = current.states.get(state.cardId);
  if (tap) checkTapCounter(previous, state);
  const mine: CardState = { ...state, updatedAt: Math.max(now, (previous?.updatedAt ?? -1) + 1) };
  const written = previous ? mergeCardStates(previous, mine) : mine;
  const read = await readCard(access, state.cardId);
  if (read.newer.has(address)) {
    // Never written over: a newer app decides (the next write is refused, the refresh tells).
    await update(access, (known) => ({ ...known, newer: new Set(known.newer).add(address) }));
    return { state: written, published: false };
  }
  const final = over(read.states.get(state.cardId), written);
  if (!(await publish(access, final))) return { state: final, published: false };
  const kept = await update(access, (known) =>
    withPublished(withState(known, final), new Map([[final.cardId, final.updatedAt]]))
  );
  const shown = kept.states.get(state.cardId)!;
  onSaved?.(shown);
  return { state: shown, published: true };
}

/**
 * recordCardState for a change that must never stand on this device alone (a card's deletion,
 * manage.ts): published to a majority of the relays first, and kept here only once they took it,
 * as the web app writes every state (recordOnRelays). Resolves with the state and whether they
 * took it; not taken, nothing is kept here (the relays that took it keep it).
 */
export function recordCardStateOnRelays(
  access: CardAccess,
  state: Omit<CardState, "updatedAt">,
  now: number = Math.floor(Date.now() / 1000)
): Promise<{ state: CardState; published: boolean }> {
  return recordOnRelays(access, state, now, undefined);
}

/**
 * recordCardState, resolving as soon as the device keeps the state (a card being programmed waits
 * for that, not for the relays); `published` resolves whether the relays took it. Rejects when the
 * device could not keep it.
 */
export function keepCardState(
  access: CardAccess,
  state: Omit<CardState, "updatedAt">
): Promise<{ state: CardState; published: Promise<boolean> }> {
  return new Promise((resolve, reject) => {
    let saved = false;
    const published = recordCardState(access, state, undefined, {
      onSaved: (kept) => {
        saved = true;
        resolve({ state: kept, published: settled });
      }
    }).then((result) => result.published);
    const settled = published.catch(() => false);
    published.catch((error: unknown) => {
      if (!saved) reject(error);
    });
  });
}

/** Thrown when the cards' order could not be saved: no majority of the relays read or took it. */
export class CardOrderUnsavedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CardOrderUnsavedError";
  }
}

/**
 * Saves the cards' order (card-order.ts): `cards`, first to last, dated after the newest copy a
 * majority of the relays hold (another device's, chosen since this one read it, is replaced: the
 * later choice wins), published to a majority of them, then known here (and shown). Nothing is
 * kept on the device: the next read of the cards reads it again. Rejects with NewerRecordError when
 * a relay holds it in a newer format (never written over), with CardOrderUnsavedError when no
 * majority of the relays answered or took it (nothing changed then).
 */
export async function saveCardOrder(
  access: CardAccess,
  cards: readonly CardWalletOf[],
  now: number = Math.floor(Date.now() / 1000)
): Promise<CardOrder> {
  const call = relayCall(access.keys);
  const current = await loadDevice(access);
  if (current.orderNewer) throw new NewerRecordError();
  const answers = await queryRelays(cardOrderFilter(access.keys), call, { quorum: "majority" });
  if (answers.size < majority(call.relays.length)) {
    throw new CardOrderUnsavedError("No majority of the relays answered");
  }
  const read = cardOrderOf(access.keys, answers);
  if (read.newer) {
    await note(access, (latest) => ({ ...latest, orderNewer: true }));
    throw new NewerRecordError();
  }
  const after = Math.max(read.newestAt ?? -1, current.order?.updatedAt ?? -1);
  const order = orderToSave(cards, now, after < 0 ? null : after);
  try {
    await publishToQuorum(cardOrderEvent(access.keys, order), call, majority(call.relays.length));
  } catch {
    throw new CardOrderUnsavedError("No majority of the relays took the order");
  }
  await note(access, (latest) => ({ ...latest, order: newerCardOrder(latest.order, order) }));
  return order;
}
