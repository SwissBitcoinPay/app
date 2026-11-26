import {
  CARD_RELAY_TIMEOUT_MS,
  CARD_SESSION_LIFETIME_MS,
  IOS_EXTENSION_PAYS_CARDS,
  MAX_CARD_PAYMENT_SATS
} from "@/config/card";
import {
  CARD_PAID_NOTICE,
  CARD_WAKE_NOTICE,
  cardHandedOverNotice,
  cardPaidNotice,
  cardRefusedNotice
} from "@/features/card/card-notices";
import {
  CardPaymentCore,
  type CardPaymentFailure,
  type CardPaymentOptions,
  type CardPaymentPorts
} from "@/features/card/payment-core";
import { appInFront } from "@/lib/card/app-front";
import { loadCardPasses } from "@/lib/card/card-pass-store";
import { loadStoredCardStates } from "@/lib/card/card-store";
import { readDeviceKey } from "@/lib/card/device-key";
import type { CardInvoice } from "@/lib/card/card-invoice";
import type { CardPayeeView } from "@/lib/card/payee-decision";
import { loadCardPayees, loadPayeeBooks } from "@/lib/card/payees";
import { loadCardPayments } from "@/lib/card/payment-log";
import { fetchRelayInfo } from "@/lib/card/relay-client";
import { openWakePacket, parseWakePacket } from "@/lib/card/wake-packet";
import { logFailure } from "@/lib/log/log";
import { setCurrentRelays } from "@/lib/relays/current";
import { loadStoredRelays } from "@/lib/relays/store";

import { writeExtensionPayment } from "./card-records";
import { leaseEngineCardWallet } from "./card-wallet";
import { engineCardStates } from "./card-states";
import { engineT } from "./engine-texts";

/*
 * A card's tap in the iOS notification service extension's engine (docs/ios-card-payments.md, "The
 * payment in the extension"): the wake packet the relay pushed, opened with the device key, then
 * the card payment core (payment-core.ts) run with the extension's ports: what the app shares, read
 * only; the extension's own records written (src/lib/card/extension-records.ts); the card's wallet
 * connected with its pass (card-wallet.ts). As the app with its account closed, it pays an
 * approved merchant within the card's limits and mode, refuses what no one may approve, and hands
 * the session over to the app for anything its holder must approve, or not proven in time.
 *
 * Time: the system ends the extension about 30 s after the push (`budgetMs`, from the host). A
 * payment leaves only with ENGINE_SEND_MIN_LEFT_MS left (the slowest send measured: 9.3 s); what is
 * not decided ENGINE_HAND_OVER_LEFT_MS before the end is handed over. A send that has left is never
 * taken back: its log entry says "sending" until the app settles it.
 *
 * Nothing is taken from a relay that does not hand sessions over (`/v1/info`): the app takes such
 * a tap, as it does today; nor while the app is in front (app-front.ts): it takes the tap itself.
 *
 * The outcome carries the notification's words (card-notices.ts, as the app's on Android) and, for a
 * session the extension answered (paid, or refused once the point of sale's invoice came), the
 * notification's data without the packet: the app, opened from it, takes no session already
 * answered. A payment that ended before the invoice came tells nothing (the session may be the
 * app's: the relay gives it to one socket), its packet left to the app.
 */

/** A payment leaves only with this much of the extension's time left. */
export const ENGINE_SEND_MIN_LEFT_MS = 12_000;
/** What is not decided this long before the extension's end is handed over to the app. */
export const ENGINE_HAND_OVER_LEFT_MS = 5_000;
/** A packet older than a tap's session and a margin is not taken (as payments.ts). */
const WAKE_MAX_AGE_MS = CARD_SESSION_LIFETIME_MS + 60_000;

/** Why the extension did not take a tap: the app takes it, if it is the account's. */
export type EngineWakeSkip =
  "off" | "inFront" | "packet" | "noDeviceKey" | "notOpened" | "noCard" | "noHandOver";

/** A notification's words. */
export type EngineWakeNotice = { title: string; body: string };

