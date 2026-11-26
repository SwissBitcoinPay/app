/**
 * Same API as wallet-owner-store.ts. The browser holds no words of the v2 app (store.web.ts): no
 * owner is ever kept, nor needed.
 */

export async function readLegacyWalletOwnerText(): Promise<string | null> {
  return null;
}

export async function writeLegacyWalletOwnerText(_text: string): Promise<void> {}

export async function removeLegacyWalletOwnerText(): Promise<void> {}
