import { hexToBytes } from "@noble/hashes/utils.js";
import { Platform } from "react-native";

import {
  CARD_HASHES_AHEAD,
  CARD_WALLET_CHECK_MS,
  MAX_CARD_DAY_SATS,
  MAX_CARD_PAYMENTS_PER_HOUR,
  MAX_CARD_PAYMENT_SATS
} from "@/config/card";
import { confirmAccountPasskey } from "@/features/account/wallet-access";
import { RecoveryCheckOverdueError, openAccountOverdue } from "@/features/recovery-check/overdue";
import { isCardName, isCardShown, type CardLook, type CardState } from "@/lib/card/card-record";
import { CARD_STATES_KEPT_ON_DEVICE } from "@/lib/card/card-store";
import { loadDeviceKey } from "@/lib/card/device-key";
import { tapEntries } from "@/lib/card/hashes";
import { cardIdOf, cardKeysOf, channelSecretOf, wipeCardKeys } from "@/lib/card/keys";
import { canProgramCards, withCardSession, type SessionMessages } from "@/lib/card/nfc-session";
import type { Ntag424 } from "@/lib/card/ntag424";
import { ResetError, programCard, resetCard, shownCardUid } from "@/lib/card/program";
import { forgetPushMark, markPushToken } from "@/lib/card/push-marks";
import {
  RelayError,
  deleteChannel,
  fetchRelayInfo,
  postHashes,
  putChannel
} from "@/lib/card/relay-client";
import { logFailure } from "@/lib/log/log";
import { NewerRecordError } from "@/lib/nostr/record";
import { within } from "@/lib/within";

import { finishCardDeletion } from "./card-erasure";
import {
  cardLightningAddress,
  isEmptyCardWallet,
  leaseCardWallet,
  readCardWalletContents,
  type CardWalletContents,
  type CardWalletOf
} from "./card-wallet";
import { syncCardPasses } from "./card-passes";
import { PairingError, keyVersionFor, toPairingError, type PairingStep } from "./pairing";
import { cardPushToken } from "./push";
import { listenForCards, syncCardChannel, type CardDevice, type ChannelSync } from "./relay-sync";
import {
  NoAccountError,
  keepCardState,
  knownCardState,
  recordCardState,
  recordCardStateOnRelays,
  refreshCardStates,
  withCardAccess,
  type CardAccess
} from "./states";

/*
 * "Cards" (several cards per account, a lost card deleted without it, a relay of the user's
 * choice): what the owner does with a paired card. Each
 * write goes through the card's record (card-record.ts): the device first, then a majority of the
 * account's relays. What touches the card needs it held to the phone (the app on a phone only);
 * its keys are only ever used once the card has shown itself as this one (program.ts).
 */

/** What became of a card's channel on a relay the card leaves. */
export type ChannelRemoval =
  /** Deleted (or the relay had none). */
  | "deleted"
  /** The relay did not answer: the channel stays there, the card no longer reaches it. */
  | "unreachable"
  /**
   * The web app: left to the phone that made it, at its next sync (sync.ts). The card relay
   * answers no browser (sattleme/relay: no CORS, and a channel's calls carry an `Authorization`
   * header, which a browser asks the relay to allow first).
   */
  | "deferred";

function stateOf(states: readonly CardState[], cardId: string): CardState {
  const state = states.find((card) => card.cardId === cardId);
  if (!state) throw new PairingError("failed", new Error("No such card"));
  return state;
}

/** The card's record, read from the relays and the device. */
async function readCard(access: CardAccess, cardId: string): Promise<CardState> {
  return stateOf((await refreshCardStates(access)).states, cardId);
}

/** What a holder sets of a card: merged by when it was set (card-record.ts, settingsAt). */
type CardSettings = Pick<
  CardState,
  "name" | "look" | "maxPaymentSats" | "maxDaySats" | "maxPaymentsPerHour" | "suspended"
>;

/**
 * The card's record written again with `settings` changed now (after the time of those it holds),
 * or its `status`. Where the device keeps nothing (the web app), a write no majority of the
 * relays took is not kept: PairingError "notConfirmed" (the relays that took it keep it, a later
 * read may still find it). Settings are never written to a card "Cards" no longer shows
 * (deleted or reset elsewhere meanwhile: its settings are erased, card-erasure.ts): PairingError
 * "cardGone".
 */
