import * as SecureStore from "expo-secure-store";

import {
  closeAccount,
  getAccountSettings,
  getAccountTeamKeys,
  getAccountWalletId
} from "@/features/account/session";
import {
  readLegacyHistory,
  resetHistoryImport,
  startMigratedHistory
} from "@/features/migration/history-import";
import { wipeDevice } from "@/features/settings/device-wipe";
import {
  LEGACY_HISTORY_OWED_KEY,
  LEGACY_HISTORY_OWED_VERSION,
  MAX_OWED,
  NewerHistoryOwedError,
  historyOwedText,
  parseHistoryOwed
} from "@/lib/legacy-v2/history-owed-format";
import { readHistoryOwedText } from "@/lib/legacy-v2/history-owed-store";
import { historyOf } from "@/lib/legacy-v2/history-records";
import { deriveLegacyHistoryKeys } from "@/lib/team/keys";

import { openMerchantAccount } from "../../jest/account";
import { acceptSession, legacyV2 } from "../../jest/legacy-v2-server";
import type * as RelaysFake from "../../jest/nostr-relays";

/*
 * The "history to copy" mark this device owes the relays of an account it migrated
 * (history-owed-format.ts, history-import.ts): kept until a majority of the relays holds the
 * history's state, so that "Settings" offers the copy whatever the network did at the
 * migration's end, and written at a later read or opening. IRREVERSIBLE: the key's name and the
 * format, locked here.
 */

const relays = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");

const WALLET = "02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5";

/** The history's state the relays hold, if any. */
function heldState() {
  const keys = deriveLegacyHistoryKeys(getAccountTeamKeys()!);
  const answers = new Map(
    [...relays.stored].map(([relay, events]) => [
      relay,
      events.filter((event) => event.pubkey === keys.nostr.publicKey)
    ])
  );
  return historyOf(keys, answers).state?.state ?? null;
}

function cutRelays() {
  for (const relay of getAccountSettings()!.relays.slice(0, 3)) relays.unreachable.add(relay);
}

describe("the list of the v2 histories owed their mark", () => {
  it("keeps its name and its format", () => {
    expect(LEGACY_HISTORY_OWED_KEY).toBe("legacy-v2-history-owed");
    expect(LEGACY_HISTORY_OWED_VERSION).toBe(1);
    expect(JSON.parse(historyOwedText([WALLET]))).toEqual({ version: 1, wallets: [WALLET] });
    expect(parseHistoryOwed(historyOwedText([WALLET]))).toEqual([WALLET]);
  });

  it("leaves out what is out of shape, keeps the newest, and refuses a newer app's", () => {
    expect(parseHistoryOwed(null)).toEqual([]);
    expect(parseHistoryOwed("{")).toEqual([]);
    expect(parseHistoryOwed(JSON.stringify({ version: 0, wallets: [WALLET] }))).toEqual([]);
    expect(
      parseHistoryOwed(JSON.stringify({ version: 1, wallets: [WALLET, "zz", 3, "ABCDEF"] }))
    ).toEqual([WALLET]);
    const many = Array.from({ length: MAX_OWED + 4 }, (_, n) => n.toString(16).padStart(4, "0"));
    expect(parseHistoryOwed(historyOwedText(many))).toEqual(many.slice(-MAX_OWED));
    expect(() => parseHistoryOwed(JSON.stringify({ version: 2 }))).toThrow(NewerHistoryOwedError);
  });
});

describe("the mark owed at the migration's end", () => {
  beforeEach(async () => {
    relays.resetRelays();
    resetHistoryImport();
    await openMerchantAccount({ displayCurrency: "CHF" });
  });

  afterEach(() => closeAccount());

  it("is written at once when the relays answer, and forgotten then", async () => {
    await startMigratedHistory(null);
    expect(heldState()).toEqual({ done: null });
    expect(parseHistoryOwed(await readHistoryOwedText())).toEqual([]);
  });

  it("offers the copy all the same when the relays did not take it, and writes it later", async () => {
    cutRelays();
    await startMigratedHistory(null);
    expect(heldState()).toBeNull();
    expect(parseHistoryOwed(await readHistoryOwedText())).toEqual([getAccountWalletId()]);

    // The network back: "Settings" offers the copy, and the mark goes to the relays.
    relays.unreachable.clear();
    await expect(readLegacyHistory()).resolves.toMatchObject({ done: false, pending: true });
    await waitForMark();
  });

  it("is written at the account's next opening", async () => {
    cutRelays();
    await startMigratedHistory(null);
    closeAccount();
    relays.unreachable.clear();
    resetHistoryImport();
    await openMerchantAccount({ displayCurrency: "CHF" });
    await waitForMark();
  });

  it("offers the copy again after one the relays stopped before its state", async () => {
    legacyV2.payments = [];
    acceptSession("refresh-of-the-owner-0001", "auth-of-the-owner-00000001");
    cutRelays();
    await startMigratedHistory({
      authToken: "auth-of-the-owner-00000001",
      refreshToken: "refresh-of-the-owner-0001"
    });
    expect(legacyV2.loggedOut).toEqual(["refresh-of-the-owner-0001"]);
    relays.unreachable.clear();
    await expect(readLegacyHistory()).resolves.toMatchObject({ pending: true });
    await waitForMark();
  });

  it('is forgotten by "Log out"', async () => {
    cutRelays();
    await startMigratedHistory(null);
    await wipeDevice();
    await expect(SecureStore.getItemAsync(LEGACY_HISTORY_OWED_KEY)).resolves.toBeNull();
  });
});

/** Until the relays hold the mark and the device no longer owes it. */
async function waitForMark(): Promise<void> {
  for (let round = 0; round < 100; round += 1) {
    if (heldState()?.done === null && parseHistoryOwed(await readHistoryOwedText()).length === 0) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("The mark never reached the relays");
}

describe("the list on the web", () => {
  const entries = new Map<string, string>();
  const web = jest.requireActual<typeof import("@/lib/legacy-v2/history-owed-store.web")>(
    "@/lib/legacy-v2/history-owed-store.web"
  );

  beforeAll(() => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => entries.get(key) ?? null,
        setItem: (key: string, value: string) => void entries.set(key, String(value)),
        removeItem: (key: string) => void entries.delete(key)
      }
    });
  });

  afterAll(() => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  it("is kept in the browser's localStorage, under the same name", async () => {
    await expect(web.readHistoryOwedText()).resolves.toBeNull();
    await web.writeHistoryOwedText(historyOwedText([WALLET]));
    expect(entries.get(LEGACY_HISTORY_OWED_KEY)).toBe(historyOwedText([WALLET]));
    await expect(web.readHistoryOwedText()).resolves.toBe(historyOwedText([WALLET]));
  });
});
