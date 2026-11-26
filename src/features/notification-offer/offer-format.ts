/**
 * IRREVERSIBLE: storage key of "Stay informed" answered on this device (NotificationsOffer.tsx).
 * Never rename it: installed apps would offer it again.
 */
export const NOTIFICATIONS_OFFER_KEY = "notifications-offer";

/** Format of the stored record. A change of format needs a new version. */
const NOTIFICATIONS_OFFER_VERSION = 1;

/** The record of the offer answered (`at`: Unix seconds). */
export function serializeNotificationsOffer(at: number): string {
  return JSON.stringify({ version: NOTIFICATIONS_OFFER_VERSION, at });
}

/**
 * Whether the offer was answered on this device: any record, a damaged one or a newer app's
 * included (written by the app all the same: never offered twice).
 */
export function notificationsOffered(stored: string | null): boolean {
  return stored !== null;
}