async function writeCard(
  access: CardAccess,
  current: CardState,
  patch: Partial<CardSettings> | Pick<CardState, "status">
): Promise<CardState> {
  const { updatedAt: _updatedAt, ...state } = current;
  const settings = !("status" in patch);
  if (settings && !isCardShown(current)) {
    throw new PairingError("cardGone", new Error('The card is no longer in "Cards"'));
  }
  const { state: written, published } = await recordCardState(access, {
    ...state,
    ...patch,
    settingsAt: settings ? Math.max(Date.now(), current.settingsAt + 1) : current.settingsAt
  });
  if (!published && !CARD_STATES_KEPT_ON_DEVICE) {
    throw new PairingError("notConfirmed", new Error("No majority of the relays took it"));
  }
  return written;
}

/** The changes of the cards' settings asked so far, the last one's end (inTurn). */
let settingsChanges: Promise<unknown> = Promise.resolve();

/**
 * Runs a change of a card's settings once those asked before are over: it reads the card then,
 * never writing over one of them from an older copy. A record's settings merge whole, the latest
 * set winning (card-record.ts, settingsAt): a change read before another was kept would undo it
 * (on the web app, a change is kept only once a majority of the relays took it).
 */
function inTurn<T>(change: () => Promise<T>): Promise<T> {
  const next = settingsChanges.then(change, change);
  settingsChanges = next.catch(() => undefined);
  return next;
}

/** Deletes the card's channel on `relayHost` (its secret derives from the card and the relay). */
export async function removeChannel(
  access: CardAccess,
  cardId: string,
  relayHost: string
): Promise<ChannelRemoval> {
  const secret = channelSecretOf(access.root, cardId, relayHost);
  try {
    await deleteChannel(relayHost, secret);
    return "deleted";
  } catch (error) {
    if (error instanceof RelayError && error.code === "unreachable") return "unreachable";
    throw error;
  } finally {
    secret.fill(0);
  }
}

/**
 * Resets the card held to the phone (resetCard: authenticates only once its tap shows it as this
 * card). A card that is blank already shows no tap: it counts as this one (an earlier reset that
 * ended) only when its UID names this card, the one it gives to its blank key 0 (with Random ID,
 * anticollision gives a random one) or the tag's, else nothing is written anywhere.
 * `beforeChange` runs once the card is shown to be this one, before anything on it changes: as its
 * reset begins, or, blank already, before the caller programs it.
 */
async function resetThisCard(
  access: CardAccess,
  current: CardState,
  { card, tagUid }: { card: Ntag424; tagUid: Uint8Array | null },
  beforeChange?: () => Promise<void>
): Promise<void> {
  const reset = await resetCard(card, {
    root: access.root,
    cardId: current.cardId,
    version: current.keyVersion,
    beforeChange
  });
  if (reset) return;
  const uid = await shownCardUid(card, access.root, tagUid);
  if (!uid || cardIdOf(access.root, uid) !== current.cardId) {
    throw new PairingError("notThisCard", new Error("Another blank card"));
  }
  await beforeChange?.();
}

/** A name for the card, as the user typed it: one line, trimmed, MAX_CARD_NAME_LENGTH at most. */
export function cardNameOf(text: string): string | null {
  const name = text.replace(/\s+/g, " ").trim();
  return isCardName(name) ? name : null;
}

/**
 * "Customize" (the name and the look, one write): what
 * the user changed of them, the card's name as typed (`name`) and its look (`look`), each only when
 * given: what is not given stays as this device knows it now, never written back from an older copy
 * (a rename made elsewhere meanwhile is kept). A card with its issuer's visual keeps it: its look is
 * never set.
 */
export function customizeCard(
  cardId: string,
  { name, look }: { name?: string; look?: CardLook }
): Promise<CardState> {
  const cleaned = name === undefined ? undefined : cardNameOf(name);
  if (cleaned === null) return Promise.reject(new Error("Not a card name"));
  if (cleaned === undefined && look === undefined) {
    return Promise.reject(new Error("Nothing to change"));
  }
  return inTurn(() =>
    run(async (access) => {
      const current = await readCard(access, cardId);
      if (look !== undefined && current.issuer) {
        throw new Error("A card's issuer visual is never replaced");
      }
      return writeCard(access, current, {
        ...(cleaned === undefined ? {} : { name: cleaned }),
        ...(look === undefined ? {} : { look })
      });
    })
  );
}

