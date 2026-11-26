import { DEFAULT_CARD_RELAY_HOST } from "@/config/card";
import { cardLightningAddress, leaseCardWallet } from "@/features/card/card-wallet";
import { deleteCard } from "@/features/card/manage";
import { pairCard } from "@/features/card/pairing";
import { resetCardPayments } from "@/features/card/payments";
import { knownCardState, resetCardStates, withCardAccess } from "@/features/card/states";
import { lockTerminal } from "@/features/navigation/lock";
import { forgetDeviceKey } from "@/lib/card/device-key";

import { TEST_WALLET_ID, openTestAccount } from "../../jest/account";
import { addRelay } from "../../jest/card-relay";
import type * as BreezFake from "../../jest/breez-sdk";
import type * as NfcFake from "../../jest/nfc-manager";
import type * as RelaysFake from "../../jest/nostr-relays";
import { FakeNtag424 } from "../../jest/ntag424";

// A short wait for the card's wallet: what runs on it past the wait, in real time.
jest.mock("../config/card", () => ({
  ...jest.requireActual<Record<string, unknown>>("../config/card"),
  CARD_WALLET_CHECK_MS: 300
}));
// eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories are synchronous
jest.mock("react-native-nfc-manager", () => require("../../jest/nfc-manager"));
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    expoConfig: {
      extra: { breezNetwork: "mainnet", eas: { projectId: "00000000-0000-4000-8000-000000000000" } }
    }
  }
}));

const nfc = jest.requireMock<typeof NfcFake>("react-native-nfc-manager");
const nostr = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");
const sdk = jest.requireMock<typeof BreezFake>("@breeztech/breez-sdk-spark-react-native");
const apiKey = process.env.EXPO_PUBLIC_BREEZ_API_KEY;

const MESSAGES = { alert: "Hold the card to the phone" };
const IN_HAND = { inHand: { messages: MESSAGES } };

let card: FakeNtag424;
let cardId: string;
let username: string;

/** Lets what runs on the card's wallet past the wait end. */
const settled = () => new Promise((resolve) => setTimeout(resolve, 150));

