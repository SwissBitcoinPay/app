import { CardError, type Ntag424 } from "./ntag424";

/*
 * Same API as nfc-session.ts. Web NFC reads and writes NDEF only, never ISO-DEP APDUs: a card is
 * programmed or reset from the app on the phone only, the web app sends the holder to the phone
 * (src/app/onboarding/card.tsx).
 */

export type CardSession = { card: Ntag424; tagUid: Uint8Array | null };

export type SessionMessages = { alert: string; success?: string; failure?: string };

export async function canProgramCards(): Promise<boolean> {
  return false;
}

export async function hasNfc(): Promise<boolean> {
  return false;
}

export async function openNfcSettings(): Promise<boolean> {
  return false;
}

export function isSessionCancelled(_error: unknown): boolean {
  return false;
}

export function cancelCardSession(): void {}

export async function withCardSession<T>(
  _messages: SessionMessages,
  _run: (session: CardSession) => Promise<T>,
  _options: { stopped?: () => boolean } = {}
): Promise<T> {
  throw new CardError("unsupported", "Cards are programmed from the app on a phone");
}