/** One of a card's limits, by its name in the card's record. */
export type CardLimit = "maxPaymentSats" | "maxDaySats" | "maxPaymentsPerHour";

/** A limit's value: sats (bigint) for the two amounts, a number of payments for the hour. */
export type CardLimitValue<L extends CardLimit> = CardState[L];

/** The highest each limit may be set to (1 BTC per payment and over 24 h, 60 payments an hour). */
export const CARD_LIMIT_MAX: { [L in CardLimit]: CardLimitValue<L> } = {
  maxPaymentSats: MAX_CARD_PAYMENT_SATS,
  maxDaySats: MAX_CARD_DAY_SATS,
  maxPaymentsPerHour: MAX_CARD_PAYMENTS_PER_HOUR
};

/**
 * A limit raised without the open account's passkey confirming it: refused, nothing written. What
 * guards the card's funds, whoever writes: the holder's "Limits" asks the passkey for any change
 * anyway (changeCardLimit).
 */
export class RaisedLimitError extends Error {
  constructor() {
    super("Raising a card's limit needs the passkey");
    this.name = "RaisedLimitError";
  }
}

/**
 * Sets the card's `limit` to `value`: whole sats from 1 to its maximum, or from 1 to
 * MAX_CARD_PAYMENTS_PER_HOUR payments. A raise needs `passkeyConfirmed` (RaisedLimitError
 * otherwise, nothing written): a value above the card's limit as a majority of the relays tells it
 * now, merged with this device's copy; without that read, any change is taken for one (another
 * device may have lowered it meanwhile, and the latest setting wins on every device).
 */
export async function setCardLimit<L extends CardLimit>(
  cardId: string,
  limit: L,
  value: CardLimitValue<L>,
  { passkeyConfirmed = false }: { passkeyConfirmed?: boolean } = {}
): Promise<CardState> {
  const whole = typeof value === "bigint" || Number.isInteger(value);
  if (!whole || value < 1 || value > CARD_LIMIT_MAX[limit]) {
    throw new Error("Limit out of bounds");
  }
  try {
    return await inTurn(() =>
      withCardAccess(async (access) => {
        const { states, conclusive } = await refreshCardStates(access);
        const current = stateOf(states, cardId);
        if (!passkeyConfirmed && (!conclusive || value > current[limit])) {
          throw new RaisedLimitError();
        }
        return writeCard(access, current, { [limit]: value });
      })
    );
  } catch (error) {
    if (error instanceof RaisedLimitError) throw error;
    throw toPairingError(error);
  }
}

/**
 * The holder changes one of the card's limits ("Limits"), raised or lowered, once the open
 * account's passkey confirms it (one rule: never a passkey asked for some changes only). A
 * dismissed prompt rejects with the passkey's `cancelled` (toUnlockFailure gives null), nothing
 * changed; another account's passkey with OtherAccountError. Asked before the relays are read: the
 * change then reads the card once, in its turn.
 */
export async function changeCardLimit<L extends CardLimit>(
  cardId: string,
  limit: L,
  value: CardLimitValue<L>
): Promise<CardState> {
  // Past the check of the 12 words, lowered only (overdue.ts): the
  // passkey confirms the change still, but no raise, which the card's own read refuses as it does
  // without the passkey (RaisedLimitError), and which is told as the check's.
  const overdue = openAccountOverdue();
  await confirmAccountPasskey({ accountWallet: false, payment: false });
  try {
    return await setCardLimit(cardId, limit, value, { passkeyConfirmed: !overdue });
  } catch (error) {
    if (overdue && error instanceof RaisedLimitError) throw new RecoveryCheckOverdueError();
    throw error;
  }
}

/**
 * Suspends the card, or lets it pay again (its holder's switch, contract v2 revised): suspended,
 * it refuses every payment (card-limits.ts) and keeps its channel and keys, unlike a deletion.
 */
export function setCardSuspended(cardId: string, suspended: boolean): Promise<CardState> {
  return inTurn(() =>
    run(async (access) => writeCard(access, await readCard(access, cardId), { suspended }))
  );
}