/**
 * What the payment of a tap came to, for the extension's notification
 * (plugins/card-notification-extension/ios/NotificationService.swift): its words (`notice`), and
 * the data that replaces the relay's (its packet), once the session is answered (`data`); null for
 * the relay's notification as it came, its title in the holder's language.
 */
export type EngineWakeOutcome =
  | { outcome: "skipped"; reason: EngineWakeSkip; notice: null; data: null }
  | {
      outcome: "paid";
      amountSats: bigint;
      status: "pending" | "completed" | "failed";
      notice: EngineWakeNotice;
      data: { kind: typeof CARD_PAID_NOTICE };
    }
  | {
      outcome: "handedOver";
      amountSats: bigint | null;
      notice: EngineWakeNotice;
      data: null;
    }
  | {
      outcome: "refused";
      failure: CardPaymentFailure;
      amountSats: bigint | null;
      notice: EngineWakeNotice | null;
      data: { kind: typeof CARD_WAKE_NOTICE } | null;
    };

export type EngineWakeOptions = Pick<CardPaymentOptions, "createSocket" | "payeeCheck"> & {
  /** The holder's language (a BCP 47 tag): what the point of sale is told, in a refusal. */
  language: string;
  /** How long the extension still has (ms), from now, as the host tells it. */
  budgetMs: number;
};

/** The extension's ports of the card payment core (CardPaymentPorts). */
function enginePorts(
  t: CardPaymentPorts["t"],
  states: ReturnType<typeof engineCardStates>
): CardPaymentPorts {
  return {
    t,
    log: {
      load: () => loadCardPayments(),
      write: async (entry) => writeExtensionPayment(entry)
    },
    payees: {
      load: (walletId, card) => loadCardPayees(walletId, card),
      loadBooks: (walletId) => loadPayeeBooks(walletId),
      // A merchant's latest name is the app's to keep (its book): left for its next sync, the
      // book as it is.
      note: (walletId, card) => loadCardPayees(walletId, card)
    },
    passes: { load: (walletId) => loadCardPasses(walletId) },
    states: { onDeviceOf: states.onDeviceOf, recordOnDevice: states.recordOnDevice },
    leaseWallet: leaseEngineCardWallet,
    // The card's next hashes are deposited by the app's next sync (its time is not counted here).
    refillWithPass: async () => undefined,
    unlockFailure: () => null,
    account: null
  };
}

/**
 * Takes the wake packet `raw` (as sent: `{epk, iv, ct}`), received at `receivedAt` (ms), and runs its
 * payment: resolves with what it came to once nothing of it runs any more (within `budgetMs`),
 * never rejects.
 */