beforeEach(async () => {
  // A deletion reads the card's wallet first (manage.ts).
  process.env.EXPO_PUBLIC_BREEZ_API_KEY = "test-api-key";
  nostr.resetRelays();
  nfc.resetNfcManager();
  resetCardStates();
  resetCardPayments();
  forgetDeviceKey();
  addRelay(DEFAULT_CARD_RELAY_HOST);
  await openTestAccount({ usage: "card", signUp: "card" });
  card = new FakeNtag424();
  nfc.holdCard(card);
  cardId = (
    await pairCard({
      relayHost: DEFAULT_CARD_RELAY_HOST,
      channelName: "Payments",
      messages: MESSAGES
    })
  ).state.cardId;
  const address = await withCardAccess(async (access) => {
    const lease = await leaseCardWallet(access, { cardId, walletGeneration: 1 });
    try {
      return await cardLightningAddress(lease);
    } finally {
      await lease.release();
    }
  });
  username = address.replace(/@breez\.tips$/, "");
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(async () => {
  resetCardPayments();
  await lockTerminal();
  process.env.EXPO_PUBLIC_BREEZ_API_KEY = apiKey;
  jest.restoreAllMocks();
});

describe("a deletion refused as its card's wallet answered too late", () => {
  it.each([
    ["held to the phone", IN_HAND],
    ["without the card", {}]
  ])("%s: its late read gives the Lightning address up no more", async (_, options) => {
    const release = sdk.holdFirstSync();
    const asked = nfc.calls.length;
    await expect(deleteCard(cardId, options)).rejects.toMatchObject({
      reason: "walletUnavailable"
    });
    // Its read ends a moment later, the wallet found empty (a slow network): nothing given up.
    release();
    await settled();
    expect(sdk.lightningAddresses.has(username)).toBe(true);
    expect(knownCardState(TEST_WALLET_ID, cardId)?.status).toBe("active");
    expect(nfc.calls.slice(asked)).toEqual([]);
  });

  it("registers the address again when it was given up as the wait ended", async () => {
    // Read in time, but the address's deletion answers only once the wait is over.
    const release = sdk.holdAddressDeletion();
    await expect(deleteCard(cardId, IN_HAND)).rejects.toMatchObject({
      reason: "walletUnavailable"
    });
    release();
    await settled();
    expect(sdk.lightningAddresses.has(username)).toBe(true);
    expect(knownCardState(TEST_WALLET_ID, cardId)?.status).toBe("active");
    expect(card.keyVersions).toEqual([1, 1, 1, 1, 1]);
  });

  it("registers the address again when its deletion failed, maybe done all the same", async () => {
    const release = sdk.holdAddressDeletion();
    const deleting = deleteCard(cardId);
    // The server deletes it, but its answer is lost: the call fails in time.
    await new Promise((resolve) => setTimeout(resolve, 50));
    release("lost");
    await expect(deleting).rejects.toMatchObject({ reason: "walletUnavailable" });
    expect(sdk.lightningAddresses.has(username)).toBe(true);
    expect(knownCardState(TEST_WALLET_ID, cardId)?.status).toBe("active");
  });

  it("lets no earlier attempt register the address again after a retry deleted the card", async () => {
    // The first attempt's address deletion answers past the wait (a slow network).
    const release = sdk.holdAddressDeletion();
    await expect(deleteCard(cardId)).rejects.toMatchObject({ reason: "walletUnavailable" });
    // "Try again" while it still runs: it waits for it, refused past the wait, nothing touched.
    await expect(deleteCard(cardId)).rejects.toMatchObject({ reason: "walletUnavailable" });
    expect(knownCardState(TEST_WALLET_ID, cardId)?.status).toBe("active");
    // The first one ends at last, in an error: the address registered again, the card in service.
    release("lost");
    await settled();
    expect(sdk.lightningAddresses.has(username)).toBe(true);
    // "Try again" once more: deleted, its address given up for good.
    await expect(deleteCard(cardId)).resolves.toMatchObject({ state: { status: "deleted" } });
    await settled();
    expect(sdk.lightningAddresses.has(username)).toBe(false);
  });

  it("deletes the card when its wallet answers within the wait", async () => {
    await deleteCard(cardId, IN_HAND);
    expect(sdk.lightningAddresses.has(username)).toBe(false);
    expect(knownCardState(TEST_WALLET_ID, cardId)?.status).toBe("deleted");
    expect(card.keyVersions).toEqual([0, 0, 0, 0, 0]);
  });
});

describe("a deletion refused while no sync of its card's wallet reached the network", () => {
  it("never finds the wallet empty on this device's copy: the card stays in service", async () => {
    // The Spark operators unreachable: the SDK's syncs end, having read nothing.
    sdk.setSparkReachable(false);
    const asked = nfc.calls.length;
    await expect(deleteCard(cardId, IN_HAND)).rejects.toMatchObject({
      reason: "walletUnavailable"
    });
    await settled();
    expect(sdk.lightningAddresses.has(username)).toBe(true);
    expect(knownCardState(TEST_WALLET_ID, cardId)?.status).toBe("active");
    expect(nfc.calls.slice(asked)).toEqual([]);
    // The wait let its wallet go: the last connection, the card's, disconnected.
    const { results } = sdk.connect.mock;
    const instance = (await results[results.length - 1]!.value) as Record<string, jest.Mock>;
    expect(instance.disconnect).toHaveBeenCalled();

    // Reachable again: "Try again" deletes it.
    sdk.setSparkReachable(true);
    await expect(deleteCard(cardId, IN_HAND)).resolves.toMatchObject({
      state: { status: "deleted" }
    });
    expect(sdk.lightningAddresses.has(username)).toBe(false);
  });
});
