import {
  CARD_MIGRATION_INVOICE_DESCRIPTION,
  CARD_MIGRATION_RECEIVE_MS,
  CARD_MIGRATION_RECEIVE_POLL_MS,
  DEFAULT_CARD_RELAY_HOST,
  LEGACY_DAILY_LIMIT_REASON,
  LEGACY_NO_ROUTE_REASON
} from "@/config/card";
import { isCardShown, type CardState } from "@/lib/card/card-record";
import {
  LegacyWipeError,
  detectLegacyCard,
  wipeLegacyCard,
  type LegacyCard
} from "@/lib/card/legacy-card";
import { loadDeviceKey } from "@/lib/card/device-key";
import { cardIdOf } from "@/lib/card/keys";
import { legacyNumberOf, legacyVisualOf, type LegacyVisual } from "@/lib/card/legacy-visual";
import { canProgramCards, withCardSession, type SessionMessages } from "@/lib/card/nfc-session";
import { ProgramError, programCard } from "@/lib/card/program";
import { UID_LENGTH } from "@/lib/card/sun";
import { decodeBolt11 } from "@/lib/lightning/bolt11";
import {
  LnurlError,
  fetchWithdrawRequest,
  lnurlToUrl,
  submitWithdraw,
  type Invoice,
  type WithdrawRequest
} from "@/lib/lightning/lnurl";
import { logFailure } from "@/lib/log/log";
import { currentRelays } from "@/lib/relays/current";

import { cardInvoice, leaseCardWallet } from "./card-wallet";
import { keepIssuerVisual } from "./issuer-visual";
import {
  activateProgrammedCard,
  checkCardRelay,
  keptSettings,
  walletGenerationAfter,
  keyVersionFor,
  LegacyCardError,
  PairingError,
  toPairingError,
  type PairedCard,
  type PairingStep
} from "./pairing";
import { cardPushToken } from "./push";
import { type CardDevice } from "./relay-sync";
import {
  NoAccountError,
  recordCardState,
  refreshCardStates,
  withCardAccess,
  type CardAccess
} from "./states";

/*
 * Migrating a v2 card to a v3 card of the open wallet.
 * Recognized at the pairing through the v2 server, which alone holds the v2 keys
 * (src/lib/card/legacy-card.ts, LegacyCardError), such a card is not re-encoded outright: a v2
 * card holds a balance on the v2 server (`api.swiss-bitcoin-pay.ch`), which only the card can
 * spend. The migration first empties that
 * balance into the card's own v3 wallet (a Spark wallet whose id is derived from the card's UID, so
 * the re-encoded card pays from the very wallet the balance went to), and ONLY THEN erases and
 * re-encodes the card.
 *
 * The balance is drained over LNURL-withdraw (the card's own protocol), as the v2 server answers
 * any tap (the app follows the server as it is, no migration contract of its own):
 * `maxWithdrawable` is the card's gross balance in whole sats, whose withdrawal in full costs the
 * card no fee; the app makes an invoice of that amount to the card's wallet and hands it to the
 * callback. 0 to 0 says nothing to withdraw, taken for an empty card (a known risk: the server
 * answers the same for a card whose 24-hour cap is used up, which is then erased, its balance left
 * in the v2 server's custody for its support to pay out). A balance above what the card may still
 * spend within 24 hours is refused by the callback before anything moves
 * (LEGACY_DAILY_LIMIT_REASON): the card is not erased, the screen says why
 * ("migrationOverDailyLimit": no exemption from the cap).
 *
 * Nothing moves and nothing is erased before the card is recorded on the account as "migrating"
 * (recordMigration, on a majority of the relays): from then on "Cards" shows the card and its
 * wallet on every device of the account, "Delete account" checks that wallet, and an erase
 * interrupted is resumed from any of them (pairing.ts, recognizeLegacyCard). The card is NEVER
 * erased until the card's wallet has actually received the sats (waitForReceipt): a drain that
 * fails leaves the card and its v2 balance untouched, and a wipe that fails after the drain leaves
 * the sats in the card's new wallet, in sight.
 *
 * The erase goes through the v2 server (legacy-card.ts), which closes the v2 card for good first —
 * no tap, no recharge, its open recharges cancelled — and only on a balance of zero: a recharge
 * that reached the v2 balance between the drain and the erase has the erase refused, nothing
 * changed ("migrationDrainFailed"), for its balance to be transferred again; a payment of the card
 * still in flight there (often the transfer itself, not settled on the server's side yet) has it
 * refused too, nothing changed ("migrationPaymentPending"). A card already closed
 * (its erase begun, then interrupted) has nothing to transfer: it is only erased.
 *
 * Native only (NFC): the web stub of legacy-card.ts makes LegacyCardError never fire on the web.
 */

