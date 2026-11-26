/*
 * Same API as useCardWakes.ts. Cards are paired and paid from the app on a phone only: the web app
 * is never woken for a tap.
 */

export function notificationTimeMs(date: unknown): number {
  if (typeof date !== "number" || !Number.isFinite(date)) return Number.NaN;
  return date < 1e11 ? date * 1000 : date;
}

export function useCardWakes(_walletId: string): void {}
