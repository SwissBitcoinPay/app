import { useEffect } from "react";
import { AppState } from "react-native";

import { MOVE_RECORDS_MARGIN_SECONDS } from "@/config/relays";
import { getAccountWalletId } from "@/features/account/session";
import { ownerDeviceKeys, ownerDevicesShared } from "@/features/team/owner-device";
import { invoiceNetwork } from "@/features/terminal/invoice";
import { getTerminalProfile } from "@/features/terminal/profile-cache";
import { loadBusinessRegistry } from "@/features/terminal/registry-key";
import { logFailure } from "@/lib/log/log";
import { currentRelays } from "@/lib/relays/current";
import { sameRelayList } from "@/lib/relays/list";
import { liveRelays } from "@/lib/relays/retired";
import { fetchMoved } from "@/lib/relays/moved";
import { copyMemberDeclarations, copyMemberRecords } from "@/lib/team/member-records";
import type { OwnerTerminalProfile } from "@/lib/terminal/model";

import { saveDeviceRelays } from "./device-relays";

/** How often one of the owner's devices looks for a move of the account's relays. */
export const MOVED_CHECK_INTERVAL_MS = 5 * 60 * 1000;

/** Moves followed in one look: each list names the next one (src/lib/relays/moved.ts). */
const MAX_HOPS = 3;

/**
 * Looks once for the notice of a move of account `walletId`'s relays on this device's list, and
 * follows it (up to MAX_HOPS moves): the device's list becomes the account's new one (no
 * transition period), and the sales and links it recorded on the list left since the
 * change go to the new one (owner-device.ts: where the owner reads them), with their declarations
 * in the registry ("Wallet": who took each payment). Only while no account is
 * open here: an open account's list is the device's already (session.ts). Never rejects.
 */
export async function followRelaysMove(walletId: string, backupKey: string): Promise<void> {
  try {
    // The secret the notice is sealed for, kept when the account opened here (owner-device.ts).
    const shared = await ownerDevicesShared(walletId);
    if (!shared) return;
    for (let hop = 0; hop < MAX_HOPS; hop += 1) {
      if (getAccountWalletId() !== null) return;
      const relays = [...currentRelays()];
      // Read and copied from on its relays but those sattle.me retired (retired.ts), as the owner
      // moves the account away from them.
      const live = liveRelays(relays);
      const found = await fetchMoved(backupKey, shared, live);
      if (found.status !== "found" || sameRelayList(found.moved.relays, relays)) return;
      if (getAccountWalletId() !== null) return;
      await saveDeviceRelays(found.moved.relays);
      const keys = await ownerDeviceKeys(walletId);
      if (keys) {
        const since = found.moved.at - MOVE_RECORDS_MARGIN_SECONDS;
        void copyMemberRecords(keys, since, live, found.moved.relays);
        // And the declarations of its sales there (copyMemberDeclarations), with the business's
        // registry key this device holds.
        // Unreadable: the device's own copy above goes all the same, and the next moves are followed.
        const registry = await getTerminalProfile()
          .then((profile) => (profile ? loadBusinessRegistry(profile) : null))
          .catch(() => null);
        if (registry) {
          void copyMemberDeclarations(
            keys,
            registry.key,
            invoiceNetwork(),
            since,
            live,
            found.moved.relays
          );
        }
      }
    }
  } catch (error) {
    logFailure("Following the account's relays failed", error);
  }
}

/**
 * One of the owner's devices, also in till mode: looks for a move of the account's relays at
 * launch, when the app comes back to the foreground and every MOVED_CHECK_INTERVAL_MS.
 */
export function useRelaysMoveWatch(profile: OwnerTerminalProfile): void {
  const { walletId, backupKey } = profile;
  useEffect(() => {
    const look = () => void followRelaysMove(walletId, backupKey);
    look();
    const timer = setInterval(look, MOVED_CHECK_INTERVAL_MS);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") look();
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [walletId, backupKey]);
}
