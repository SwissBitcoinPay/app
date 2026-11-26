import { Directory, Paths } from "expo-file-system";
import * as SecureStore from "expo-secure-store";

import { COUNTRY_DETECTION_KEY } from "@/features/account/country-detection-format";
import { THEME_KEY } from "@/features/appearance/theme-format";
import { ASSISTANT_ALERTS_KEY } from "@/features/invoices/alert-dismissals-format";
import { resetThemePreference } from "@/features/appearance/theme-preference";
import { DOCK_STORE_KEY } from "@/features/navigation/dock-format";
import { NOTIFICATIONS_OFFER_KEY } from "@/features/notification-offer/offer-format";
import { resetAppLock } from "@/features/app-lock/preference";
import { APP_LOCK_KEY } from "@/features/app-lock/preference-format";
import { POS_MODE_STORE_KEY } from "@/features/terminal/pos-mode-format";
import { DISCREET_STORE_KEY } from "@/features/wallet/discreet-format";
import { CARD_WALLETS_NAME } from "@/lib/breez/card-wallet-names";
import { APP_FRONT_DIR_NAME } from "@/lib/card/app-front";
import { EXTENSION_DIR_NAME, forgetSharedCardDirectories } from "@/lib/card/card-files";
import { deleteCardItem } from "@/lib/card/card-keychain";
import { CARD_PASSES_KEY } from "@/lib/card/card-pass-store";
import { forgetCardSocket } from "@/lib/card/card-socket";
import { CARD_STATES_KEY } from "@/lib/card/card-store";
import { CARD_PAYEES_DIR_NAME } from "@/lib/card/payees";
import { CARD_DEVICE_KEY, forgetDeviceKey } from "@/lib/card/device-key";
import { CARD_PAYMENTS_DIR_NAME } from "@/lib/card/payment-log";
import { forgetProbe } from "@/lib/card/probe-store";
import { CARD_PUSH_MARKS_KEY } from "@/lib/card/push-marks";
import { CARD_WAKES_DIR_NAME } from "@/lib/card/wake-journal";
import { LEGACY_FREEZE_OWED_KEY } from "@/lib/legacy-v2/freeze-owed-format";
import { LEGACY_HISTORY_OWED_KEY } from "@/lib/legacy-v2/history-owed-format";
import { LEGACY_WALLET_OWNER_KEY } from "@/lib/legacy-v2/wallet-owner-format";
import { LEGACY_WATCH_KEY } from "@/lib/legacy-v2/watch-format";
import { clearLog } from "@/lib/log/log";
import { MTPELERIN_SESSION_KEY } from "@/lib/mtpelerin/session-format";
import { OBSERVE_CHOICE_KEY } from "@/lib/observe/choice-format";
import { resetObserveChoice } from "@/lib/observe/observe";
import { clearPendingLinks } from "@/lib/payment-link/pending";
import { MOVES_DIR_NAME } from "@/lib/registry/moves-store";
import { FOLLOWED_SALES_DIR_NAME } from "@/lib/terminal/followed-sales-store";
import { RELAYS_KEY } from "@/lib/relays/stored";
import { MEMBER_LOT_KEY } from "@/lib/team/member-lot";
import { MEMBERSHIP_KEY } from "@/lib/team/membership";
import { OWNER_DEVICE_KEY } from "@/lib/team/owner-device";
import { cancelRecoveryReminders } from "@/features/recovery-check/reminders";
import { RESCUE_TRACES_KEY } from "@/features/rescue/traces";
import {
  BRANDING_RECORD_KEY,
  CATALOG_RECORD_KEY,
  ONCHAIN_POOL_KEY,
  PASSKEY_RECORD_KEY,
  REGISTRY_RECORD_KEY,
  TERMINAL_OPTIONS_KEY,
  TERMINAL_PROFILE_KEY
} from "@/lib/terminal/model";

import { resetAmountUnit } from "./amount-unit";
import { AMOUNT_UNIT_KEY } from "./amount-unit-format";
import { clearAppCache } from "./cache-wipe";

/*
 * "Log out" of the owner: everything the app keeps on this device
 * goes. Its secure storage has no list of its keys: each one is named here (a new key of the app
 * belongs here too). Then the files of the documents directory: the merchant settings and the
 * Breez SDK's storage, the account's wallet's and the card wallets', which its wallet's passkey
 * restores at the next login. Same API on the web: device-wipe.web.ts. The wallets must be
 * disconnected first (src/lib/breez/connection.ts): one SDK instance never shares its storage, nor
 * finds it gone under it.
 *
 * The one key of the app that stays: the release notes opened (RELEASE_NOTES_SEEN_KEY,
 * src/features/release-notes/seen-format.ts), so that "What's new" opens by itself once per
 * device, never again after a "Log out". It names no account and holds nothing of one.
 *
 * The v2 app's keychain is not the app's storage (src/lib/legacy-v2/store.ts): its wallet's words,
 * if still here (their transfer not settled), stay, but the account they went to is forgotten
 * (LEGACY_WALLET_OWNER_KEY): no account opened next on this device may take their money
 * (src/features/migration/wallet-owner.ts), only their owner who types them.
 */

