/*
 * Same API as observe.ts, in the browser: nothing. Expo Observe measures the Android and iOS apps
 * only (expo-observe has no web implementation); the web app is not observed, and has no choice to
 * make ("Settings" shows none).
 */

export const MAX_REPORTS_PER_RUN = 0;

export function startObserve(_variant: string): void {}

export function observeStarted(): boolean {
  return false;
}

export function observeChoice(): boolean | null {
  return null;
}

export function followObserveChoice(_listener: () => void): () => void {
  return () => undefined;
}

export async function saveObserveChoice(_send: boolean): Promise<void> {
  throw new Error("The web app sends nothing to Expo Observe");
}

export function resetObserveChoice(): void {}

export function markObservedFirstRender(): void {}

export function reportUncaught(_error: unknown): void {}
