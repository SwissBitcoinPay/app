import { bytesToHex } from "@noble/hashes/utils.js";
import * as Notifications from "expo-notifications";
import { AppState } from "react-native";

import { CARD_WAKE_MAX_MS } from "@/config/card";
import { getAccountWalletId } from "@/features/account/session";
import { loadDeviceRelays } from "@/features/relays/device-relays";
import { getTerminalProfile } from "@/features/terminal/profile-cache";
import i18n from "@/i18n";
import { addCardWakeStep, beginCardWake, endCardWake, isWakeCode } from "@/lib/card/wake-journal";
import { getDeviceLocale } from "@/lib/locale/device";
import { logFailure } from "@/lib/log/log";
import { secureRandomBytes } from "@/lib/random";
import { accountProfile } from "@/lib/terminal/model";
import { within } from "@/lib/within";

import { CARD_WAKE_NOTICE, cardAskNotice, cardRefusedNotice } from "./card-notices";
import { startCardPaidNotices } from "./paid-notice";
import type { CardPayment, CardPaymentView } from "./payment";
import { receiveCardWake } from "./payments";
import { CARD_PAYMENTS_CHANNEL } from "./push";
import { wakeJournalKept } from "./wake-report";

/*
 * A card socket's wake (socket.ts: the packet came on the phone's own connection to the relay), as
 * the card socket's task gets it on Android (wake-task.android.ts): the app in the foreground, in
 * the background, or closed (its JavaScript started without any screen). The payload is read as
 * untrusted; its packet is taken as useCardWakes.ts takes one (payments.ts: opened with the
 * device's key, for a relay of the account's active cards, each session once), and its payment runs
 * to its end (payment.ts): the account closed, the pass this phone keeps of the card checks the
 * tap, and an approved merchant only is paid without asking (card-passes.ts).
 *
 * The app shown, the payment's panel shows it, as for an alert. Not shown, the holder is told by a
 * notification of the phone: paid (paid-notice.ts), to confirm in the app (touching it opens the
 * app, whose panel shows the payment waiting: the same JavaScript, still running), or refused once
 * an invoice came.
 *
 * Each wake is written down as it goes in the card wakes' journal (wake-journal.ts, "Wake
 * journal"): when it came, and its payment's phases, for the team to measure on a real phone.
 */

/** A card socket's wake: its packet, and when the socket received it. */
export type CardSocketWake = {
  packet: unknown;
  /** When the card socket received the packet (ms, the phone's clock). */
  receivedAt: number;
};

/** When the app's JavaScript loaded this module: its start, for a task that started it. */
const loadedAt = Date.now();

/** The longest packet read: the card socket's service passes none longer (4 096 characters). */
const MAX_PACKET = 4096;

/**
 * The packet a card socket's wake carries and when its connection received it, from the task's
 * payload (CardSocketTaskConsumer.kt: `{packet: <the packet's JSON>, receivedAt: <ms>, relay}`);
 * null for anything out of shape. The relay it names is the packet's to say, once opened
 * (payments.ts checks it against the account's cards): `relay` is not trusted.
 */
export function socketWakeOf(payload: unknown): CardSocketWake | null {
  if (!payload || typeof payload !== "object") return null;
  const { packet: text, receivedAt } = payload as { packet?: unknown; receivedAt?: unknown };
  if (typeof text !== "string" || text.length > MAX_PACKET) return null;
  if (typeof receivedAt !== "number" || !Number.isSafeInteger(receivedAt) || receivedAt <= 0) {
    return null;
  }
  let packet: unknown;
  try {
    packet = JSON.parse(text);
  } catch {
    return null;
  }
  if (!packet || typeof packet !== "object") return null;
  return { packet, receivedAt };
}

/** The notification of one payment: replaced as it goes, removed once paid (its notice tells). */
function noticeId(payment: CardPayment): string {
  return `card-wake-${payment.session}`;
}

async function notice(
  payment: CardPayment,
  content: { title: string; body: string }
): Promise<void> {
  try {
    await Notifications.scheduleNotificationAsync({
      identifier: noticeId(payment),
      content: { ...content, data: { kind: CARD_WAKE_NOTICE } },
      trigger: { channelId: CARD_PAYMENTS_CHANNEL }
    });
  } catch (error) {
    logFailure("A card payment's notification failed", error);
  }
}

async function removeNotice(payment: CardPayment): Promise<void> {
  try {
    await Notifications.dismissNotificationAsync(noticeId(payment));
  } catch (error) {
    logFailure("Removing a card payment's notification failed", error);
  }
}

/**
 * Tells the holder how the payment goes while the app is not shown; returns the stop function.
 * Asked: told once (touching it opens the app, whose panel shows the payment). Refused once its
 * invoice came, the app not shown: told in place of the ask. Otherwise the ask goes as the payment
 * goes on (confirmed, paid: paid-notice.ts tells it) or ends with the app shown (its panel tells).
 */
function tellWhileHidden(payment: CardPayment): () => void {
  let asked = false;
  let refused = false;
  const update = () => {
    const view = payment.getView();
    const hidden = AppState.currentState !== "active";
    const languageTag = getDeviceLocale().languageTag;
    if (view.phase === "ready") {
      if (hidden && !asked) {
        asked = true;
        void notice(payment, cardAskNotice(view, i18n.t, languageTag));
      }
    } else if (view.phase === "failed" && hidden && view.invoice) {
      if (!refused) {
        refused = true;
        void notice(
          payment,
          cardRefusedNotice(
            {
              invoice: view.invoice,
              failure: view.failure,
              answerMs: view.answerMs,
              payee: view.payee,
              card: view.card
            },
            i18n.t,
            languageTag
          )
        );
      }
    } else if (asked && !refused) {
      asked = false;
      void removeNotice(payment);
    }
  };
  const unsubscribe = payment.subscribe(update);
  update();
  return unsubscribe;
}

