import { engineRuntimeHost } from "@/lib/engine/host";

/*
 * Same API as card-keychain.ts, in the iOS extension's engine (src/lib/engine/): the card items the
 * app shares, read through the host (EngineRuntimeHost.cardItem: the app group's keychain group,
 * service CARD_SHARED_SERVICE). Read only: the app is their one writer (docs/ios-card-payments.md,
 * "Shared state"), and moves them there itself.
 */

export const CARD_SHARED_SERVICE = "card-shared";

export function resetCardItemMoves(): void {}

export async function getCardItem(key: string): Promise<string | null> {
  return engineRuntimeHost().cardItem(key);
}

export async function setCardItem(_key: string, _value: string): Promise<void> {
  throw new Error("The app's card items are written by the app only");
}

export async function deleteCardItem(_key: string): Promise<void> {
  throw new Error("The app's card items are removed by the app only");
}
