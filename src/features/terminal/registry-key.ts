import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";

import type { BusinessRegistry } from "@/lib/registry/registry";
import type { TeamChannel } from "@/lib/team/channel";
import { REGISTRY_RECORD_VERSION, type TerminalProfile } from "@/lib/terminal/model";
import { loadRegistryRecord, saveRegistryRecord } from "@/lib/terminal/profile";

import {
  accountRecord,
  loadAccountRecord,
  saveAccountRecord,
  useAccountRecord
} from "./account-record";

/*
 * The business's registry on this device (src/lib/registry/): its key and the public half of its
 * reading key. The point of sale declares every invoice it shows with them, and every payment link
 * carries them. The owner's device saves them once the account is open (useTeamSync.ts), an
 * employee's from its channel (member.ts). Until then the point of sale declares nothing and shares
 * no payment link (its "Share" shares the code).
 */

const registries = accountRecord<BusinessRegistry>({
  read: async () => {
    const saved = await loadRegistryRecord();
    return saved
      ? {
          account: saved.account,
          value: {
            key: hexToBytes(saved.key),
            reader: saved.reader,
            owner: saved.owner,
            ...(saved.linkKeyReader ? { linkKeyReader: saved.linkKeyReader } : {})
          }
        }
      : null;
  },
  write: (account, registry) =>
    saveRegistryRecord({
      version: REGISTRY_RECORD_VERSION,
      account,
      key: bytesToHex(registry.key),
      reader: registry.reader,
      owner: registry.owner,
      ...(registry.linkKeyReader ? { linkKeyReader: registry.linkKeyReader } : {})
    }),
  same: (a, b) =>
    bytesToHex(a.key) === bytesToHex(b.key) &&
    a.reader === b.reader &&
    a.owner === b.owner &&
    a.linkKeyReader === b.linkKeyReader
});

/** The business's registry an employee's channel carries. */
export function registryOfChannel(
  channel: Extract<TeamChannel, { status: "active" }>
): BusinessRegistry {
  return {
    key: hexToBytes(channel.registryKey),
    reader: channel.registryReader,
    owner: channel.linkOwner,
    ...(channel.linkKeyReader ? { linkKeyReader: channel.linkKeyReader } : {})
  };
}

/** Saves the business's registry of `account` (profileAccount), unless it is the one saved. */
export function saveBusinessRegistry(account: string, registry: BusinessRegistry): Promise<void> {
  return saveAccountRecord(registries, account, registry);
}

/** The business's registry of `profile`'s account on this device, null when it has none. */
export function loadBusinessRegistry(profile: TerminalProfile): Promise<BusinessRegistry | null> {
  return loadAccountRecord(registries, profile);
}

/** The business's registry of `profile`'s account: undefined while it is read, null without. */
export function useBusinessRegistry(profile: TerminalProfile): BusinessRegistry | null | undefined {
  return useAccountRecord(registries, profile);
}
