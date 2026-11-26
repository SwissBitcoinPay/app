import { DEFAULT_RELAYS } from "@/config/relays";
import { closeAccount, getAccountSettings, getAccountTeamKeys } from "@/features/account/session";
import {
  readLegacyHistory,
  resetHistoryImport,
  startLegacyHistoryImport
} from "@/features/migration/history-import";
import { SettingsError, changeRelays } from "@/features/settings/account-settings";
import { legacyRowRef } from "@/lib/legacy-v2/history";
import { deriveLegacyHistoryKeys } from "@/lib/team/keys";

import { openTestAccount } from "../../jest/account";
import { acceptSession, legacyV2 } from "../../jest/legacy-v2-server";
import type * as FileSystemFake from "../../jest/expo-file-system";
import type * as RelaysFake from "../../jest/nostr-relays";

/*
 * The history copied from the v2 account follows a change of the account's relays (account-
 * settings.ts, history-import.ts): on a majority of the new list before the change is saved,
 * nothing else keeps it once the v2 service ends; the change refused when the new list does not
 * take it, before anything moves.
 */

// The wallet layer is the real one, over the fake SDK (the copy of the declarations reads it).
jest.mock("../lib/breez/config", () => ({
  ...jest.requireActual("../lib/breez/config"),
  getWalletConfig: () => ({ network: "mainnet", apiKey: "test-api-key" }),
  getBreezNetwork: () => "mainnet"
}));

const nostr = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");
const fileSystem = jest.requireMock<typeof FileSystemFake>("expo-file-system");

const NEXT = [
  "wss://relay-a.bakery.example",
  "wss://relay-b.bakery.example",
  "wss://relay-c.bakery.example"
];
const REFRESH = "refresh-of-the-owner-0001";
const AUTH = "auth-of-the-owner-00000001";

/** Until no relay call went out for a while: the copies in the background are over. */
async function settled(): Promise<void> {
  for (let count = -1; count !== nostr.calls.length;) {
    count = nostr.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

beforeEach(async () => {
  nostr.resetRelays();
  fileSystem.resetFileSystem();
  resetHistoryImport();
  await openTestAccount({ usage: "merchant", signUp: "done", displayCurrency: "CHF" });
  legacyV2.payments = [
    {
      id: "id-0001",
      status: "settled",
      tag: "invoice-tpos",
      amount_sat: 25_000,
      created_at: 1_790_000_000,
      paid_at: 1_790_000_060,
      title: "Lakeside Bakery",
      description: "Croissants",
      input: { unit: "CHF", amount: 12.5 }
    }
  ];
  // The v2 account the copy reads its name of (history.ts, noteOf).
  legacyV2.account = { id: "0192a3b4-c5d6-7e8f-9a0b-0000000000aa", name: "Lakeside Bakery" };
  acceptSession(REFRESH, AUTH);
  await expect(
    startLegacyHistoryImport({ authToken: AUTH, refreshToken: REFRESH })
  ).resolves.toMatchObject({ phase: "done" });
});

afterEach(async () => {
  await settled();
  closeAccount();
});

describe("a change of the account's relays", () => {
  it("takes the v2 history along before it is saved", async () => {
    await changeRelays(NEXT);
    expect(getAccountSettings()?.relays).toEqual(NEXT);
    // Read from the new list alone, by a run of the app that knows nothing of it.
    resetHistoryImport();
    for (const relay of DEFAULT_RELAYS) nostr.unreachable.add(relay);
    await expect(readLegacyHistory()).resolves.toMatchObject({
      rows: [{ ref: legacyRowRef("id-0001") }],
      done: true
    });
  });

  it("is refused when the new relays do not take the v2 history, before anything moves", async () => {
    const author = deriveLegacyHistoryKeys(getAccountTeamKeys()!).nostr.publicKey;
    // Every relay refuses the history's author from now on: the new list never gets it.
    nostr.refusedAuthors.add(author);
    const refusal = changeRelays(NEXT);
    await expect(refusal).rejects.toBeInstanceOf(SettingsError);
    await expect(refusal).rejects.toMatchObject({ code: "unreachable" });
    expect(getAccountSettings()?.relays).toEqual(DEFAULT_RELAYS);
  });
});