/**
 * Before a deletion, which takes the card out of sight (useCards.ts): its wallet, once a sync
 * reached the network (readCardWalletContents), must hold no sats, have no payment pending and no
 * deposit to claim (PairingError "walletNotEmpty"), for nothing would show them again; then its
 * Lightning address is given up, for nobody to pay it any more. "walletUnavailable" when the
 * wallet cannot tell or do it within CARD_WALLET_CHECK_MS: the deletion is refused, the card stays
 * in service at its address.
 *
 * `within` stops nothing: the wallet's read goes on past the time limit. So
 * the outcome is settled once, on this JavaScript thread, between what runs on the wallet and the
 * wait for it: a read ending late gives nothing up, and an address given up as the time ran out,
 * or maybe given up by a call that failed, is registered again under the same lease (never under
 * a later one: the card root of `access` is wiped once its operation ends, states.ts). What runs
 * on the address goes in its turn (inAddressTurn): an earlier attempt's, still running, ends first.
 */
async function closeWalletBeforeDeletion(access: CardAccess, card: CardWalletOf): Promise<void> {
  let outcome = "running" as "running" | "givenUp" | "late";
  // Read when it is asked, never narrowed by the type checker: the wait sets it meanwhile.
  const late = () => outcome === "late";
  // The wait's own end: the read's wait for a sync ends with it, never a full CARD_WALLET_CHECK_MS
  // after its lease and its turn, which would hold both past a refusal (and a "Try again").
  const deadline = Date.now() + CARD_WALLET_CHECK_MS;
  const closing = (async (): Promise<CardWalletContents | null> => {
    // Leased at once, under the operation's root: the turn may come once it ended.
    const lease = await leaseCardWallet(access, card);
    try {
      return await inAddressTurn(card, async () => {
        // Its time ran out while an earlier attempt's work on the address ended: nothing read.
        if (late()) return null;
        const read = await readCardWalletContents(lease, deadline - Date.now());
        if (late() || !isEmptyCardWallet(read)) return read;
        try {
          await lease.wallet.deleteLightningAddress(lease.walletId);
        } catch (error) {
          await registerAgain(lease);
          throw error;
        }
        if (late()) await registerAgain(lease);
        else outcome = "givenUp";
        return read;
      });
    } finally {
      await lease.release();
    }
  })();
  let contents: CardWalletContents | null;
  try {
    contents = await within(closing, deadline - Date.now());
  } catch (error) {
    throw error instanceof NoAccountError ? error : new PairingError("walletUnavailable", error);
  }
  // Found empty and its address given up in time: only the lease's release ended late.
  if (contents === null && outcome === "givenUp") return;
  if (contents === null) {
    outcome = "late";
    throw new PairingError("walletUnavailable", new Error("The card's wallet did not answer"));
  }
  if (!isEmptyCardWallet(contents)) {
    throw new PairingError("walletNotEmpty", new Error("The card's wallet is not empty"));
  }
}

/**
 * What runs on each card wallet's Lightning address for a deletion (its read and abandonment, its
 * registration again), by `<card id>/<generation>`, one after the other: past its wait it goes on,
 * and an attempt after it waits for it to end, else an earlier
 * attempt's late registration could follow the abandonment of the one that deleted the card.
 */
const addressTurns = new Map<string, Promise<void>>();

/** Runs `work` once what runs on `card`'s address ended. Its lease is taken before. */
function inAddressTurn<T>(card: CardWalletOf, work: () => Promise<T>): Promise<T> {
  const key = `${card.cardId}/${card.walletGeneration}`;
  const run = (addressTurns.get(key) ?? Promise.resolve()).then(work);
  const turn = run.then(
    () => undefined,
    () => undefined
  );
  addressTurns.set(key, turn);
  void turn.then(() => {
    if (addressTurns.get(key) === turn) addressTurns.delete(key);
  });
  return run;
}

/** The Lightning address of the card's wallet, registered again; never rejects. */
async function registerAgain(lease: Awaited<ReturnType<typeof leaseCardWallet>>): Promise<void> {
  try {
    await cardLightningAddress(lease);
  } catch (error) {
    // "Top up" registers it when it shows it.
    logFailure("Registering a card's Lightning address again failed", error);
  }
}

