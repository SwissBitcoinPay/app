import { catalogReaderOf, sameChannelCatalog, type ChannelCatalog } from "@/lib/catalog/reader";
import type { CatalogReader } from "@/lib/team/keys";
import { CATALOG_RECORD_VERSION, type TerminalProfile } from "@/lib/terminal/model";
import { loadCatalogRecord, saveCatalogRecord } from "@/lib/terminal/profile";

import {
  accountRecord,
  loadAccountRecord,
  saveAccountRecord,
  useAccountRecord
} from "./account-record";

/*
 * The business's catalogue's reading keys on this device (ChannelCatalog):
 * the point of sale lists the articles with them, in till mode too, when the account is closed.
 * The owner's device saves them once its team's channels are in step (owner.ts,
 * syncTeamChannels), an employee's from its channel (member.ts); none (null) when its channel
 * carries none (an owner's app before then), and once the employee left the business.
 */

const catalogs = accountRecord<ChannelCatalog | null>({
  read: async () => {
    const saved = await loadCatalogRecord();
    return saved ? { account: saved.account, value: saved.reader } : null;
  },
  write: (account, reader) =>
    saveCatalogRecord({ version: CATALOG_RECORD_VERSION, account, reader }),
  same: sameChannelCatalog
});

/**
 * Saves the catalogue's reading keys of `account` (profileAccount), as a channel carries them
 * (channelCatalogOf), null for none, unless they are the ones saved.
 */
export function saveCatalogKeys(account: string, catalog: ChannelCatalog | null): Promise<void> {
  return saveAccountRecord(catalogs, account, catalog);
}

/** The catalogue's reading keys of `profile`'s account on this device, null without. */
export async function loadCatalogReader(profile: TerminalProfile): Promise<CatalogReader | null> {
  const saved = await loadAccountRecord(catalogs, profile);
  return saved ? catalogReaderOf(saved) : null;
}

/**
 * The catalogue's reading keys of `profile`'s account, as a channel carries them: undefined while
 * they are read, null without.
 */
export function useCatalogKeys(profile: TerminalProfile): ChannelCatalog | null | undefined {
  return useAccountRecord(catalogs, profile);
}