/** The step a migration is on, for its screen (src/features/card/MigrationSteps.tsx). */
export type MigrationStep =
  /** The balance is being transferred to the card's wallet. */
  | "transferring"
  /** The card held to the phone: erased through the v2 server, then programmed with the new keys. */
  | PairingStep;

export type LegacyBalance = {
  /** The card's whole balance, in whole sats (balanceSats). */
  sats: bigint;
  /** Whether it holds any: else the card is re-encoded without transferring. */
  drain: boolean;
  /** Its visual, when its server gave one (legacy-visual.ts): kept with its record. */
  visual: LegacyVisual | null;
  /**
   * The number printed on it, when its server gave one (legacyNumberOf), with a visual or not: its
   * v2 history is read by it once the card migrated (legacy-history.ts).
   */
  number: string | null;
};

/** The card's withdraw request: its tap's `p`/`c` in the query, as the card wrote it. */
function withdrawUrl(card: LegacyCard): URL {
  const url = lnurlToUrl(card.url);
  if (!url)
    throw new PairingError("migrationDrainFailed", new Error("The card's URL is not valid"));
  return url;
}

/**
 * The card's whole balance, in whole sats: the most the v2 server lets its tap withdraw
 * (`maxWithdrawable`, its gross balance), 0 when it answers 0 to 0 (taken for an empty card, see
 * above). Refused (PairingError "migrationDrainFailed", nothing moved, the card not erased): a
 * range whose least is above its most (not an answer of the server's), and an amount that is not a
 * whole number of sats, which would be rounded (an invoice is made in whole sats, the card erased
 * after the drain: the remainder would be lost without a word).
 */
function balanceSats(withdraw: WithdrawRequest): bigint {
  if (withdraw.minWithdrawableMsat > withdraw.maxWithdrawableMsat) {
    throw new PairingError(
      "migrationDrainFailed",
      new Error("The v2 server announced a least amount above its most")
    );
  }
  if (withdraw.maxWithdrawableMsat % 1000n !== 0n) {
    throw new PairingError(
      "migrationDrainFailed",
      new Error("The card announces an amount that is not a whole number of sats")
    );
  }
  return withdraw.maxWithdrawableMsat / 1000n;
}

/**
 * Whether the callback refused the transfer for the card's 24-hour cap (LEGACY_DAILY_LIMIT_REASON):
 * the v2 server says so only before paying anything, its reservation released.
 */
function overDailyLimit(error: unknown): boolean {
  return (
    error instanceof LnurlError &&
    error.code === "service" &&
    error.reason?.startsWith(LEGACY_DAILY_LIMIT_REASON) === true
  );
}

/**
 * Whether the callback answered that its node found no route to the card's wallet
 * (LEGACY_NO_ROUTE_REASON): said only once the payment failed for good, nothing moved.
 */
function noRoute(error: unknown): boolean {
  return (
    error instanceof LnurlError &&
    error.code === "service" &&
    error.reason === LEGACY_NO_ROUTE_REASON
  );
}

/**
 * The first LNURL-withdraw request of a v2 card: its whole balance, and its visual when its server
 * gives one. Only read, for the screen to tell the holder how much will be moved; the drain itself
 * asks again (a reservation lives only a minute on the server).
 */
