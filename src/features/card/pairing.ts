import { bytesToHex } from "@noble/hashes/utils.js";

import {
  DEFAULT_CARD_DAY_SATS,
  DEFAULT_CARD_PAYMENTS_PER_HOUR,
  DEFAULT_CARD_PAYMENT_SATS
} from "@/config/card";
import type { CardState } from "@/lib/card/card-record";
import { CardUrlTooLongError } from "@/lib/card/card-url";
import { loadDeviceKey } from "@/lib/card/device-key";
import {
  LegacyCardDisabledError,
  LegacyServerUnavailableError,
  detectLegacyCard,
  wipedLegacyUid,
  type LegacyCard
} from "@/lib/card/legacy-card";
import { FIRST_CARD_WALLET_GENERATION, MAX_KEY_VERSION, cardIdOf } from "@/lib/card/keys";
import {
  canProgramCards,
  isSessionCancelled,
  withCardSession,
  type SessionMessages
} from "@/lib/card/nfc-session";
import { CardError, type Ntag424 } from "@/lib/card/ntag424";
import {
  ProgramError,
  ResetError,
  ownCardOf,
  programCard,
  resetCard,
  shownCardUid,
  type ProgrammedCard
} from "@/lib/card/program";
import { RelayError, fetchRelayInfo } from "@/lib/card/relay-client";
import { NewerRecordError } from "@/lib/nostr/record";

import { syncCardPasses } from "./card-passes";
import { cardPushToken } from "./push";
import { listenForCards, syncCardChannel, type CardDevice, type ChannelSync } from "./relay-sync";
import {
  NoAccountError,
  knownCardState,
  newerCardRecord,
  recordCardState,
  refreshCardStates,
  withCardAccess,
  type CardAccess
} from "./states";

/*
 * Pairing a blank BoltCard with the open account's wallet: checks first what the card will need
 * (notifications, the relay, the card records on a majority of the relays), then programs the card
 * held to the phone, records its state, and prepares its relay channel. Each step's failure has its
 * own reason, never a state that is not proven: a programmed card whose channel the relay did not
 * take yet is "paired", its activation pending (`activation`), done again at each app start.
 *
 * Notifications refused by the user stop the pairing: the screen asks to allow them. A phone that
 * gets no push token (Android, which has no push: its card socket wakes it, socket.ts; an iPhone
 * whose token did not come) pairs its card all the same: its taps carry no token; the card socket
 * brings them where it listens to the card's relay, else the card is paid in open-app mode
 * (`activation` "noPush"), and a later app start that gets a token gives it to them.
 */

export type PairingStep =
  /** The notifications asked for (the phone learns from them that a till reads the card). */
  | "notifications"
  /** The relay, then the cards' records: before any card is asked for. */
  | "relay"
  /** The NFC session is open: the card is awaited. */
  | "card"
  /** The card is in the field: programmed, then checked. */
  | "programming"
  /** The card's state recorded, its channel prepared on the relay. */
  | "activating";

