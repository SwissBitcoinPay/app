/**
 * The BoltCard reader (src/lib/nfc/boltcard.web.ts) in the store screenshots' web build only
 * (./metro.config.js swaps it in): the same API, reading as the device the page shows does, as
 * src/lib/nfc/boltcard.ts tells it in the apps: an iPhone opens its reader on a tap ("tap"),
 * Android listens on its own ("auto"), an iPad reads no card ("none"). capture.mjs sets it
 * (`globalThis`'s CARD_READING) before the app loads; the web's own answer, "none" without Web
 * NFC, when it is not set. No card is ever held to the page: a reading waits until cancelled.
 */
import type * as WebReader from "../../src/lib/nfc/boltcard.web";

/** Where capture.mjs puts the device's reading. */
export const CARD_READING = "__sattleStoreScreenshotsCardReading";

export type CardReading = WebReader.CardReading;
export type CardRead = WebReader.CardRead;

export const getCardReading: typeof WebReader.getCardReading = async () => {
  const reading = (globalThis as Record<string, unknown>)[CARD_READING];
  return reading === "auto" || reading === "tap" ? reading : "none";
};

class CardReadCancelled extends Error {
  constructor() {
    super("Cancelled");
    this.name = "CardReadCancelled";
  }
}

export const isReadCancelled: typeof WebReader.isReadCancelled = (error) =>
  error instanceof CardReadCancelled;

/** A reading that waits for a card, which never comes, until it is cancelled. */
export const readCard: typeof WebReader.readCard = () => {
  let cancel = () => {};
  const lnurl = new Promise<string>((_resolve, reject) => {
    cancel = () => reject(new CardReadCancelled());
  });
  // Not awaited when the screen leaves: its rejection is expected.
  lnurl.catch(() => undefined);
  return { lnurl, cancel: () => cancel() };
};