export async function readLegacyBalance(card: LegacyCard): Promise<LegacyBalance> {
  // Closed for its migration already: it neither pays nor answers a withdrawal, nothing to move.
  if (card.closed === true) return { sats: BigInt(0), drain: false, visual: null, number: null };
  let withdraw: WithdrawRequest;
  try {
    withdraw = await fetchWithdrawRequest(withdrawUrl(card));
  } catch (error) {
    throw new PairingError("migrationDrainFailed", error);
  }
  const sats = balanceSats(withdraw);
  return {
    sats,
    drain: sats > 0n,
    visual: legacyVisualOf(withdraw.fields),
    number: legacyNumberOf(withdraw.fields)
  };
}

/**
 * Records the card on the account as "migrating" (card-record.ts), on a majority of the relays,
 * before anything of its migration moves or is erased; again when it is already (its record on a
 * majority, not only on this device). Its keys' version is the one its programming will take
 * (keyVersionFor), from what a majority of the relays tell of the card; its settings are those its
 * record had (keptSettings). Its issuer's visual (`visual`, from the server's first answer) is kept
 * by the first of these records that can (keepIssuerVisual: its image on the relays), and never
 * asked for again once kept; a visual that could not be kept leaves the card its colour, and its
 * migration goes on. Resolves with the record; rejects with a PairingError, "recordsUnreachable"
 * when no majority of the relays answered or took it.
 *
 * A migration to finish (`card`: its id alone, finishLegacyMigration) is never recorded anew: its
 * record must still say it migrates, else it ended meanwhile, on another device: MigrationEndedError
 * when the card is active, PairingError "cardGone" when it is no longer there.
 */
async function recordMigration(
  access: CardAccess,
  card: LegacyCard | MigrationToFinish,
  visual: LegacyVisual | null
): Promise<CardState> {
  try {
    const { states, conclusive } = await refreshCardStates(access);
    if (!conclusive) throw new PairingError("recordsUnreachable");
    const previous = states.find((state) => state.cardId === card.cardId);
    const migrating = previous?.status === "migrating" ? previous : undefined;
    const kept = keptSettings(previous);
    const issuer = kept.issuer ?? (visual ? await keepIssuerVisual(visual, currentRelays()) : null);
    let next: Omit<CardState, "updatedAt">;
    if (migrating) {
      const { updatedAt: _updatedAt, ...state } = migrating;
      // A visual given is a change of its settings, after any its record holds (mergeCardStates).
      next =
        issuer === migrating.issuer
          ? state
          : { ...state, issuer, settingsAt: Math.max(Date.now(), migrating.settingsAt + 1) };
    } else if (card.uid === undefined) {
      // A migration to finish whose record no longer says so: it ended meanwhile, on another
      // device. Never recorded anew.
      if (previous?.status === "active") throw new MigrationEndedError(previous);
      throw new PairingError(
        previous && isCardShown(previous) ? "failed" : "cardGone",
        new Error("The card's migration is no longer to finish")
      );
    } else {
      next = {
        cardId: card.cardId,
        uid: card.uid,
        keyVersion: keyVersionFor(previous, "blank"),
        status: "migrating",
        relayHost: DEFAULT_CARD_RELAY_HOST,
        lastCounter: 0,
        depositedThrough: 0,
        ...kept,
        suspended: false,
        issuer,
        // Its settings set anew (kept, a deleted card's erased, a visual given): after any its
        // record holds.
        settingsAt: Math.max(Date.now(), (previous?.settingsAt ?? -1) + 1),
        walletGeneration: walletGenerationAfter(previous)
      };
    }
    const { state, published } = await recordCardState(access, next);
    if (!published) {
      throw new PairingError(
        "recordsUnreachable",
        new Error("No majority of the relays took the migration's record")
      );
    }
    // Merged with the relays' copy: the card's programming moved on meanwhile, elsewhere.
    if (state.status !== "migrating") {
      throw new PairingError("failed", new Error("The card's record moved on meanwhile"));
    }
    return state;
  } catch (error) {
    if (error instanceof MigrationEndedError) throw error;
    throw toPairingError(error);
  }
}

/** A migration left half-done, by its card's id alone: its record says the rest. */
type MigrationToFinish = { cardId: string; uid?: undefined };

/**
 * A migration to finish that ended meanwhile, on another device: the card is active (`state`, as a
 * majority of the relays tell it), nothing of it left to do.
 */
export class MigrationEndedError extends Error {
  constructor(readonly state: CardState) {
    super("The card's migration ended meanwhile");
    this.name = "MigrationEndedError";
  }
}