/**
 * Records the card of `current` deleted on a majority of the relays, then on this device
 * (recordCardStateOnRelays): before a card held to the phone is made blank, and before a deletion
 * without it is said done. Every programming of a card reads a majority of the relays first (any
 * two majorities share one), so that a card made blank, or deleted, is never programmed again from
 * its record in service by a phone that did not know of its deletion: added again, it takes the
 * next wallet (pairing.ts), and "Change relay" refuses it. A card deleted
 * already (here or elsewhere) is recorded so again: its copy might be on this device alone.
 *
 * No majority does not prove that no relay took it (one that did not answer in time may hold it),
 * and a deletion outlasts any copy of its wallet in service (mergeCardStates): sooner or later it
 * applies. So a phone keeps it all the same, published again at each
 * sync until a majority takes it (refreshCardStates), the card paying nothing here from then on:
 * PairingError "deletionPending", the card not made blank (it needs that majority first). The web
 * app keeps nothing on the device: "notConfirmed", the deletion may still apply, or not.
 */
async function recordDeletion(access: CardAccess, current: CardState): Promise<CardState> {
  const { updatedAt: _updatedAt, ...kept } = current;
  const deleted: Omit<CardState, "updatedAt"> = { ...kept, status: "deleted" };
  const onRelays = await recordCardStateOnRelays(access, deleted);
  if (onRelays.published) return onRelays.state;
  if (!CARD_STATES_KEPT_ON_DEVICE) {
    throw new PairingError(
      "notConfirmed",
      new Error("No majority of the relays took the deletion")
    );
  }
  // Kept here, then tried on the relays once more (a newer app's record refuses it, NewerRecordError).
  const onDevice = await recordCardState(access, deleted);
  if (onDevice.published) return onDevice.state;
  throw new PairingError(
    "deletionPending",
    new Error("No majority of the relays took the deletion yet")
  );
}

/**
 * Registers again the Lightning address of the card's wallet `card`, given up before a deletion
 * that did not take place (closeWalletBeforeDeletion): the card stays in service, payable at its
 * address (cardLightningAddress: its usernames tried in turn, the first its own until then). Within
 * CARD_WALLET_CHECK_MS, under the operation's `access`; never rejects: else "Top up" registers it
 * when it shows it.
 */
async function restoreCardAddress(access: CardAccess, card: CardWalletOf): Promise<void> {
  try {
    const done = await within(
      (async () => {
        const lease = await leaseCardWallet(access, card);
        try {
          await inAddressTurn(card, () => registerAgain(lease));
        } finally {
          await lease.release();
        }
        return true;
      })(),
      CARD_WALLET_CHECK_MS
    );
    if (done === null)
      logFailure("Registering a card's Lightning address again did not end in time");
  } catch (error) {
    logFailure("Registering a card's Lightning address again failed", error);
  }
}

/** The steps of "Delete the card" with the card held to the phone. */
export type DeletionStep =
  /** Its record read from a majority of the relays, its wallet checked empty. */
  | "checking"
  /** The NFC session is open: the card is awaited. */
  | "card"
  /** The card shown to be this one, recorded deleted: it is being reset. */
  | "resetting"
  /** The card blank (or deleted without it): its channel and its data go. */
  | "erasing";

export type DeletionOptions = {
  /**
   * "I have the card with me": the card held to the phone, reset to blank. Without it, the card
   * keeps its keys: found again, "Add a card" resets it (pairing.ts).
   */
  inHand?: {
    messages: SessionMessages;
    onStep?: (step: DeletionStep) => void;
    /**
     * Its wallet read empty, its address given up: not for a card whose deletion was recorded
     * already, here or elsewhere (its wallet is not read again then: it may have received sats
     * since, which "Cards" shows, erased-funds.ts).
     */
    onEmptied?: () => void;
    /**
     * Whether the holder cancelled or left meanwhile: checked once the checks are done, before the
     * card is asked for, and by the NFC session (nfc-session.ts) up to the card's first command.
     */
    stopped?: () => boolean;
  };
};

export type CardDeletion = {
  state: CardState;
  channel: ChannelRemoval;
  /**
   * All its data proven erased, on this device and on a majority of the relays
   * (card-erasure.ts): else what is left goes at the next syncs of the account's devices.
   */
  erased: boolean;
};