export type PairingFailure =
  | "noAccount"
  | "nfcUnavailable"
  | "notificationsDenied"
  /** The relay did not answer; nothing was written to any card. */
  | "relayUnreachable"
  /** The relay answered, but does not speak contract v2. */
  | "relayIncompatible"
  /** The relay's host does not fit in a card (CardUrlTooLongError). */
  | "relayTooLong"
  /** Fewer than a majority of the account's relays answered: a card's keys could not be chosen. */
  | "recordsUnreachable"
  /**
   * The web app: no majority of the account's relays took a change of the card's record. Those
   * that took it keep it: it may still apply (a later read merges the newest copy it finds).
   */
  | "notConfirmed"
  /** A card of another issuer (or not blank): its issuer has to reset it first. */
  | "notBlank"
  /** This wallet's card already, at other keys: deleted with it in hand, it is blank again. */
  | "ownCard"
  /** Another card than the one chosen in "Cards" (or not at the keys its record says). */
  | "notThisCard"
  /** The card left the field before the end: hold it again (the next attempt goes on). */
  | "cardLost"
  /** Not an NTAG 424 DNA. */
  | "notBoltCard"
  /** Programmed, but its tap read back does not verify. */
  | "verifyFailed"
  /** The card was programmed and reset too many times with this wallet (255 versions). */
  | "versionsExhausted"
  /** The card's record (or this device's v2-card migrations) was written by a newer app. */
  | "newerApp"
  /** A deletion: the card's wallet holds sats, sends or receives some (card-wallet.ts). */
  | "walletNotEmpty"
  /** A deletion: the card's wallet did not answer (found empty, its Lightning address given up). */
  | "walletUnavailable"
  /** A setting of a card "Cards" no longer shows: deleted (or reset) on another device. */
  | "cardGone"
  /**
   * A deletion no majority of the relays took yet: kept on this phone, published again at each
   * sync (manage.ts, recordDeletion); the card pays nothing, it is not made blank.
   */
  | "deletionPending"
  /**
   * Migrating a v2 card: its balance could not be transferred to its new wallet. Nothing was moved
   * and the card was NOT erased: it keeps its v2 balance (migration.ts).
   */
  | "migrationDrainFailed"
  /**
   * Migrating a v2 card: the transfer was requested, but its arrival in the card's new wallet could
   * not be confirmed in time. The sats may already have moved; the card was NOT erased. The holder
   * waits a moment, then migrates again (which finds the balance gone and only re-encodes).
   */
  | "migrationReceiptPending"
  /**
   * Migrating a v2 card: its balance is above what it may still spend within 24 hours (the v2
   * server's cap, 1,000 CHF, no exemption for a migration). The
   * server refused before anything moved; the card was NOT erased.
   */
  | "migrationOverDailyLimit"
  /**
   * Migrating a v2 card: the card's master key is not the v2 one, so it could not be erased. What
   * was transferred, if anything, is in the card's new wallet, which "Cards" shows.
   */
  | "migrationMasterKey"
  /**
   * Migrating a v2 card: the card did not end up blank (a key slot holds a key the v2 programming never
   * set). What was transferred, if anything, is in the card's new wallet, which "Cards" shows.
   */
  | "migrationNotWiped"
  /**
   * Migrating a v2 card: the card is locked by its holder, or banned, on the v2 service: it does
   * not migrate. Nothing was moved nor changed.
   */
  | "migrationCardDisabled"
  /**
   * Migrating a v2 card: the v2 server would not close it yet, a payment of the card still in flight
   * there (most often the transfer just made, not yet settled on its side). Nothing was changed;
   * try again shortly.
   */
  | "migrationPaymentPending"
  /**
   * Migrating a v2 card: the exchange with the v2 server, which alone holds the keys that open it,
   * did not go through (no answer, its session expired, an answer out of shape). The card itself
   * was not changed, but at the erase the server may have closed the v2 card already: never say
   * nothing changed. Trying again goes on where it stopped.
   */
  | "migrationServerUnreachable"
  | "cancelled"
  | "failed";

export class PairingError extends Error {
  readonly reason: PairingFailure;

  constructor(reason: PairingFailure, cause?: unknown) {
    super(`Pairing failed: ${reason}`, cause === undefined ? undefined : { cause });
    this.name = "PairingError";
    this.reason = reason;
  }
}

/**
 * Thrown (not a failure) when the card held for pairing is not blank but is a v2 card, recognized
 * through the v2 server, which alone holds the v2 keys (legacy-card.ts): the screen offers to
 * migrate it (transfer its balance to its new wallet, then erase and re-encode it) rather than say
 * "Card not blank". Carries the card's tap, captured in the same NFC session, for the migration's
 * first request.
 *
 * `resume` is true when instead the card is a migration left half-done (its erase was
 * interrupted, on this device or another of the account): its balance is already in its new
 * wallet, so the screen only finishes erasing and re-encoding it — no transfer. It is recognized by
 * the UID it still tells (wipedLegacyUid: its tap, some of its keys blank already, or its blank key
 * 0) against the account's card records ("migrating"): v2 cards have Random ID.
 */
