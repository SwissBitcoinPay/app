import { Paths } from "expo-file-system";

import { CARD_WALLETS_NAME, cardWalletPath } from "./card-wallet-names";

/**
 * Directory of the SDK's local database (payments, settings, sync state; not the seed, which
 * comes from the passkey at each sign-in). The SDK creates it and keeps one database per
 * network and wallet below it. Never rename it: installed apps keep their wallet state there.
 */
export const STORAGE_DIR_NAME = "breez-sdk-spark";

/**
 * Filesystem path of a `file://` URI. expo-file-system returns URIs, the SDK (Rust) expects a
 * plain path, like `RNFS.DocumentDirectoryPath` in the Breez docs.
 */
export function fileUriToPath(uri: string): string {
  const prefix = "file://";
  if (!uri.startsWith(prefix)) throw new Error(`Not a file:// URI: ${uri}`);
  const path = decodeURIComponent(uri.slice(prefix.length)).replace(/\/+$/, "");
  if (!path.startsWith("/")) throw new Error(`Not an absolute file URI: ${uri}`);
  return path;
}

/** Inside the app sandbox, in the documents directory (not a cache the system may clear). */
export function getStorageDir(): string {
  return `${fileUriToPath(Paths.document.uri)}/${STORAGE_DIR_NAME}`;
}

/**
 * The storage directory of a card's wallet (card-wallet-names.ts), in the documents directory as
 * the account's: `breez-sdk-spark-cards/<card id>/<generation>`.
 */
export function getCardWalletStorageDir(cardId: string, generation: number): string {
  const documents = fileUriToPath(Paths.document.uri);
  return `${documents}/${CARD_WALLETS_NAME}/${cardWalletPath(cardId, generation)}`;
}
