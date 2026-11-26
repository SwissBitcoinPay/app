import { DEFAULT_RELAYS } from "@/config/relays";
import { walletSecret } from "@/lib/breez/seed";
import { forgetMtpSession } from "@/lib/mtpelerin/session-store";
import { mtpSessionStore } from "@/lib/mtpelerin/session-sync";
import { deriveTeamKeys } from "@/lib/team/keys";

import { TEST_WALLET_ID, testSeed } from "../../jest/account";
import type * as SecureStoreFake from "../../jest/expo-secure-store";
import type * as RelaysFake from "../../jest/nostr-relays";

/*
 * The web app's Mt Pelerin session (session-store.web.ts): in the page's memory only, taken from
 * the account's relays at each visit (session-sync.ts) rather than by a new SMS login.
 */

jest.mock("@/lib/mtpelerin/session-store", () =>
  jest.requireActual("@/lib/mtpelerin/session-store.web")
);

/** The test account's session at the fake Mt Pelerin. */
const OWNER = { walletId: TEST_WALLET_ID, environment: "production" } as const;

const relays = jest.requireMock<typeof RelaysFake>("@/lib/nostr/relay");
const secureStore = jest.requireMock<typeof SecureStoreFake>("expo-secure-store");

const visit = () =>
  mtpSessionStore(OWNER, {
    team: deriveTeamKeys(walletSecret(testSeed())),
    relays: () => DEFAULT_RELAYS
  });

beforeEach(() => {
  relays.resetRelays();
});

it("keeps nothing across visits of the web app, yet takes the session from the relays at each", async () => {
  const first = visit();
  await expect(first.load()).resolves.toMatchObject({ refreshToken: null });
  await first.keep("fake.from-the-web");
  await first.settled();
  // The page closed: its memory gone, nothing in any storage.
  await forgetMtpSession();
  expect(secureStore.items.size).toBe(0);
  await expect(visit().load()).resolves.toMatchObject({ refreshToken: "fake.from-the-web" });
});