const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY
};

/** The secure storage's keys of the app, the pending payment links' apart (pending.ts). */
const SECURE_KEYS = [
  TERMINAL_PROFILE_KEY,
  ONCHAIN_POOL_KEY,
  REGISTRY_RECORD_KEY,
  TERMINAL_OPTIONS_KEY,
  BRANDING_RECORD_KEY,
  CATALOG_RECORD_KEY,
  PASSKEY_RECORD_KEY,
  DOCK_STORE_KEY,
  APP_LOCK_KEY,
  DISCREET_STORE_KEY,
  AMOUNT_UNIT_KEY,
  THEME_KEY,
  COUNTRY_DETECTION_KEY,
  POS_MODE_STORE_KEY,
  RELAYS_KEY,
  MEMBERSHIP_KEY,
  MEMBER_LOT_KEY,
  OWNER_DEVICE_KEY,
  CARD_DEVICE_KEY,
  CARD_STATES_KEY,
  CARD_PUSH_MARKS_KEY,
  CARD_PASSES_KEY,
  OBSERVE_CHOICE_KEY,
  NOTIFICATIONS_OFFER_KEY,
  RESCUE_TRACES_KEY,
  MTPELERIN_SESSION_KEY,
  LEGACY_WATCH_KEY,
  LEGACY_HISTORY_OWED_KEY,
  LEGACY_FREEZE_OWED_KEY,
  LEGACY_WALLET_OWNER_KEY,
  ASSISTANT_ALERTS_KEY
] as const;

/** The keys of SECURE_KEYS shared with the iOS extension where the build has it (card-keychain.ts). */
const SHARED_CARD_KEYS = [CARD_DEVICE_KEY, CARD_STATES_KEY, CARD_PASSES_KEY, RELAYS_KEY] as const;

/**
 * The directories of DIRECTORIES in the app group's container there (card-files.ts), and the
 * extension's own.
 */
const SHARED_CARD_DIRECTORIES = [
  CARD_PAYMENTS_DIR_NAME,
  CARD_PAYEES_DIR_NAME,
  EXTENSION_DIR_NAME,
  APP_FRONT_DIR_NAME
] as const;

/** Directories of the documents directory the app writes: never rename them (their modules). */
const DIRECTORIES = [
  "merchant-settings",
  "breez-sdk-spark",
  CARD_WALLETS_NAME,
  MOVES_DIR_NAME,
  FOLLOWED_SALES_DIR_NAME,
  CARD_PAYMENTS_DIR_NAME,
  CARD_PAYEES_DIR_NAME,
  CARD_WAKES_DIR_NAME
] as const;

/** Removes everything the app keeps on this device. Rejects when something could not be removed. */
export async function wipeDevice(): Promise<void> {
  const failures: unknown[] = [];
  const attempt = async (remove: () => unknown) => {
    try {
      await remove();
    } catch (error) {
      failures.push(error);
    }
  };
  await attempt(() => clearPendingLinks());
  // The phone's notifications of the check of the 12 words (recovery-check/reminders.ts).
  await attempt(() => cancelRecoveryReminders());
  // The card payments' device key, in memory too: a next account gets a new one.
  forgetDeviceKey();
  // "Ask for biometrics…" as read: a next account starts from its own default.
  resetAppLock();
  // "Send crash reports" too, applied at once (src/lib/observe/).
  resetObserveChoice();
  // The app's journal and its copy for support (src/lib/log/), and what this session keeps of it.
  await attempt(() => clearLog());
  // The exports and PDFs left in the cache, which name the business's clients (cache-wipe.ts).
  await attempt(() => clearAppCache());
  for (const key of SECURE_KEYS) await attempt(() => SecureStore.deleteItemAsync(key, OPTIONS));
  // "Currency shown first" read again once its key is gone: the default (settings/amount-unit.ts).
  resetAmountUnit();
  // "Theme" too: the device's own theme again, at once (src/features/appearance/).
  resetThemePreference();
  for (const name of DIRECTORIES) {
    await attempt(() => {
      const directory = new Directory(Paths.document, name);
      if (directory.exists) directory.delete();
    });
  }
  // The card items and files shared with the iOS notification service extension (card-keychain.ts,
  // card-files.ts), in the app group's keychain group and container: the extension's own files
  // with them.
  for (const key of SHARED_CARD_KEYS) await attempt(() => deleteCardItem(key));
  await attempt(() => forgetSharedCardDirectories(SHARED_CARD_DIRECTORIES));
  // The iOS notification service extension's test (staging, iPhone): its own keychain group and
  // container, outside the documents directory.
  await attempt(() => forgetProbe());
  // The card socket (Android): its service stopped, its listening tokens and its Keystore key gone,
  // outside the documents directory (modules/card-socket).
  await attempt(() => forgetCardSocket());
  if (failures.length > 0) {
    throw new Error(`The device could not be wiped: ${failures.map(String).join("; ")}`);
  }
}
