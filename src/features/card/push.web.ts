/*
 * Same API as push.ts. The web app neither pairs nor pays cards: no push token.
 */

export const CARD_PAYMENTS_CHANNEL = "card-payments";

export type PushToken =
  | { status: "granted"; token: string }
  | { status: "denied" }
  | { status: "unavailable" }
  | { status: "socket" };

export async function notificationsAllowed(): Promise<boolean> {
  return false;
}

export async function notificationsAskable(): Promise<boolean> {
  return false;
}

export async function cardPushToken(
  _channelName: string,
  _options: { ask: boolean }
): Promise<PushToken> {
  return { status: "unavailable" };
}
