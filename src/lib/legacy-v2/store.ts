import * as Keychain from "react-native-keychain";

import { logFailure } from "@/lib/log/log";

import {
  LEGACY_KEYS,
  parseLegacyAccountCopy,
  parseLegacyRole,
  parseLegacyTokens,
  parseLegacyWords,
  type LegacyAccountCopy,
  type LegacyRole,
  type LegacyTokens
} from "./data";

/*
 * The v2 app's values on this device (data.ts), read with the library that wrote them:
 * react-native-keychain 10.0.0, the v2 app's (since 2.0.0 every value goes to the keychain, under
 * the service of its name: SwissBitcoinPay/app, `src/utils/AsyncStorage/AsyncStorage.native.ts`).
 * The same library reads every variant it wrote (iOS's keychain; Android's ciphers of 8.x and
 * 10.x, before and after its move to DataStore), which expo-secure-store cannot (another layout on
 * both systems). Read only, but for forgetLegacySession and forgetLegacyWords, which erase the v2
 * app's values once the migration no longer needs them; nothing of this app is ever written there.
 *
 * NOT VERIFIED ON A DEVICE: a v2 app's values read by this app updated over it (only a production
 * build installed over the v2 app of the store can).
 */

/** What the v2 app left on this device, without asking anything of the person. */
export type LegacyState = {
  role: LegacyRole;
  /** Its copy of the account; null when none, or out of shape. */
  account: LegacyAccountCopy | null;
  /** The v2 server's session; null when none, or out of shape. */
  tokens: LegacyTokens | null;
  /** Whether the words of a wallet created in the v2 app are on this device (not read). */
  hasWallet: boolean;
};

/** One value, never with a prompt (none of these is behind the biometrics); null when absent. */
async function readPlain(service: string): Promise<string | null> {
  try {
    const found = await Keychain.getGenericPassword({ service });
    return found ? found.password : null;
  } catch (error) {
    logFailure("Reading a value of the v2 app failed", error);
    return null;
  }
}

async function hasValue(service: string): Promise<boolean> {
  try {
    return await Keychain.hasGenericPassword({ service });
  } catch (error) {
    logFailure("Looking for a value of the v2 app failed", error);
    return false;
  }
}

/**
 * The v2 app's state on this device, or null when it left nothing to migrate: no role, nor copy of
 * an account (forgetLegacySession forgets both once the device migrated; the wallet's words alone
 * are "Wallet"'s to transfer). Its role is the one it saved; without one, a till's when its
 * copy of an account is here (the v2 app's own default, `employee`). Asks nothing of the person:
 * the words are looked for, not read (no biometric prompt).
 */
export async function readLegacyState(): Promise<LegacyState | null> {
  const [userType, accountText, tokensText, hasWallet] = await Promise.all([
    readPlain(LEGACY_KEYS.userType),
    readPlain(LEGACY_KEYS.accountConfig),
    readPlain(LEGACY_KEYS.tokens),
    hasValue(LEGACY_KEYS.mnemonic)
  ]);
  const account = parseLegacyAccountCopy(accountText);
  const role = parseLegacyRole(userType) ?? (account ? "employee" : null);
  if (!role) return null;
  return { role, account, tokens: parseLegacyTokens(tokensText), hasWallet };
}

/** Whether the words of a wallet created in the v2 app are on this device, without reading them. */
export function hasLegacyWallet(): Promise<boolean> {
  return hasValue(LEGACY_KEYS.mnemonic);
}

/** The prompt of the system over the words, in the app's language. */
export type LegacyPrompt = { title: string; cancel: string };

/**
 * What reading the v2 wallet's words gave: the words; `absent`, none on this device; `unreadable`,
 * there but not given (the prompt dismissed or failed, the biometrics enrolled since they were
 * saved, which destroys their key: `BIOMETRY_CURRENT_SET`), or not words.
 */
export type LegacyWordsRead =
  { status: "read"; words: string[] } | { status: "absent" } | { status: "unreadable" };

/**
 * The v2 wallet's words, behind the biometrics the v2 app put on them when the device had some
 * (the system's prompt shows then, with `prompt`). Never kept: the caller forgets them once used.
 */
export async function readLegacyWords(prompt: LegacyPrompt): Promise<LegacyWordsRead> {
  if (!(await hasValue(LEGACY_KEYS.mnemonic))) return { status: "absent" };
  try {
    const found = await Keychain.getGenericPassword({
      service: LEGACY_KEYS.mnemonic,
      authenticationPrompt: { title: prompt.title, cancel: prompt.cancel }
    });
    if (!found) return { status: "unreadable" };
    const words = parseLegacyWords(found.password);
    if (!words) logFailure("The v2 wallet's words are out of shape");
    return words ? { status: "read", words } : { status: "unreadable" };
  } catch (error) {
    // A dismissed prompt, or a key the system destroyed: the error says which, never the words.
    logFailure("Reading the v2 wallet's words failed", error);
    return { status: "unreadable" };
  }
}

/**
 * Forgets the v2 app's session and its account on this device, once the migration no longer needs
 * them (its role and its copy of the account: the migration's screen shows no more). The wallet's
 * words stay: the v2 service may still pay that wallet (its last payouts, a till on the v2 app),
 * and only they spend it.
 */
export async function forgetLegacySession(): Promise<void> {
  for (const service of [LEGACY_KEYS.tokens, LEGACY_KEYS.accountConfig, LEGACY_KEYS.userType]) {
    try {
      await Keychain.resetGenericPassword({ service });
    } catch (error) {
      logFailure("Forgetting a value of the v2 app failed", error);
    }
  }
}

/**
 * Erases the v2 wallet's words from this device: once their money
 * moved to the account that migrated, or its owner chose to keep only the words they wrote down
 * (src/features/migration/wallet-owner.ts). True once they are gone (or were not there); false
 * when the keychain kept them: a later attempt erases them.
 */
export async function forgetLegacyWords(): Promise<boolean> {
  try {
    await Keychain.resetGenericPassword({ service: LEGACY_KEYS.mnemonic });
    return !(await Keychain.hasGenericPassword({ service: LEGACY_KEYS.mnemonic }));
  } catch (error) {
    logFailure("Erasing the v2 wallet's words failed", error);
    return false;
  }
}