/**
 * "Delete the card" (all its data erased). Steps, in an order whose every interruption leaves the
 * card deleted or
 * untouched:
 * 1. its record read from a majority of the relays (a programming made elsewhere, missed, would
 *    outlast the deletion), its wallet, synced, checked empty and its Lightning address given up;
 * held to the phone: the card shown to be this one, its record says "deleted" on a majority of the
 * relays, then on this device, before anything on it changes (recordDeletion), then the card is
 * reset to blank; without it: its record says "deleted" so (recordDeletion);
 * 3. its channel deleted (the web app leaves it to the phone that made it, sync.ts), its data
 *    erased on this device and on the relays (card-erasure.ts: what is not proven goes at the next
 *    syncs).
 * From step 2 on it pays nothing and shows nowhere. A card deleted elsewhere meanwhile is reset if
 * held, and its erasure finished.
 */
export function deleteCard(
  cardId: string,
  { inHand }: DeletionOptions = {}
): Promise<CardDeletion> {
  const operation = async (access: CardAccess): Promise<CardDeletion> => {
    inHand?.onStep?.("checking");
    const { states, conclusive } = await refreshCardStates(access);
    if (!conclusive) throw new PairingError("recordsUnreachable");
    const current = stateOf(states, cardId);
    const already = current.status === "deleted";
    // "Cards" deletes the cards it shows; a card being migrated is finished or given up first.
    if (!already && (!isCardShown(current) || current.status === "migrating")) {
      throw new PairingError("failed", new Error('Not a card "Cards" deletes'));
    }
    // Emptied before its deletion elsewhere: its address is given up already.
    if (!already) {
      await closeWalletBeforeDeletion(access, current);
      inHand?.onEmptied?.();
    }
    let state = current;
    // Whether its deletion went to the relays: from then on, it may apply (recordDeletion).
    let sent = false;
    try {
      if (inHand) {
        if (inHand.stopped?.()) throw new PairingError("cancelled");
        inHand.onStep?.("card");
        await withCardSession(
          inHand.messages,
          (held) =>
            resetThisCard(access, current, held, async () => {
              inHand.onStep?.("resetting");
              sent = true;
              state = await recordDeletion(access, current);
            }),
          { stopped: inHand.stopped }
        );
      } else {
        sent = true;
        state = await recordDeletion(access, current);
      }
    } catch (error) {
      // Stopped before (left, another card held, the NFC), or refused by a newer app's record: the
      // card stays in service, its address given up in step 1 back with it. Sent, the deletion
      // applies, here at once or later (recordDeletion).
      if (!already && (!sent || error instanceof NewerRecordError)) {
        await restoreCardAddress(access, current);
      }
      throw error;
    }
    inHand?.onStep?.("erasing");
    let channel: ChannelRemoval = "deferred";
    if (Platform.OS !== "web") {
      channel = await removeChannel(access, cardId, current.relayHost).catch((error: unknown) => {
        // Deleted at the next syncs, its push mark kept (sync.ts): the card pays nothing meanwhile.
        logFailure("Deleting a deleted card's channel failed", error);
        return "unreachable" as const;
      });
      if (channel === "deleted") await forgetPushMark(cardId);
      // A relay no active card uses any more is not listened to (socket.ts).
      await listenForCards(access);
      // Its pass gone with it (card-passes.ts).
      await syncCardPasses(access);
    }
    const erased = await finishCardDeletion(access, state);
    return { state, channel, erased };
  };
  return inHand ? withCard(operation) : run(operation);
}

export type ReprogramOptions = {
  /** The relay to write into the card: its own (new keys only), or another (a relay change). */
  relayHost: string;
  /**
   * A relay change tried again: the relay the card leaves, which an attempt interrupted once the
   * card was recorded at `relayHost` no longer names. Its channel there goes at the end.
   */
  formerRelayHost?: string;
  messages: SessionMessages;
  /** The Android notification channel's name. */
  channelName: string;
  onStep?: (step: PairingStep) => void;
  /**
   * Whether the holder cancelled or left meanwhile: checked once the checks are done, before the
   * card is asked for, and by the NFC session (nfc-session.ts) up to the card's first command.
   */
  stopped?: () => boolean;
};

export type ReprogrammedCard = {
  state: CardState;
  /** The channel on the card's relay: ready, or done again at the next app start. */
  activation: ChannelSync;
  /**
   * The channel on the relay the card left, for a relay change: `refused`, the relay answered
   * but kept it (it stays there, without effect); `unknown`, its answer proved neither.
   */
  previousChannel: ChannelRemoval | "refused" | "unknown" | null;
};

