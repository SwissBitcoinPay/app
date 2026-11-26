import { CARD_SESSION_LIFETIME_MS, MAX_CARD_PAYMENT_SATS } from "@/config/card";
import { loadDeviceKey } from "@/lib/card/device-key";
import { channelSecretOf } from "@/lib/card/keys";
import { fetchPendingPackets } from "@/lib/card/relay-client";
import { openWakePacket, parseWakePacket, type WakePacket } from "@/lib/card/wake-packet";
import { logFailure } from "@/lib/log/log";

import { CardPayment, type CardPaid, type CardPaymentOptions } from "./payment";
import { activeCardsOnDevice, cardStatesOnDevice, withCardAccess } from "./states";

/*
 * The card payments the phone was woken for (relay contract v2): each tap's wake packet, from a
 * notification or from the relay's pending packets (open-app mode), opened with the device's key
 * and given its payment (payment.ts). One shows at a time (CardPaymentSheet): a newer tap replaces
 * one waiting for the user (its point of sale is told), and waits for one being paid. Each payment
 * that leaves is told to the holder (subscribeCardPaid, paid-notice.ts), shown or not.
 */

/**
 * A packet older than this is dropped: its session is over. A minute more than the session's
 * lifetime: a notification's time is its sender's, whose clock may differ from the device's.
 */
const WAKE_MAX_AGE_MS = CARD_SESSION_LIFETIME_MS + 60_000;

/** Sessions already taken, with when (ms): a packet comes once per channel it arrives through. */
const seen = new Map<string, number>();

let current: CardPayment | null = null;
let next: CardPayment | null = null;
const listeners = new Set<() => void>();
const paidListeners = new Set<(paid: CardPaid) => void>();

function changed(): void {
  for (const listener of [...listeners]) listener();
}

/** Calls `listener` with each card payment that leaves; returns the unsubscribe function. */
export function subscribeCardPaid(listener: (paid: CardPaid) => void): () => void {
  paidListeners.add(listener);
  return () => {
    paidListeners.delete(listener);
  };
}

function paid(payment: CardPaid): void {
  for (const listener of [...paidListeners]) {
    try {
      listener(payment);
    } catch (error) {
      logFailure("Telling a card payment failed", error);
    }
  }
}

/** Calls `listener` when the payment shown changes; returns the unsubscribe function. */
export function subscribeCardPayments(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The payment shown, if any. */
export function currentCardPayment(): CardPayment | null {
  return current;
}

/** The panel of the payment shown closed: the next one, if any, shows. */
export function closeCardPayment(payment: CardPayment): void {
  if (payment !== current || payment.isBusy()) return;
  payment.close();
  current = next;
  next = null;
  changed();
}

/** Forgets every payment (tests; another account). */
export function resetCardPayments(): void {
  current?.close();
  next?.close();
  current = next = null;
  seen.clear();
  changed();
}

function offer(payment: CardPayment): void {
  if (current?.isBusy()) {
    next?.supersede();
    next = payment;
  } else {
    current?.supersede();
    current = payment;
  }
  payment.start();
  changed();
}

/**
 * Takes a wake packet (as sent: `{epk, iv, ct}`) received at `receivedAt` (ms) for the cards of
 * `walletId`, this device's account. Dropped without a word when it is older than a tap's session,
 * does not open with the device's key, names a relay none of the account's active cards uses, or
 * was taken already: anyone who knows the device's public key can send one.
 */
export async function receiveCardWake(
  raw: unknown,
  receivedAt: number,
  walletId: string,
  options: CardPaymentOptions = {}
): Promise<CardPayment | null> {
  const packet = parseWakePacket(raw);
  return packet ? takeCardWake(packet, receivedAt, walletId, options) : null;
}

/** receiveCardWake, for a packet already read (the relay's pending packets). */
export async function takeCardWake(
  packet: WakePacket,
  receivedAt: number,
  walletId: string,
  options: CardPaymentOptions = {}
): Promise<CardPayment | null> {
  const now = Date.now();
  if (!Number.isFinite(receivedAt) || now - receivedAt > WAKE_MAX_AGE_MS) return null;
  const cards = await activeCardsOnDevice(walletId);
  if (cards.length === 0) return null;
  const wake = openWakePacket((await loadDeviceKey()).secretKey, packet);
  if (!wake) return null;
  const onRelay = cards.filter((card) => card.relayHost === wake.relay);
  if (onRelay.length === 0) return null;
  for (const [session, at] of seen) if (now - at > WAKE_MAX_AGE_MS) seen.delete(session);
  if (seen.has(wake.session)) return null;
  seen.set(wake.session, now);
  // Before the keys tell which card it is: the lowest ceiling of the cards on that relay (two cards
  // on one relay with two ceilings: the higher one's payments above the lower are refused).
  const ceiling = onRelay.reduce(
    (lowest, card) => (card.maxPaymentSats < lowest ? card.maxPaymentSats : lowest),
    MAX_CARD_PAYMENT_SATS
  );
  const payment = new CardPayment(
    { ...wake, receivedAt },
    {
      walletId,
      maxPaymentSats: ceiling,
      cards: onRelay.map(({ cardId, walletGeneration }) => ({ cardId, walletGeneration }))
    },
    { ...options, onPaid: paid }
  );
  offer(payment);
  return payment;
}

/**
 * Open-app mode (contract v2): the wake packets the relays of the open account's active cards keep
 * for this phone (a minute after each tap, each given once), for a phone that the notification did
 * not reach. Needs the account open (each channel's secret derives from the wallet). A relay that
 * does not answer is passed over: the notification may still come.
 */
export function readPendingCardWakes(options: CardPaymentOptions = {}): Promise<void> {
  return withCardAccess(async (access) => {
    const cards = (await cardStatesOnDevice(access)).filter((state) => state.status === "active");
    for (const card of cards) {
      const secret = channelSecretOf(access.root, card.cardId, card.relayHost);
      let packets: WakePacket[];
      try {
        packets = await fetchPendingPackets(card.relayHost, secret);
      } catch (error) {
        logFailure("Reading a card's pending packets failed", error);
        continue;
      } finally {
        secret.fill(0);
      }
      for (const packet of packets) {
        await takeCardWake(packet, Date.now(), access.walletId, options);
      }
    }
  });
}