export class LegacyCardError extends Error {
  readonly card: LegacyCard;
  readonly resume: boolean;

  constructor(card: LegacyCard, resume = false) {
    super("A v2 card was presented");
    this.name = "LegacyCardError";
    this.card = card;
    this.resume = resume;
  }
}

class VersionsExhaustedError extends Error {}

export type PairedCard = {
  state: CardState;
  /** The relay channel: ready, or to be done again at the next app start. */
  activation: ChannelSync;
};

export type PairingOptions = {
  relayHost: string;
  /** The NFC session's messages (iOS sheet). */
  messages: SessionMessages;
  /** The Android notification channel's name, as the system's settings show it. */
  channelName: string;
  onStep?: (step: PairingStep) => void;
  /**
   * Whether the holder cancelled or left meanwhile: checked once the checks are done, before the
   * card is asked for (cancelCardSession ends a session open, not one still to open).
   */
  stopped?: () => boolean;
};

/**
 * The version of the keys to program into the card of `cardId`: its record's when it is active and
 * the card still holds a tap of it (an interrupted pairing), or when it is being migrated (the
 * version kept for it, which no tap of this wallet ever paid with: the card is active at none),
 * else one more than its record's (a card reset, here or elsewhere: its earlier taps must never be
 * good again), else 1.
 */
export function keyVersionFor(state: CardState | undefined, found: "tap" | "blank"): number {
  if (!state) return 1;
  if (state.status === "migrating") return state.keyVersion;
  if (state.status === "active" && found === "tap") return state.keyVersion;
  if (state.keyVersion >= MAX_KEY_VERSION) throw new VersionsExhaustedError();
  return state.keyVersion + 1;
}

export async function pairCard(options: PairingOptions): Promise<PairedCard> {
  const { relayHost, messages, channelName, onStep, stopped } = options;
  onStep?.("notifications");
  if (!(await canProgramCards())) throw new PairingError("nfcUnavailable");
  try {
    return await withCardAccess(async (access) => {
      const push = await cardPushToken(channelName, { ask: true });
      if (push.status === "denied") throw new PairingError("notificationsDenied");
      const pushToken = push.status === "granted" ? push.token : null;
      onStep?.("relay");
      const deviceKey = await loadDeviceKey();
      await checkCardRelay(relayHost);
      const { states, conclusive } = await refreshCardStates(access);
      if (!conclusive) throw new PairingError("recordsUnreachable");
      const byId = new Map(states.map((state) => [state.cardId, state]));
      // No session opened without a screen to show it: the next card held to the phone would be
      // programmed.
      if (stopped?.()) throw new PairingError("cancelled");

      onStep?.("card");
      const programmed = await withCardSession(
        messages,
        async ({ card, tagUid }) => {
          onStep?.("programming");
          // This wallet's card, reset or on its way to another relay: blank again first.
          const again = await programResetCard(access, card, tagUid, byId, relayHost);
          if (again) return again;
          try {
            return await programCard(card, {
              root: access.root,
              relayHost,
              version: (uid, found) => keyVersionFor(byId.get(cardIdOf(access.root, uid)), found)
            });
          } catch (error) {
            // This wallet's card that no record names: taken back, never left "not blank".
            if (
              error instanceof ProgramError &&
              (error.code === "notBlank" || error.code === "ownCard")
            ) {
              const lost = await programLostCard(access, card, byId, relayHost);
              if (lost) return lost;
            }
            // Not blank, but a v2 card: the screen offers to migrate it (or finish a
            // migration left half-done), rather than say "Card not blank".
            if (error instanceof ProgramError && error.code === "notBlank") {
              const legacy = await recognizeLegacyCard(access, card, byId);
              if (legacy) throw legacy;
            }
            throw error;
          }
        },
        { stopped }
      );

      onStep?.("activating");
      const device: CardDevice = { key: deviceKey, pushToken };
      return activateProgrammedCard(access, programmed, {
        relayHost,
        device,
        previous: byId.get(programmed.cardId)
      });
    });
  } catch (error) {
    // A v2 card recognized for migration is a signal, not a pairing failure: let it through.
    if (error instanceof LegacyCardError) throw error;
    throw toPairingError(error);
  }
}

