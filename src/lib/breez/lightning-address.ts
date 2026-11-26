/**
 * The wallet's Lightning address on the SDK's LNURL domain (`lnurlDomain` of the default config:
 * breez.tips on mainnet). The Breez LNURL
 * server creates invoices for the wallet's identity key on its own: the point of sale takes
 * payments with the address alone, no wallet connected (src/lib/lightning/lnurl.ts).
 */

/** The SDK calls used, the same on native and web. */
export type LightningAddressApi = {
  getLightningAddress(): Promise<{ lightningAddress: string; username: string } | undefined>;
  checkLightningAddressAvailable(request: { username: string }): Promise<boolean>;
  registerLightningAddress(request: {
    username: string;
    description: string | undefined;
  }): Promise<{ lightningAddress: string }>;
};

/**
 * Usernames tried in turn (a prefix then the first 10 hex characters of the identity key). Longer
 * prefixes only in the unlikely case of a collision. The prefix is "sattleme". An address
 * registered already keeps its name
 * (ensureLightningAddress keeps the one the server holds).
 */
export function lightningAddressUsernames(walletId: string): string[] {
  const id = walletId.toLowerCase();
  return [10, 16, 24].map((length) => `sattleme${id.slice(0, length)}`);
}

/**
 * The wallet's Lightning address: the one registered already (by this device or another), else a
 * new one. `description` is what payers see: the business name for the account's wallet; for a
 * card's, undefined, the server's own ("Pay to user@domain", the domain asked: since spark-sdk
 * 0.28 the SDK sends none and the LNURL server writes it, lnurl/src/user.rs `shown_description`;
 * 0.27.2 sent that very text itself), which tells nothing of the account.
 */
export async function ensureLightningAddress(
  api: LightningAddressApi,
  walletId: string,
  description: string | undefined
): Promise<string> {
  const existing = await api.getLightningAddress();
  if (existing) return existing.lightningAddress;
  for (const username of lightningAddressUsernames(walletId)) {
    if (!(await api.checkLightningAddressAvailable({ username }))) continue;
    const registered = await api.registerLightningAddress({ username, description });
    return registered.lightningAddress;
  }
  throw new Error("No Lightning address username available");
}

/**
 * Brings the description the LNURL server holds for the wallet's address to `description` (the
 * business name, the name payers and card holders see): registering the same username again with
 * another description updates it (spark-sdk 0.28.4, `upsert_user`: one transaction keyed on the
 * wallet's key, the name never released meanwhile, no registration counted). What the server holds
 * is read with `served` (its public payRequest, metadata.ts): the SDK's own copy is a local cache,
 * stale when another device changed it. Before the change, `beforeChange` keeps the metadata
 * served until then (invoices made under it stay the merchant's): nothing changes when it fails.
 * Without an address, nothing is registered; an address the server no longer serves (`served`
 * rejects) is never registered again. The request is signed by the wallet: the server refuses a
 * name another wallet holds. Resolves with what was done; rejects when the server could not be
 * read, refused, or still serves another description afterwards.
 */
export async function keepAddressDescription(
  api: LightningAddressApi,
  description: string,
  served: (address: string) => Promise<{ name: string; metadata: string }>,
  beforeChange: (formerMetadata: string) => Promise<void>
): Promise<"noAddress" | "upToDate" | "updated"> {
  const existing = await api.getLightningAddress();
  if (!existing) return "noAddress";
  const former = await served(existing.lightningAddress);
  if (former.name === description) return "upToDate";
  await beforeChange(former.metadata);
  await api.registerLightningAddress({ username: existing.username, description });
  if ((await served(existing.lightningAddress)).name !== description) {
    throw new Error("The LNURL server kept another description");
  }
  return "updated";
}
