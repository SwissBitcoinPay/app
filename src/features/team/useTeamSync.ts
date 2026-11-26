import { useEffect } from "react";
import { AppState } from "react-native";

import {
  getAccountSettings,
  getAccountTeamKeys,
  getAccountWalletId,
  whenAccountSynced
} from "@/features/account/session";
import { archiveDeclarations } from "@/features/activity/archive";
import { keepInvoices } from "@/features/invoices/invoices";
import { useUnlocked } from "@/features/navigation/lock";
import { watchWhileActive } from "@/features/relays/live-watch";
import { replaceRetiredRelaysInBackground } from "@/features/relays/retired-relays";
import { applyToThisDevice } from "@/features/settings/account-settings";
import { copyPendingDeclarations, copyPendingRecords } from "@/features/settings/declarations-copy";
import { syncAddressDescriptionAtUnlock } from "@/features/terminal/address-description";
import { syncOnchainPool } from "@/features/terminal/onchain-pool";
import { saveBusinessRegistry } from "@/features/terminal/registry-key";
import { logFailure } from "@/lib/log/log";
import { deriveBusinessRegistry } from "@/lib/team/keys";

import { syncIntegrationAddresses } from "./integration-addresses";
import { syncMembership, watchMembership } from "./member";
import { syncTeamChannels } from "./owner";
import { registerOwnerDevice } from "./owner-device";
import { syncEmployeeAddresses } from "./owner-addresses";

/**
 * The owner's device: once this device's account is open (the passkey), the business's registry
 * key is saved on it (src/features/terminal/registry-key.ts), with its choice of on-chain payments
 * (src/features/terminal/options.ts), the employees' channels are brought
 * in step with the account in the background (owner.ts), the catalogue with its epoch and the
 * point of sale's keys of it, then their lots of on-chain addresses are filled up again
 * (owner-addresses.ts), and the integrations' (integration-addresses.ts). This device's point of
 * sale's on-chain addresses are filled up again too (onchain-pool.ts). The device is added to
 * the account's devices (owner-device.ts): it publishes its sales and links from then on. A relay
 * sattle.me retired is replaced in the account's list (retired-relays.ts).
 */
export function useTeamChannelsSync(walletId: string): void {
  const unlocked = useUnlocked(walletId);
  useEffect(() => {
    if (!unlocked) return;
    const team = getAccountTeamKeys();
    if (team) {
      void saveBusinessRegistry(walletId, deriveBusinessRegistry(team)).catch((error: unknown) => {
        logFailure("Saving the registry key failed", error);
      });
    }
    // The business's settings, for this device's point of sale in till mode (its name, currency,
    // choice of on-chain payments, logo): from the settings as the relays left them (another of
    // the owner's devices may have changed them), as the employees' channels get them
    // (syncTeamChannels), and only while this account is open.
    void whenAccountSynced()
      .then(async () => {
        const settings = getAccountSettings();
        if (!settings || getAccountWalletId()?.toLowerCase() !== walletId.toLowerCase()) return;
        await applyToThisDevice(settings);
      })
      .catch((error: unknown) => {
        logFailure("Saving the point of sale's options failed", error);
      });
    // The records a change of relays left to copy (moved-records.ts), then its registry's
    // declarations (declarations-copy.ts): an interrupted copy, a transition over while the
    // account was closed. Then the owner's copy of the declarations of the months over a year old,
    // and its yearly refresh (archive.ts).
    void whenAccountSynced()
      .then(() => copyPendingRecords())
      .then(() => copyPendingDeclarations())
      .then(() => archiveDeclarations());
    // The relays sattle.me retired, replaced in the account's list without a word to its owner
    // (src/features/relays/retired-relays.ts): nothing to do for a list without any.
    void replaceRetiredRelaysInBackground();
    // The invoices of "New invoice", on every relay of the account and signed again once a
    // year: relays drop or refuse old events (src/lib/invoice/upkeep.ts).
    void whenAccountSynced().then(() => keepInvoices());
    void registerOwnerDevice();
    // The name payers and card holders see (the Lightning address's description), as the business
    // name of the settings the relays left (address-description.ts): renamed on another device, or
    // an earlier update that failed.
    void syncAddressDescriptionAtUnlock();
    // This device's point of sale's on-chain addresses, as soon as one is missing (onchain-pool.ts),
    // alongside the rest: the wallet's connection is shared (background-wallet.ts).
    void syncOnchainPool(walletId);
    // Then the employees' lots of on-chain addresses, then the integrations' (one after the other;
    // the wallet's connection shared with the copies above, background-wallet.ts): at each login or
    // unlock (an employee's lot also once it is invited, EmployeesScreen; an assistant's and an
    // integration's once it is created, NewIntegrationSheet).
    void syncTeamChannels()
      .then(() => syncEmployeeAddresses())
      .then(() => syncIntegrationAddresses());
  }, [unlocked, walletId]);
}

/**
 * How often an employee's device reads its channel while it shows: a point
 * of sale left open all day follows a change of the business's relays, or a removal, within this.
 */
export const MEMBERSHIP_CHECK_INTERVAL_MS = 5 * 60 * 1000;

/**
 * An employee's device: its channel is read at launch, whenever the app comes back to the
 * foreground and every MEMBERSHIP_CHECK_INTERVAL_MS (member.ts). A removal makes the device forget
 * the business; a change of the business's relays, follow it.
 */
export function useMembershipSync(): void {
  useEffect(() => {
    void syncMembership();
    const timer = setInterval(() => void syncMembership(), MEMBERSHIP_CHECK_INTERVAL_MS);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void syncMembership();
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, []);
}

/**
 * An employee's device while `active` (an invoice shows): a subscription to
 * its channel stays open (watchMembership), so that a removal makes the device forget the business
 * as soon as a relay takes it, its invoice with it.
 */
export function useMembershipWatch(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    return watchWhileActive(watchMembership);
  }, [active]);
}