/**
 * This wallet's card whose record says "reset" or "deleted", as "Add a card" adds it
 * again: blank after a reset or a deletion in hand, anywhere on its way to another relay, a relay
 * change having stopped (manage.ts records the card reset once it is shown to be this card, before
 * it changes anything on it), or still at its record's keys, deleted without it. On
 * the pairing's relay, as any card: never on one the card's file names, which anyone can write
 * while its key 0 is blank. The card is brought back to blank first, shown to be this one
 * (resetCard): its reset goes on, from its record's version, or the programming the move began at
 * the next one is undone. Then it is programmed past any version it held: a tap it made at the next
 * one must never be good again (the read counter starts again with its SDM settings). The UID the
 * card shows (shownCardUid: the tag's, else its tap's or its blank key 0's, with Random ID) only
 * picks the record; a key 0 that refuses the key believed to be its ends it, never tried again.
 * Null when the UID names no such card, or the card does not show itself as this one: nothing was
 * sent it then but reads (and the blank key 0's authentication), and the usual pairing tells what
 * it is.
 */
async function programResetCard(
  access: CardAccess,
  card: Ntag424,
  tagUid: Uint8Array | null,
  states: ReadonlyMap<string, CardState>,
  relayHost: string
): Promise<ProgrammedCard | null> {
  const shown = await shownCardUid(card, access.root, tagUid).catch((error: unknown) => {
    // A key 0 that refused the blank key, its version left at 0: not blank, and nothing names it
    // this wallet's (Random ID: no tag's UID). Never tried again, as programCard would.
    if (error instanceof ResetError && error.code === "keyRefused") {
      throw new ProgramError("notBlank", "The card's key 0 is not blank");
    }
    throw error;
  });
  if (!shown) return null;
  const cardId = cardIdOf(access.root, shown);
  const state = states.get(cardId);
  if (state?.status !== "reset" && state?.status !== "deleted") return null;
  const reset = (version: number) =>
    resetCard(card, { root: access.root, cardId, version }).then(
      () => true,
      (error: unknown) => {
        if (error instanceof ResetError && error.code === "notThisCard") return false;
        throw error;
      }
    );
  let held = state.keyVersion;
  if (!(await reset(held))) {
    if (held >= MAX_KEY_VERSION || !(await reset(held + 1))) return null;
    held += 1;
  }
  if (held >= MAX_KEY_VERSION) throw new VersionsExhaustedError();
  const version = held + 1;
  return programCard(card, {
    root: access.root,
    relayHost,
    version: (uid) => {
      // Blank now: it must still be this card.
      if (cardIdOf(access.root, uid) !== cardId) {
        throw new PairingError("notThisCard", new Error("Another card"));
      }
      return version;
    }
  });
}

/**
 * This wallet's card that no record of the account names (read from a majority of the relays), as
 * "Add a card" finds it: at its own keys of one version (ownCardOf: its tap verifies with them), at
 * a version the pairing would not program it at, or for another relay than the pairing's. Its
 * records are lost (relays that dropped them, the device's copy gone): the card would otherwise
 * stay "not blank", or "already in Cards" where "Cards" does not show it, at keys no screen could
 * take back. Its record is written first, "reset" at the keys it holds, and
 * programResetCard at the next pairing, on any device. A newer app's record refuses the write
 * (NewerRecordError, "newerApp"), relays that do not take it leave the card as it is
 * ("recordsUnreachable"). Then reset and programmed past that version (programResetCard). Null
 * when the card is not such a card: nothing sent it but reads.
 */