export async function runEngineCardWake(
  raw: unknown,
  receivedAt: number,
  options: EngineWakeOptions
): Promise<EngineWakeOutcome> {
  const start = performance.now();
  const left = () => options.budgetMs - (performance.now() - start);
  const skipped = (reason: EngineWakeSkip): EngineWakeOutcome => ({
    outcome: "skipped",
    reason,
    notice: null,
    data: null
  });
  // A build whose extension does not pay cards (IOS_EXTENSION_PAYS_CARDS): the app takes each tap.
  if (!IOS_EXTENSION_PAYS_CARDS) return skipped("off");
  if (appInFront(Date.now())) return skipped("inFront");
  const packet = parseWakePacket(raw);
  if (!packet || !Number.isFinite(receivedAt) || Date.now() - receivedAt > WAKE_MAX_AGE_MS) {
    return skipped("packet");
  }
  const key = await readDeviceKey();
  if (!key) return skipped("noDeviceKey");
  const wake = openWakePacket(key.secretKey, packet);
  key.secretKey.fill(0);
  if (!wake) return skipped("notOpened");
  // The device's relays, where the card's own copies are read (the app keeps the list, store.ts).
  setCurrentRelays(await loadStoredRelays());
  const states = engineCardStates();
  // The wallet whose cards this phone keeps: the app's copy of their states.
  const walletId = (await loadStoredCardStates())?.walletId;
  if (!walletId) return skipped("noCard");
  const cards = (await states.onDeviceOf(walletId)).filter(
    (state) => state.status === "active" && state.relayHost === wake.relay
  );
  if (cards.length === 0) return skipped("noCard");
  try {
    const info = await fetchRelayInfo(wake.relay, {
      timeoutMs: Math.min(CARD_RELAY_TIMEOUT_MS, Math.max(0, left() - ENGINE_SEND_MIN_LEFT_MS))
    });
    if (!info.handOver) return skipped("noHandOver");
  } catch (error) {
    logFailure("Reading the card relay's announcement failed", error);
    return skipped("noHandOver");
  }
  const t = engineT(options.language);
  // Amounts in the device locale, as the app's (getDeviceLocale): the host gives its first tag.
  const languageTag = options.language;
  const ceiling = cards.reduce(
    (lowest, card) => (card.maxPaymentSats < lowest ? card.maxPaymentSats : lowest),
    MAX_CARD_PAYMENT_SATS
  );
  const payment = new CardPaymentCore(
    { ...wake, receivedAt },
    {
      walletId,
      maxPaymentSats: ceiling,
      cards: cards.map(({ cardId, walletGeneration }) => ({ cardId, walletGeneration }))
    },
    enginePorts(t, states),
    {
      createSocket: options.createSocket,
      payeeCheck: options.payeeCheck,
      mayPayNow: () => left() >= ENGINE_SEND_MIN_LEFT_MS
    }
  );
  return new Promise<EngineWakeOutcome>((resolve) => {
    let settled = false;
    // What the holder was to approve, once checked: what the hand-over's notification asks.
    let asked: { invoice: CardInvoice; payee: CardPayeeView } | null = null;
    const handOverTimer = setTimeout(
      () => handOver(),
      Math.max(0, left() - ENGINE_HAND_OVER_LEFT_MS)
    );
    const settle = (outcome: EngineWakeOutcome) => {
      if (settled) return;
      settled = true;
      clearTimeout(handOverTimer);
      unsubscribe();
      // Told once nothing of the payment runs any more (its proof read and logged, the card's
      // wallet disconnected): what follows it ends with the extension's time, at the latest.
      const endTimer = setTimeout(() => payment.close(), Math.max(0, left() - 1_000));
      void payment.done().finally(() => {
        clearTimeout(endTimer);
        resolve(outcome);
      });
    };
    const handOver = () => {
      if (!payment.handOver()) return;
      // Not paid: the tap goes back to the app, which takes it once (card-states.ts).
      try {
        states.releaseTaps();
      } catch (error) {
        logFailure("Giving a card's tap back to the app failed", error);
      }
    };
    const check = () => {
      const view = payment.getView();
      switch (view.phase) {
        case "ready":
          // Its holder must approve it: in the app.
          asked = { invoice: view.invoice, payee: view.payee };
          handOver();
          return;
        case "handedOver":
          settle({
            outcome: "handedOver",
            amountSats: view.invoice?.amountSats ?? null,
            notice: cardHandedOverNotice(
              asked ?? { invoice: view.invoice, payee: null },
              t,
              languageTag
            ),
            data: null
          });
          return;
        case "sent":
          settle({
            outcome: "paid",
            amountSats: view.invoice.amountSats,
            status: view.status,
            notice: cardPaidNotice(
              { amountSats: view.invoice.amountSats, payee: view.payee, status: view.status },
              t,
              languageTag
            ),
            data: { kind: CARD_PAID_NOTICE }
          });
          return;
        case "failed": {
          // The invoice came to this socket (answerMs, its answer's time, is set then): the
          // session ended with it, answered. Before, it may be the app's (the relay gives it to one
          // socket): nothing told, its packet left to the app.
          const answered = view.answerMs !== null;
          settle({
            outcome: "refused",
            failure: view.failure,
            amountSats: view.invoice?.amountSats ?? null,
            notice: answered
              ? cardRefusedNotice(
                  {
                    invoice: view.invoice,
                    failure: view.failure,
                    answerMs: view.answerMs,
                    payee: view.payee,
                    card: view.card
                  },
                  t,
                  languageTag
                )
              : null,
            data: answered ? { kind: CARD_WAKE_NOTICE } : null
          });
          return;
        }
        default:
      }
    };
    const unsubscribe = payment.subscribe(check);
    payment.start();
    check();
  });
}
