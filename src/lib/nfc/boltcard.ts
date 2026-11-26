import { Platform } from "react-native";

import { logFailure } from "@/lib/log/log";
import { withCardPause } from "@/lib/system-ui";
import { within } from "@/lib/within";

import { lnurlFromRecords, type RawRecord } from "./ndef";

type NfcModule = typeof import("react-native-nfc-manager");

/** Required lazily: a build without the native module (Jest, an old binary) must not crash. */
function loadNfc(): NfcModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy on purpose, see above
    return require("react-native-nfc-manager") as NfcModule;
  } catch {
    return null;
  }
}

/**
 * How the point of sale can read a BoltCard on this device:
 * - `auto`: it listens while an invoice is shown (Android, NFC on);
 * - `tap`: a tap opens the system's reading sheet first (iOS: Core NFC only reads in a session);
 * - `none`: no NFC reader (or NFC off on Android): the BoltCard line is not shown.
 * Same API on the web: boltcard.web.ts.
 */
export type CardReading = "auto" | "tap" | "none";

let started: Promise<boolean> | null = null;

async function start(nfc: NfcModule): Promise<boolean> {
  started ??= (async () => {
    try {
      if (!(await nfc.default.isSupported())) return false;
      await nfc.default.start();
      return true;
    } catch {
      return false;
    }
  })();
  return started;
}

export async function getCardReading(): Promise<CardReading> {
  const nfc = loadNfc();
  if (!nfc || !(await start(nfc))) return "none";
  if (Platform.OS === "ios") return "tap";
  try {
    return (await nfc.default.isEnabled()) ? "auto" : "none";
  } catch {
    return "none";
  }
}

/** Thrown when a reading is cancelled by `CardRead.cancel`. */
class CardReadCancelled extends Error {
  constructor() {
    super("Cancelled");
    this.name = "CardReadCancelled";
  }
}

/** Whether a reading ended because it was cancelled: by `cancel`, or by closing the iOS sheet. */
export function isReadCancelled(error: unknown): boolean {
  if (error instanceof CardReadCancelled) return true;
  const nfc = loadNfc();
  return nfc !== null && error instanceof nfc.NfcError.UserCancel;
}

/**
 * How long the end of a request may take before the app goes on without it. react-native-nfc-manager
 * 4.2.0 ends one on iOS once Core NFC tells its session closed (`didInvalidateWithError`), which
 * Apple does not document for a session the app closes; on Android, a second after the request
 * (`delayMsAndroid`). Past this, a session Core NFC never said closed holds no later one: its next
 * request fails ("Duplicated registration") instead of waiting forever.
 */
export const NFC_CLOSE_WAIT_MS = 10_000;

/** Once `ending` (a request's end, or its sheet's) settled, or NFC_CLOSE_WAIT_MS later. */
export async function untilClosed(ending: Promise<unknown>): Promise<void> {
  const settled = ending.then(
    () => true,
    () => true
  );
  if ((await within(settled, NFC_CLOSE_WAIT_MS)) === null) {
    logFailure("An NFC session did not close in time");
  }
}

/**
 * The end of the last reading's request. On Android, react-native-nfc-manager unregisters its tag
 * events a second after a request ends (`delayMsAndroid`): a reading started meanwhile would lose
 * them and never see a card, so it waits for this first. Not awaited by the reading that ends: its
 * card's LNURL is returned at once.
 */
let released: Promise<void> = Promise.resolve();

function release(nfc: NfcModule): void {
  // iOS refuses at once an end asked while another one waits (`cancel`, then the reading's own
  // end): the next reading waits for both.
  released = Promise.all([released, untilClosed(nfc.default.cancelTechnologyRequest())]).then(
    () => undefined
  );
}

export type CardRead = {
  /** The card's LNURL, as written on it; rejects when the reading is cancelled or fails. */
  lnurl: Promise<string>;
  cancel: () => void;
};

/**
 * Waits for one card and reads its LNURL-withdraw (NDEF). On iOS, `alertMessage` is the system
 * sheet's instruction.
 */
export function readCard({ alertMessage }: { alertMessage: string }): CardRead {
  const nfc = loadNfc();
  let cancelled = false;
  const cancel = () => {
    cancelled = true;
    if (nfc) release(nfc);
  };
  const lnurl = (async () => {
    if (!nfc || !(await start(nfc))) throw new Error("NFC is not available");
    await released;
    // Cancelled meanwhile: no request may outlive the reading (one at a time, it would
    // take the next card).
    if (cancelled) throw new CardReadCancelled();
    // Android hands the card over in a new intent, which pauses the app (the library's foreground
    // dispatch): that pause only is not its holder leaving it (src/lib/system-ui.ts).
    return withCardPause(async () => {
      try {
        await nfc.default.requestTechnology(nfc.NfcTech.Ndef, { alertMessage });
        if (cancelled) throw new CardReadCancelled();
        const tag = await nfc.default.getTag();
        const records: RawRecord[] = (tag?.ndefMessage ?? []).map((record) => ({
          tnf: record.tnf,
          type: record.type,
          payload: record.payload
        }));
        const found = lnurlFromRecords(records);
        if (!found) throw new Error("Not a BoltCard");
        return found;
      } finally {
        release(nfc);
      }
    });
  })();
  return { lnurl, cancel };
}