async function programLostCard(
  access: CardAccess,
  card: Ntag424,
  states: ReadonlyMap<string, CardState>,
  relayHost: string
): Promise<ProgrammedCard | null> {
  const own = await ownCardOf(card, access.root);
  if (!own) return null;
  const uid = bytesToHex(own.uid);
  own.uid.fill(0);
  if (states.has(own.cardId)) return null;
  const { state, published } = await recordCardState(access, {
    cardId: own.cardId,
    uid,
    keyVersion: own.version,
    status: "reset",
    relayHost: own.relayHost,
    lastCounter: own.counter,
    depositedThrough: own.counter,
    ...keptSettings(undefined),
    suspended: false,
    settingsAt: Date.now(),
    walletGeneration: walletGenerationAfter(undefined)
  });
  if (!published) {
    // A newer app's record seen only by this write's own read: never written over.
    if (await newerCardRecord(access, state.cardId)) throw new NewerRecordError();
    throw new PairingError("recordsUnreachable", new Error("No majority of the relays took it"));
  }
  return programResetCard(access, card, null, new Map([[state.cardId, state]]), relayHost);
}

/**
 * Before a card is asked for (the pairing, the v2-card migration): the relay to write into it
 * answers and speaks contract v2. Nothing is written to any card otherwise.
 */
export async function checkCardRelay(relayHost: string): Promise<void> {
  try {
    await fetchRelayInfo(relayHost);
  } catch (error) {
    if (error instanceof RelayError && error.code !== "unreachable") {
      throw new PairingError("relayIncompatible", error);
    }
    throw new PairingError("relayUnreachable", error);
  }
}

/**
 * What a card programmed again keeps of its record (`previous`): its holder's name, look and
 * limits, its issuer's visual; of a card deleted, its issuer's visual only (all its data erased,
 * but the visual printed on it is the card's, not its holder's, card-erasure.ts), which starts
 * again as a new card.
 */
export function keptSettings(
  previous: CardState | undefined
): Pick<
  CardState,
  "maxPaymentSats" | "maxDaySats" | "maxPaymentsPerHour" | "name" | "look" | "issuer"
> {
  const kept = previous?.status === "deleted" ? undefined : previous;
  return {
    maxPaymentSats: kept?.maxPaymentSats ?? DEFAULT_CARD_PAYMENT_SATS,
    maxDaySats: kept?.maxDaySats ?? DEFAULT_CARD_DAY_SATS,
    maxPaymentsPerHour: kept?.maxPaymentsPerHour ?? DEFAULT_CARD_PAYMENTS_PER_HOUR,
    name: kept?.name ?? "",
    look: kept?.look ?? null,
    issuer: previous?.issuer ?? null
  };
}

/**
 * The generation of the wallet a card programmed again pays from: its record's, and a new one for
 * a card deleted (all its data erased), so that nothing of the
 * deleted card's wallet shows again, its balance nor its history.
 */
export function walletGenerationAfter(previous: CardState | undefined): number {
  if (!previous) return FIRST_CARD_WALLET_GENERATION;
  return previous.status === "deleted" ? previous.walletGeneration + 1 : previous.walletGeneration;
}

/**
 * Records a freshly programmed card as active and prepares its relay channel anew (shared by the
 * pairing and the v2-card migration, src/features/card/migration.ts). A card paired again keeps its
 * holder's settings (keptSettings); its suspension ends with the new keys. Wipes `programmed.uid`.
 * A card being migrated ends its migration so, whichever path programmed it (the migration, or a
 * pairing that found it blank after an erase that had ended): its record is active at the version
 * kept for it.
 */