/** A phase of the payment as the journal keeps it: its name, and its code when it has one. */
function phaseStep(view: CardPaymentView): { name: string; detail: string | null } {
  switch (view.phase) {
    case "ready":
      return { name: view.phase, detail: view.cause };
    case "paying":
      return { name: view.phase, detail: view.automatic ? "automatic" : "confirmed" };
    case "sent":
      return { name: view.phase, detail: view.status };
    case "failed":
      return { name: view.phase, detail: isWakeCode(view.failure) ? view.failure : null };
    default:
      return { name: view.phase, detail: null };
  }
}

type WakeJournal = {
  step: (name: string, detail?: string | null) => void;
  /** Resolves once the journal has it all (the task's end lets the app's JavaScript go). */
  end: (payment: CardPayment | null) => Promise<void>;
};

/** A wake the journal cannot write down: the payment goes on all the same. */
const NO_JOURNAL: WakeJournal = { step: () => undefined, end: async () => undefined };

/**
 * The wake's entry in the journal (wake-journal.ts), in a build that keeps it (wakeJournalKept): it
 * never holds the payment up. Its times are the phone's clock: a gap counts the time the phone
 * slept or froze the process, which is what is measured; a clock change during a wake is rare.
 */
function journalOf(wake: CardSocketWake, startedAt: number): WakeJournal {
  if (!wakeJournalKept()) return NO_JOURNAL;
  const ignore = (error: unknown) => {
    logFailure("The card wakes' journal failed", error);
  };
  let id: string;
  try {
    id = bytesToHex(secureRandomBytes(8));
  } catch (error) {
    ignore(error);
    return NO_JOURNAL;
  }
  const appState: unknown = AppState.currentState;
  beginCardWake({
    id,
    startedAt,
    receivedAt: wake.receivedAt,
    jsAgeMs: Math.max(0, startedAt - loadedAt),
    appState: isWakeCode(appState) ? appState : "unknown",
    accountOpen: getAccountWalletId() !== null
  }).catch(ignore);
  return {
    step: (name, detail = null) => {
      addCardWakeStep(id, { name, atMs: Math.max(0, Date.now() - startedAt), detail }).catch(
        ignore
      );
    },
    end: (payment) =>
      endCardWake(id, Math.max(0, Date.now() - startedAt), payment?.tapCheck() ?? null).catch(
        ignore
      )
  };
}

/** Writes each new phase of `payment` to the journal; returns the stop function. */
function journalPhases(payment: CardPayment, step: WakeJournal["step"]): () => void {
  let last: string | null = null;
  const update = () => {
    const { name, detail } = phaseStep(payment.getView());
    const key = `${name}:${detail ?? ""}`;
    if (key === last) return;
    last = key;
    step(name, detail);
  };
  const unsubscribe = payment.subscribe(update);
  update();
  return unsubscribe;
}

/**
 * Runs a card socket's wake (wake-task.android.ts, CARD_SOCKET_TASK): its payment, for this
 * device's account, to its end, or CARD_WAKE_MAX_MS. Resolves once nothing of it runs any more: the
 * app closed, its JavaScript stops shortly after. A tap the app shown took already (its pending
 * packets read, useCardWakes.ts) is not taken again (payments.ts: each session once): its entry
 * says `notTaken`.
 */
export async function runCardSocketWake(payload: unknown): Promise<void> {
  const startedAt = Date.now();
  const wake = socketWakeOf(payload);
  if (!wake) return;
  startCardPaidNotices();
  const journal = journalOf(wake, startedAt);
  let payment: CardPayment | null = null;
  try {
    const profile = accountProfile(await getTerminalProfile());
    if (profile) {
      // The app closed, its JavaScript started without any screen: the root layout, which reads
      // the device's relays, never ran. Read now (never rejects), or the cards' own copies would be
      // read on DEFAULT_RELAYS, not the account's (own-copies.ts, currentRelays).
      await loadDeviceRelays();
      payment = await receiveCardWake(wake.packet, wake.receivedAt, profile.walletId);
    }
  } catch (error) {
    logFailure("Reading a card socket's wake failed", error);
  }
  if (!payment) {
    // Not this device's, already taken (the app's listener, app shown), or too old.
    journal.step("notTaken");
    await journal.end(null);
    return;
  }
  journal.step("taken");
  const stopTelling = tellWhileHidden(payment);
  const stopJournal = journalPhases(payment, journal.step);
  let sendingOn = false;
  try {
    const ended = await within(
      payment.done().then(() => true),
      CARD_WAKE_MAX_MS
    );
    if (ended === null) {
      journal.step("letGo");
      // Past the bound: let go (a payment being sent is left to end; its wallet stays its own).
      if (payment.isBusy()) sendingOn = true;
      else payment.close();
    }
  } finally {
    stopTelling();
    // A payment let go while being sent may still end:
    // its phases are written down as long as the app's JavaScript runs.
    if (sendingOn) void payment.done().then(stopJournal);
    else stopJournal();
    await journal.end(payment);
  }
}
