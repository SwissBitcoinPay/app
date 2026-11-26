import type { TFunction } from "i18next";

/** Same API as offer.ts: the web app plans no notification (reminders.web.ts), nothing to offer. */

export async function shouldOfferNotifications(): Promise<boolean> {
  return false;
}

export async function markNotificationsOffered(_at: number): Promise<void> {}

export async function askNotifications(_t: TFunction): Promise<boolean> {
  return false;
}
