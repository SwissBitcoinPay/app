import type { FakeNtag424 } from "./ntag424";

/*
 * A fake of react-native-nfc-manager 4.2.0, for the tests that hold a card to the phone
 * (src/lib/card/nfc-session.ts): `jest.mock("react-native-nfc-manager", () =>
 * require("../../jest/nfc-manager"))` in the test file. Not registered for every test: the point
 * of sale's reading (src/lib/nfc/boltcard.ts) keeps seeing no NFC elsewhere.
 *
 * `holdCard(card)` puts a FakeNtag424 in the field: the next `requestTechnology(IsoDep)` gets it.
 * `cancelNextRequest()` makes the next request end as the holder closing the iOS sheet would.
 * `waitForCard()` makes a request without a card in the field wait, as a phone does, until a card
 * is held (`holdCard`) or the request is cancelled (`cancelTechnologyRequest`). `turnNfcOff()`:
 * NFC off in Android's settings (`isEnabled` false); `removeNfc()`: a phone without NFC at all. `calls` records the requests, the sheet's
 * messages and the opening of Android's NFC settings.
 *
 * `closeLater()`: the session's ends (`cancelTechnologyRequest`, `invalidateSessionWithErrorIOS`)
 * answer once Core NFC says it closed (`closeSession()`, or never), as the library does on iOS
 * (`didInvalidateWithError`); meanwhile, another end and a new request are refused at once
 * ("Duplicated registration"), and the request still waiting for a card ends with the close.
 */

class NfcErrorBase extends Error {}
class UserCancel extends NfcErrorBase {}

export const NfcError = { NfcErrorBase, UserCancel };
export const NfcTech = { Ndef: "Ndef", IsoDep: "IsoDep" } as const;

let card: FakeNtag424 | null = null;
let cancelNext = false;
let active = false;
let waitsForCard = false;
let enabled = true;
let supported = true;
/** The request waiting for a card (`waitForCard`). */
let waiting: { resolve: () => void; reject: (error: Error) => void } | null = null;
let closesLater = false;
/** The end waiting for the session to close (`closeLater`). */
let closing: (() => void) | null = null;

export const calls: string[] = [];

export function holdCard(next: FakeNtag424 | null): void {
  card = next;
  if (next && waiting && !closing) {
    const request = waiting;
    waiting = null;
    request.resolve();
  }
}

export function waitForCard(): void {
  waitsForCard = true;
}

/** Whether a request waits for a card (`waitForCard`). */
export function awaitingCard(): boolean {
  return waiting !== null;
}

export function turnNfcOff(): void {
  enabled = false;
}

export function removeNfc(): void {
  supported = false;
}

export function cancelNextRequest(): void {
  cancelNext = true;
}

export function closeLater(): void {
  closesLater = true;
}

/** Whether an end waits for the session to close (`closeLater`). */
export function sessionClosing(): boolean {
  return closing !== null;
}

/** Core NFC says the session closed (`closeLater`): its request and its end answer. */
export function closeSession(): void {
  const closed = closing;
  closing = null;
  endWaitingRequest();
  closed?.();
}

function endWaitingRequest(): void {
  if (waiting) {
    const request = waiting;
    waiting = null;
    request.reject(new Error("Request cancelled"));
  }
}

/** An end of the session: at once, or once it closed (`closeLater`). */
function endSession(): Promise<void> {
  if (closing) return Promise.reject(new Error("Duplicated registration"));
  const open = active || waiting !== null;
  active = false;
  if (!closesLater || !open) {
    endWaitingRequest();
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    closing = resolve;
  });
}

export function resetNfcManager(): void {
  card = null;
  cancelNext = false;
  active = false;
  waitsForCard = false;
  enabled = true;
  supported = true;
  waiting = null;
  closesLater = false;
  // An end an earlier test left waiting answers: none holds this test's sessions.
  closing?.();
  closing = null;
  calls.length = 0;
}

export function requestActive(): boolean {
  return active;
}

const manager = {
  isSupported: async () => supported,
  start: async () => undefined,
  isEnabled: async () => enabled,
  requestTechnology: async (tech: string | string[], options?: { alertMessage?: string }) => {
    calls.push(`requestTechnology ${String(tech)} ${options?.alertMessage ?? ""}`);
    if (closing) throw new Error("Duplicated registration");
    if (active) throw new Error("You can only issue one request at a time");
    if (cancelNext) {
      cancelNext = false;
      throw new UserCancel();
    }
    if (!card && waitsForCard) {
      await new Promise<void>((resolve, reject) => {
        waiting = { resolve, reject };
      });
    }
    if (!card) throw new Error("No tag in the field");
    active = true;
    card.powerCycle();
    return tech;
  },
  getTag: async () =>
    card
      ? {
          // Its anticollision UID: random with Random ID.
          id: Array.from(card.anticollisionUid(), (b) => b.toString(16).padStart(2, "0"))
            .join("")
            .toUpperCase()
        }
      : null,
  isoDepHandler: {
    transceive: async (bytes: number[]) => {
      if (!active || !card) throw new Error("Not connected");
      return Array.from(await card.transceive(Uint8Array.from(bytes)));
    }
  },
  setAlertMessageIOS: async (message: string) => {
    calls.push(`setAlertMessageIOS ${message}`);
  },
  invalidateSessionWithErrorIOS: async (message: string) => {
    calls.push(`invalidateSessionWithErrorIOS ${message}`);
    await endSession();
  },
  goToNfcSetting: async () => {
    calls.push("goToNfcSetting");
    return true;
  },
  // Its failures are not thrown (the library's `throwOnError`, false by default).
  cancelTechnologyRequest: async () => {
    calls.push("cancelTechnologyRequest");
    await endSession().catch(() => undefined);
  }
};

export default manager;