/**
 * Transfers the v2 card's WHOLE current balance to its v3 wallet: the card recorded as
 * "migrating" first (recordMigration), then a fresh withdraw request (a new reservation, the one
 * read for the screen lives only a minute on the server), an invoice of the card's whole balance
 * now to the card's wallet, handed to the card's callback, then waits until the wallet has received
 * the sats.
 *
 * The whole balance on purpose, not the amount shown at the confirmation: the card is erased right
 * after, so whatever is left on it would stay behind. Draining what it holds now (which equals what
 * was shown, barring a change in the meantime) is what empties the card before it is erased. Throws
 * PairingError "migrationDrainFailed" when nothing can have moved (a failure before the invoice is
 * handed over to the server, or the server's "no_route", said once its node gave up for good):
 * the card keeps its balance. Once it is handed over, any other failure is
 * "migrationReceiptPending" — the sats may be on their way —, the server's own LNURL error
 * included: the v2 server answers `ERROR "Payment failed"` when its link to its Lightning node
 * breaks mid-payment, the payment still settling afterwards, so an error there does not prove that nothing moved. Nothing is erased
 * either way. Resolves with the sats the card's wallet received, as its own payment says them (what
 * "Balance transferred" tells): 0 when the balance was gone.
 */
export async function drainLegacyCard(
  card: LegacyCard,
  {
    visual = null,
    // How long to wait for the card's wallet to receive the sats; the default is the only value
    // used in the app, a small one lets a test reach the timeout branch without the real wait.
    receiveMs = CARD_MIGRATION_RECEIVE_MS
  }: {
    /** The card's visual its server gave (readLegacyBalance), kept with its record. */
    visual?: LegacyVisual | null;
    receiveMs?: number;
  } = {}
): Promise<bigint> {
  // From the callback's request on, the server may have paid, whatever comes back.
  let submitted = false;
  try {
    return await withCardAccess(async (access) => {
      const state = await recordMigration(access, card, visual);
      const lease = await leaseCardWallet(access, state);
      try {
        const withdraw = await fetchWithdrawRequest(withdrawUrl(card));
        const amountSats = balanceSats(withdraw);
        // The balance vanished since it was read (spent elsewhere): nothing to move.
        if (amountSats < 1n) return 0n;
        const { invoice } = await cardInvoice(
          lease,
          amountSats,
          CARD_MIGRATION_INVOICE_DESCRIPTION
        );
        const decoded = decodeBolt11(invoice);
        if (!decoded) throw new Error("The card's wallet made an unreadable invoice");
        const invoiceRef: Invoice = { pr: invoice, decoded, verifyUrl: "" };
        submitted = true;
        try {
          await submitWithdraw(withdraw, invoiceRef);
        } catch (error) {
          // Refused before anything moved: the card keeps its balance, and is not erased.
          if (overDailyLimit(error)) throw new PairingError("migrationOverDailyLimit", error);
          // Its node gave up for good: nothing moved, never "maybe on its way already".
          if (noRoute(error)) throw new PairingError("migrationDrainFailed", error);
          throw error;
        }
        return await waitForReceipt(lease, decoded.paymentHash, receiveMs);
      } finally {
        await lease.release();
      }
    });
  } catch (error) {
    if (error instanceof PairingError) throw error;
    if (submitted) throw new PairingError("migrationReceiptPending", error);
    if (error instanceof NoAccountError) throw new PairingError("noAccount", error);
    throw new PairingError("migrationDrainFailed", error);
  }
}

/**
 * Resolves once the card's wallet has received the drained payment (its `paymentHash`), with the
 * sats its receipt says.
 */
