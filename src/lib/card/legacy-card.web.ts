import { CardError, type Ntag424 } from "./ntag424";

/*
 * Web stub of legacy-card.ts. Card migration is NFC, so native only (nfc-session.web.ts): a browser
 * never reaches these.
 */

export type LegacyCard = {
  url: string;
  p: string;
  c: string;
  uid: string;
  cardId: string;
  closed?: boolean;
};

export class LegacyServerUnavailableError extends Error {
  constructor(cause: unknown) {
    super("The v2 server could not reset the card", { cause });
    this.name = "LegacyServerUnavailableError";
  }
}

export class LegacyCardDisabledError extends Error {
  constructor(cause?: unknown) {
    super("The v2 card is locked or disabled", cause === undefined ? undefined : { cause });
    this.name = "LegacyCardDisabledError";
  }
}

export type LegacyWipeErrorCode =
  "masterKeyRefused" | "otherCard" | "notBlank" | "balanceRemains" | "paymentPending";

export class LegacyWipeError extends Error {
  readonly code: LegacyWipeErrorCode;

  constructor(code: LegacyWipeErrorCode, cause?: unknown) {
    super(`Legacy card wipe failed: ${code}`, cause === undefined ? undefined : { cause });
    this.name = "LegacyWipeError";
    this.code = code;
  }
}

/** No card migration on the web. */
export async function detectLegacyCard(
  _card: Ntag424,
  _root: Uint8Array
): Promise<LegacyCard | null> {
  return null;
}

export async function wipedLegacyUid(_card: Ntag424): Promise<Uint8Array | null> {
  return null;
}

export async function wipeLegacyCard(_card: Ntag424, _uidHex: string): Promise<void> {
  throw new CardError("unsupported", "Cards are migrated from the app on a phone");
}