/**
 * Programs the card again, held to the phone, with the next keys' version: on another relay (a
 * relay change, "Advanced settings"), or on the same one (new keys, which no screen asks for).
 * Steps, in an order whose
 * every interruption the next attempt goes on from:
 * 1. the relay must answer and speak contract v2 (`/v1/info`);
 * 2. another relay: the card's channel made there anew, with the hashes of its next taps at the
 *    next version, before the card is touched;
 * the card shown to be this one, its record saying "reset" (before anything on it changes),
 *    then the card reset and programmed at the next version with the relay's address;
 * 4. its tap read back and checked (programCard), its record active at the new version;
 * 5. another relay: the channel on the former one deleted, whatever that relay answers. The same
 *    relay: its channel made anew.
 * A move tried again once step 4 was done (`formerRelayHost`) does step 5 only, without the card.
 */
export function reprogramCard(
  cardId: string,
  options: ReprogramOptions
): Promise<ReprogrammedCard> {
  const { relayHost, messages, channelName, onStep, stopped } = options;
  onStep?.("notifications");
  return withCard(async (access) => {
    const push = await cardPushToken(channelName, { ask: true });
    if (push.status === "denied") throw new PairingError("notificationsDenied");
    onStep?.("relay");
    // No token (Android, whose card socket wakes it): as at the pairing.
    const device: CardDevice = {
      key: await loadDeviceKey(),
      pushToken: push.status === "granted" ? push.token : null
    };
    try {
      await fetchRelayInfo(relayHost);
    } catch (error) {
      if (error instanceof RelayError && error.code !== "unreachable") {
        throw new PairingError("relayIncompatible", error);
      }
      throw new PairingError("relayUnreachable", error);
    }
    // The keys' version must not be missed: a majority of the relays answers.
    const { states, conclusive } = await refreshCardStates(access);
    if (!conclusive) throw new PairingError("recordsUnreachable");
    let current = stateOf(states, cardId);
    // Deleted meanwhile (on another device, on the web app): never programmed again from here, its
    // deleted wallet with it. "Add a card" adds it anew.
    if (current.status === "deleted") {
      throw new PairingError("cardGone", new Error("The card was deleted"));
    }
    const formerHost = current.relayHost;
    const moving = relayHost !== formerHost;
    // The relay whose channel goes at the end: the record's, or the one an earlier attempt left.
    const leftHost = moving ? formerHost : (options.formerRelayHost ?? formerHost);
    // A move tried again once the card was programmed and recorded at `relayHost` (what failed came
    // after): the card is not asked for again, only what is left is done.
    const finishing = !moving && leftHost !== relayHost && current.status === "active";
    let state: CardState;
    // The hashes left in step 2 are those of the version programmed: else the channel is made anew.
    let prepared = false;
    // The token sealed in those hashes, as the channel's sync seals it (relay-sync.ts).
    let sealed: string | null = null;
    if (finishing) {
      onStep?.("activating");
      state = current;
    } else {
      const next = keyVersionFor({ ...current, status: "reset" }, "blank");
      const uid = hexToBytes(current.uid);

      // 2. The new relay's channel, from a clean slate, with the next version's hashes from the
      // tap after the check (counter 2) on. None for a move left during its checks.
      let depositedThrough = 0;
      if (moving) {
        if (stopped?.()) throw new PairingError("cancelled");
        sealed = device.pushToken;
        const secret = channelSecretOf(access.root, cardId, relayHost);
        const keys = cardKeysOf(access.root, uid, next);
        try {
          await deleteChannel(relayHost, secret);
          await putChannel(relayHost, secret, { publicKey: device.key.publicKey });
          await postHashes(
            relayHost,
            secret,
            tapEntries(keys.k2, uid, 2, CARD_HASHES_AHEAD, sealed)
          );
          depositedThrough = 1 + CARD_HASHES_AHEAD;
        } catch (error) {
          if (error instanceof RelayError) {
            throw new PairingError(
              error.code === "unreachable" ? "relayUnreachable" : "relayIncompatible",
              error
            );
          }
          throw error;
        } finally {
          wipeCardKeys(keys);
          secret.fill(0);
        }
      }

      // 3 and 4. The card, held to the phone. No session opened without a screen to show it: the
      // card held next would be programmed. Left while its channel was made: that goes too.
      if (stopped?.()) {
        if (moving) {
          await removeChannel(access, cardId, relayHost).catch((error: unknown) => {
            logFailure("Deleting the channel of a relay change left failed", error);
          });
        }
        throw new PairingError("cancelled");
      }
      onStep?.("card");
      let published: Promise<boolean> = Promise.resolve(true);
      const programmed = await withCardSession(
        messages,
        async ({ card, tagUid }) => {
          onStep?.("programming");
          if (current.status !== "reset") {
            // Its record says "reset" once the card is shown to be this one, before anything on it
            // is changed, blank already or not (kept on the device, the relays' copy follows, the
            // card stays in the field meanwhile): from then on, an interruption leaves it out of
            // "Cards", where it might no longer pay, and the next attempt goes on at the next
            // version.
            await resetThisCard(access, current, { card, tagUid }, async () => {
              const { updatedAt: _updatedAt, ...kept } = current;
              ({ state: current, published } = await keepCardState(access, {
                ...kept,
                status: "reset"
              }));
            });
          } else {
            // Reset by an attempt before: as it was (it left the field before it was changed), half
            // reset, blank, or programmed at the next version already. Reset while it holds the
            // record's keys; else programCard tells, and refuses another card.
            await resetThisCard(access, current, { card, tagUid }).catch((error: unknown) => {
              // Shown not to be at the record's keys, nothing sent it: programCard tells the rest.
              // A key 0 that refused its key is never tried again.
              const notAtThem =
                (error instanceof ResetError && error.code === "notThisCard") ||
                (error instanceof PairingError && error.reason === "notThisCard");
              if (!notAtThem) throw error;
            });
          }
          const reset = current;
          return programCard(card, {
            root: access.root,
            relayHost,
            version: (held, found) => {
              // A blank card is any blank card: it must be this one.
              if (cardIdOf(access.root, held) !== cardId) {
                throw new PairingError("notThisCard", new Error("Another card"));
              }
              return keyVersionFor(reset, found);
            }
          });
        },
        { stopped }
      );
      programmed.uid.fill(0);
      await published;

      onStep?.("activating");
      prepared = moving && programmed.version === next;
      const { updatedAt: _updatedAt, ...kept } = current;
      ({ state } = await recordCardState(access, {
        ...kept,
        keyVersion: programmed.version,
        status: "active",
        relayHost,
        lastCounter: programmed.counter,
        depositedThrough: Math.max(prepared ? depositedThrough : 0, programmed.counter)
      }));
    }

    // 5. The card programmed and recorded on `relayHost`: the move is done whatever the former relay
    // answers (its channel stays there, without effect: the card no longer calls it). The new one
    // gets this phone and its hashes topped up.
    const previousChannel =
      leftHost === relayHost
        ? null
        : await removeChannel(access, cardId, leftHost).catch((error: unknown) => {
            logFailure("Deleting the former relay's channel failed", error);
            // A refusal it said; any other answer proves nothing of its channel.
            return error instanceof RelayError &&
              (error.code === "refused" || error.code === "unauthorized")
              ? ("refused" as const)
              : ("unknown" as const);
          });
    // The entries left in step 2 hold this phone's token.
    if (prepared) await markPushToken(cardId, sealed);
    const activation = await syncCardChannel(access, state, device, { anew: !prepared });
    // The new relay listened to at once, the former one no longer (socket.ts).
    await listenForCards(access);
    // Its pass at its new keys and relay (card-passes.ts).
    await syncCardPasses(access);
    return {
      state: knownCardState(access.walletId, cardId) ?? state,
      activation,
      previousChannel
    };
  });
}

/** Runs `operation` with the account's card keys; any error as a PairingError. */
async function run<T>(operation: (access: CardAccess) => Promise<T>): Promise<T> {
  try {
    return await withCardAccess(operation);
  } catch (error) {
    throw toPairingError(error);
  }
}

/** As `run`, for an operation on the card held to the phone (NFC first). */
async function withCard<T>(operation: (access: CardAccess) => Promise<T>): Promise<T> {
  if (!(await canProgramCards())) throw new PairingError("nfcUnavailable");
  return run(operation);
}