export async function activateProgrammedCard(
  access: CardAccess,
  programmed: ProgrammedCard,
  { relayHost, device, previous }: { relayHost: string; device: CardDevice; previous?: CardState }
): Promise<PairedCard> {
  const { state } = await recordCardState(access, {
    cardId: programmed.cardId,
    uid: bytesToHex(programmed.uid),
    keyVersion: programmed.version,
    status: "active",
    relayHost,
    lastCounter: programmed.counter,
    depositedThrough: programmed.counter,
    ...keptSettings(previous),
    suspended: false,
    // The suspension ending (a deleted card's settings erased) is a change of its settings, after
    // any the record holds.
    settingsAt: Math.max(Date.now(), (previous?.settingsAt ?? -1) + 1),
    walletGeneration: walletGenerationAfter(previous)
  });
  programmed.uid.fill(0);
  const activation = await syncCardChannel(access, state, device, { anew: true });
  // Its relay listened to at once where the card socket is on (socket.ts).
  await listenForCards(access);
  // A card programmed again: its pass at its new keys, or none (card-passes.ts).
  await syncCardPasses(access);
  // With the hashes the sync deposited, if it did.
  return { state: knownCardState(access.walletId, state.cardId) ?? state, activation };
}

/**
 * Whether the not-blank card held to the phone is a v2 card, as a LegacyCardError for the screen
 * to migrate it, or null (a card of another issuer: the usual "not blank"). A fresh v2
 * card is recognized through the v2 server (its tap, then its master key: detectLegacyCard), which
 * may refuse it as locked or banned (LegacyCardDisabledError) or not answer
 * (LegacyServerUnavailableError); a migration left half-done (its erase
 * interrupted) by the UID the card still tells (wipedLegacyUid: its tap, some of its keys blank
 * already, or its blank key 0; v2 cards have Random ID, anticollision never names them) naming a
 * card the account records as "migrating" (`states`, read from a majority of the relays). Its
 * record is written before the card is touched, and the card is erased only once its balance is in
 * its wallet. Nothing tried on the card for that while the account records no migration. Off
 * ("not blank") where the v2 server has no v2 keys.
 */
async function recognizeLegacyCard(
  access: CardAccess,
  card: Ntag424,
  states: ReadonlyMap<string, CardState>
): Promise<LegacyCardError | null> {
  // A fresh v2 card: its tap is read in the same session, the card still in the field, and told
  // to the v2 server, which alone can open it.
  const legacy = await detectLegacyCard(card, access.root);
  if (legacy) return new LegacyCardError(legacy);
  if (![...states.values()].some((state) => state.status === "migrating")) return null;
  const uid = await wipedLegacyUid(card);
  if (!uid) return null;
  const state = states.get(cardIdOf(access.root, uid));
  uid.fill(0);
  if (state?.status !== "migrating") return null;
  // The balance is already in its wallet; only the erase and re-encode remain.
  return new LegacyCardError({ url: "", p: "", c: "", uid: state.uid, cardId: state.cardId }, true);
}

/** The pairing's reason for any error of a card operation (pairing.ts, manage.ts). */
export function toPairingError(error: unknown): PairingError {
  if (error instanceof PairingError) return error;
  if (error instanceof LegacyCardDisabledError) {
    return new PairingError("migrationCardDisabled", error);
  }
  if (error instanceof LegacyServerUnavailableError) {
    return new PairingError("migrationServerUnreachable", error);
  }
  if (error instanceof ResetError) return new PairingError("notThisCard", error);
  if (error instanceof NoAccountError) return new PairingError("noAccount", error);
  if (error instanceof CardUrlTooLongError) return new PairingError("relayTooLong", error);
  if (error instanceof VersionsExhaustedError) return new PairingError("versionsExhausted", error);
  if (error instanceof NewerRecordError) return new PairingError("newerApp", error);
  if (error instanceof ProgramError) return new PairingError(error.code, error);
  if (isSessionCancelled(error)) return new PairingError("cancelled", error);
  if (error instanceof CardError) {
    if (error.code === "connection") return new PairingError("cardLost", error);
    if (error.code === "unsupported") return new PairingError("notBoltCard", error);
  }
  return new PairingError("failed", error);
}