async function waitForReceipt(
  lease: Awaited<ReturnType<typeof leaseCardWallet>>,
  paymentHash: string,
  receiveMs: number
): Promise<bigint> {
  const deadline = Date.now() + receiveMs;
  for (;;) {
    // Syncs with the network: the payment the v2 server sent is claimed, then shows in the history.
    await lease.wallet.sync().catch((error: unknown) => {
      logFailure("Syncing a card's wallet during migration failed", error);
    });
    const sats = await received(lease, paymentHash);
    if (sats !== null) return sats;
    if (Date.now() >= deadline) {
      // The withdraw was accepted (submitWithdraw returned): the sats may already be on their way,
      // so this is NOT "nothing moved". The card is not erased; a later retry finds the balance
      // gone and only re-encodes.
      throw new PairingError(
        "migrationReceiptPending",
        new Error("The card's wallet did not receive the balance in time")
      );
    }
    await delay(CARD_MIGRATION_RECEIVE_POLL_MS);
  }
}

/** The sats of the card's wallet's completed receipt of `paymentHash`; null without one yet. */
async function received(
  lease: Awaited<ReturnType<typeof leaseCardWallet>>,
  paymentHash: string
): Promise<bigint | null> {
  for (let offset = 0; ; offset += 200) {
    const page = await lease.wallet.listPaymentsPage({ offset, limit: 200 });
    for (const payment of page.payments) {
      if (
        payment.direction === "receive" &&
        payment.status === "completed" &&
        payment.paymentHash === paymentHash
      ) {
        return payment.amountSats;
      }
    }
    if (page.listed < 200) return null;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type MigrationOptions = {
  messages: SessionMessages;
  /** The Android notification channel's name. */
  channelName: string;
  onStep?: (step: PairingStep) => void;
  /**
   * Whether the holder cancelled or left meanwhile: checked once the checks are done, before the
   * card is asked for (cancelCardSession ends a session open, not one still to open).
   */
  stopped?: () => boolean;
  /** The card's visual its server gave (readLegacyBalance), kept with its record if not yet. */
  visual?: LegacyVisual | null;
};

/**
 * Erases the v2 card held to the phone (through the v2 server) and programs it as a v3 card of the
 * open wallet, in one NFC session, then records it active and prepares its relay channel (as the
 * pairing does). Run only once the card holds no balance (drained by drainLegacyCard, or none to
 * begin with): what erasing cannot undo is already in the card's new wallet.
 *
 * The card is recorded as "migrating" BEFORE the erase begins (recordMigration; already, when a
 * drain ran), at the keys' version its programming takes: if the erase is interrupted, the
 * half-wiped card is neither a readable v2 card nor a blank one, and its record keeps it, its
 * wallet with it, in sight. A retry of the pairing, on any device of the account, then recognizes
 * the card by its UID, and finishLegacyMigration finishes the wipe (through the v2 server while the
 * v2 master key is still on the card, then with its blank one) and programs it.
 */
export function reprogramLegacyCard(
  card: LegacyCard,
  options: MigrationOptions
): Promise<PairedCard> {
  return reencode(card, options);
}

/**
 * Finishes the migration of the card of `cardId` left half-done ("Finish the migration" in "Cards",
 * or a card the pairing recognized by its record): from its record, which must still
 * say it migrates and names the card (recordMigration); any other card held is refused before
 * anything is sent to it. In the card's one session, as the pairing goes on with a card: a
 * programming of this wallet's keys interrupted goes on (or one ended but for its activation), a
 * blank card is programmed (its erase had ended), and only a card that is neither is erased, then
 * programmed. Never a v2 card that still pays (its tap verifying): its balance may never have
 * moved (its transfer failed, or was left), and erased it could no longer spend it. LegacyCardError
 * then, nothing written: migrated afresh, its balance read first. Its migration ended meanwhile, on
 * another device: MigrationEndedError when the card is active.
 */
export function finishLegacyMigration(
  cardId: string,
  options: Omit<MigrationOptions, "visual">
): Promise<PairedCard> {
  return reencode({ cardId }, options);
}

async function reencode(
  card: LegacyCard | MigrationToFinish,
  options: MigrationOptions
): Promise<PairedCard> {
  const { messages, channelName, onStep, stopped } = options;
  onStep?.("notifications");
  if (!(await canProgramCards())) throw new PairingError("nfcUnavailable");
  try {
    return await withCardAccess(async (access) => {
      const push = await cardPushToken(channelName, { ask: true });
      if (push.status === "denied") throw new PairingError("notificationsDenied");
      onStep?.("relay");
      const device: CardDevice = {
        key: await loadDeviceKey(),
        pushToken: push.status === "granted" ? push.token : null
      };
      // As the pairing: the relay written into the card answers, and speaks its contract.
      await checkCardRelay(DEFAULT_CARD_RELAY_HOST);
      // Nothing recorded for a holder who left already.
      if (stopped?.()) throw new PairingError("cancelled");
      // Its record first, from what a majority of the relays tell: an erase interrupted after this
      // point is resumable; its failure aborts before anything on the card is touched.
      const migrating = await recordMigration(access, card, options.visual ?? null);
      // No session opened without a screen to show it: the next card held to the phone, whichever
      // it is, would be taken for this one.
      if (stopped?.()) throw new PairingError("cancelled");

      onStep?.("card");
      const programmed = await withCardSession(
        messages,
        async ({ card: nfc, tagUid }) => {
          // Another card, by the UID the phone was told (a card without Random ID: a v2 card gives
          // a random one): refused before anything is sent to it (wipeLegacyCard checks the UID
          // its tap names, and the card's own once it opens it).
          if (tagUid?.length === UID_LENGTH && cardIdOf(access.root, tagUid) !== card.cardId) {
            throw new PairingError("notThisCard", new Error("Another card"));
          }
          onStep?.("programming");
          const program = () =>
            programCard(nfc, {
              root: access.root,
              relayHost: DEFAULT_CARD_RELAY_HOST,
              version: (uid, found) => {
                // The blank card must be the one migrated: its UID gives the expected id.
                if (cardIdOf(access.root, uid) !== card.cardId) {
                  throw new PairingError("notThisCard", new Error("Another card"));
                }
                return keyVersionFor(migrating, found);
              }
            });
          if (card.uid === undefined) {
            // As the pairing: a programming of this wallet's keys interrupted goes on (or one ended
            // but for its activation), a blank card is programmed. Neither ("notBlank"): nothing
            // was written to it.
            const programmed = await program().catch((error: unknown) => {
              if (error instanceof ProgramError && error.code === "notBlank") return null;
              throw error;
            });
            if (programmed) return programmed;
            // Only reads (and an authentication through the v2 server): a card it could not open
            // was never offered a migration (detectLegacyCard), so has none to finish.
            const legacy = await detectLegacyCard(nfc, access.root);
            // Another v2 card held: never migrated in this one's place.
            if (legacy && legacy.cardId !== card.cardId) {
              throw new PairingError("notThisCard", new Error("Another v2 card"));
            }
            // A v2 card that still pays: its balance is transferred first. One already closed
            // (its erase begun, then interrupted) has nothing to transfer: erased.
            if (legacy && legacy.closed !== true) throw new LegacyCardError(legacy);
          }
          // The UID its record names: the card the migration began on.
          await wipeLegacyCard(nfc, migrating.uid);
          return program();
        },
        { stopped }
      );

      onStep?.("activating");
      // Active at the version kept for it, its migration ends (as for any card paired).
      return activateProgrammedCard(access, programmed, {
        relayHost: DEFAULT_CARD_RELAY_HOST,
        device,
        previous: migrating
      });
    });
  } catch (error) {
    if (error instanceof MigrationEndedError || error instanceof LegacyCardError) throw error;
    throw toMigrationError(error);
  }
}

/** A migration's reason for any error of the re-encoding (reprogramLegacyCard). */
function toMigrationError(error: unknown): PairingError {
  if (error instanceof LegacyWipeError) {
    if (error.code === "masterKeyRefused") return new PairingError("migrationMasterKey", error);
    if (error.code === "otherCard") return new PairingError("notThisCard", error);
    // The v2 server refused to close the card: a balance reached it after the transfer. Nothing
    // changed: it is transferred again.
    if (error.code === "balanceRemains") return new PairingError("migrationDrainFailed", error);
    // A payment of the card still in flight on the v2 server, most often the transfer just made
    // (the sats already in the new wallet): never "not transferred". Nothing changed.
    if (error.code === "paymentPending") return new PairingError("migrationPaymentPending", error);
    return new PairingError("migrationNotWiped", error);
  }
  // The pairing's own translation for the NFC, relay, record and program failures.
  return toPairingError(error);
}
