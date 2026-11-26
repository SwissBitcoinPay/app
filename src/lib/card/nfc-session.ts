import { Platform } from "react-native";

import { getCardReading, untilClosed } from "@/lib/nfc/boltcard";
import { expectSystemUi, withCardPause } from "@/lib/system-ui";

import { CardError, Ntag424 } from "./ntag424";
import { UID_LENGTH } from "./sun";

type NfcModule = typeof import("react-native-nfc-manager");

/** Required lazily, as src/lib/nfc/boltcard.ts: a build without the native module must not crash. */
function loadNfc(): NfcModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy on purpose, see above
    return require("react-native-nfc-manager") as NfcModule;
  } catch {
    return null;
  }
}

/*
 * A card held to the phone, over ISO-DEP (react-native-nfc-manager 4.2.0, `NfcTech.IsoDep`): on
 * iOS, Core NFC hands the tag to the app because it answers the NDEF application's identifier,
 * D2760000850101, declared in app.config.ts (`selectIdentifiers`). Native only: Web NFC reads NDEF
 * and nothing else (nfc-session.web.ts).
 */

/** The card in the field, and the UID it gave at anticollision (unproven, see ResetOptions). */
export type CardSession = { card: Ntag424; tagUid: Uint8Array | null };

/** Whether this device can hold a card to program it: NFC present (and on, on Android). */
export async function canProgramCards(): Promise<boolean> {
  return (await getCardReading()) !== "none";
}

/** Whether this device has NFC at all, on or off: its settings are of use then only. */
export async function hasNfc(): Promise<boolean> {
  const nfc = loadNfc();
  if (!nfc) return false;
  try {
    return await nfc.default.isSupported();
  } catch {
    return false;
  }
}

/**
 * Android's NFC settings, where NFC is turned on (react-native-nfc-manager 4.2.0,
 * `goToNfcSetting`: `Settings.ACTION_NFC_SETTINGS`): false where there is no such screen (a phone
 * without NFC, iOS, which has no NFC setting).
 */
export async function openNfcSettings(): Promise<boolean> {
  const nfc = loadNfc();
  if (Platform.OS !== "android" || !nfc) return false;
  try {
    // The holder comes back from them: not leaving the app (src/lib/system-ui.ts).
    expectSystemUi();
    return await nfc.default.goToNfcSetting();
  } catch {
    return false;
  }
}

/** Thrown by withCardSession when cancelCardSession ended it. */
class CardSessionCancelled extends Error {
  constructor() {
    super("Cancelled");
    this.name = "CardSessionCancelled";
  }
}

/** Whether the holder closed the system's NFC sheet (iOS), or cancelCardSession ended it. */
export function isSessionCancelled(error: unknown): boolean {
  if (error instanceof CardSessionCancelled) return true;
  const nfc = loadNfc();
  return nfc !== null && error instanceof nfc.NfcError.UserCancel;
}

/** The session in progress was cancelled (cancelCardSession). */
let cancelled = false;

/**
 * Ends the session in progress, if any ("Cancel": Android has no system sheet to close). A card
 * being programmed is left as the programming had brought it: the next attempt goes on from there.
 */
export function cancelCardSession(): void {
  cancelled = true;
  const nfc = loadNfc();
  if (nfc) release(nfc);
}

/**
 * The end of the last session's request: on Android, react-native-nfc-manager unregisters its tag
 * events a second after a request ends (`delayMsAndroid`), as for src/lib/nfc/boltcard.ts. The
 * next session waits for it.
 */
let released: Promise<void> = Promise.resolve();

/** Ends the request in progress, if any (src/lib/nfc/boltcard.ts's `release`, which says why). */
function release(nfc: NfcModule): void {
  released = Promise.all([released, untilClosed(nfc.default.cancelTechnologyRequest())]).then(
    () => undefined
  );
}

function uidOf(id: unknown): Uint8Array | null {
  if (typeof id !== "string" || !/^[0-9a-fA-F]{14}$/.test(id)) return null;
  const bytes = new Uint8Array(UID_LENGTH);
  for (let i = 0; i < UID_LENGTH; i++) bytes[i] = parseInt(id.slice(2 * i, 2 * i + 2), 16);
  return bytes;
}

function bytesOf(answer: unknown): Uint8Array {
  if (
    !Array.isArray(answer) ||
    !answer.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255)
  ) {
    throw new Error("Not an APDU response");
  }
  return Uint8Array.from(answer as number[]);
}

export type SessionMessages = {
  /** iOS: the system sheet's instruction while it waits for the card. */
  alert: string;
  /** iOS: shown in the sheet as it closes after `run` resolved. */
  success?: string;
  /** iOS: shown in the sheet as it closes after `run` failed. */
  failure?: string;
};

/**
 * Waits for a card, runs `run` with it, then ends the session whatever happens: one card, one
 * session. Rejects with CardError("unsupported") when this device has no usable NFC. `stopped`
 * (the holder cancelled or left) is checked as the session would open, then once the card is in
 * the field, before `run`: cancelCardSession ends a request made, not one still to come, and a
 * cancellation that came with the card stops it before any command reaches it.
 */
export async function withCardSession<T>(
  messages: SessionMessages,
  run: (session: CardSession) => Promise<T>,
  { stopped = () => false }: { stopped?: () => boolean } = {}
): Promise<T> {
  const nfc = loadNfc();
  if (!nfc || !(await canProgramCards())) {
    throw new CardError("unsupported", "NFC is not available on this device");
  }
  await released;
  const manager = nfc.default;
  cancelled = false;
  if (stopped()) throw new CardSessionCancelled();
  // Android hands the card over in a new intent, which pauses the app (the library's foreground
  // dispatch): that pause only is not its holder leaving it (src/lib/system-ui.ts).
  return withCardPause(async () => {
    let succeeded = false;
    try {
      await manager.requestTechnology(nfc.NfcTech.IsoDep, { alertMessage: messages.alert });
      const tag = await manager.getTag();
      if (cancelled || stopped()) throw new CardSessionCancelled();
      const card = new Ntag424(async (apdu) =>
        bytesOf(await manager.isoDepHandler.transceive(Array.from(apdu)))
      );
      const result = await run({ card, tagUid: uidOf(tag?.id) });
      succeeded = true;
      return result;
    } catch (error) {
      throw cancelled ? new CardSessionCancelled() : error;
    } finally {
      if (Platform.OS === "ios") {
        const text = succeeded ? messages.success : messages.failure;
        if (text) {
          // The sheet closes with its message: success as a check mark, failure as an error, which
          // react-native-nfc-manager 4.2.0 answers once the session closed (see untilClosed).
          await untilClosed(
            succeeded
              ? manager.setAlertMessageIOS(text)
              : manager.invalidateSessionWithErrorIOS(text)
          );
        }
      }
      release(nfc);
      await released;
    }
  });
}
