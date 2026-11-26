// The cards' passes on an iPhone (src/features/card/card-passes.ts): kept only while the
// notification service extension pays (IOS_EXTENSION_PAYS_CARDS), in a build with the app group
// it shares with the app, and while the card's channel holds this phone's push token (push-marks.ts):
// what wakes the extension for that card. Anywhere else a pass would serve nothing: none is kept.
import { Platform } from "react-native";

import * as cardConfig from "@/config/card";
import {
  DEFAULT_CARD_DAY_SATS,
  DEFAULT_CARD_PAYMENT_SATS,
  DEFAULT_CARD_RELAY_HOST
} from "@/config/card";
import { syncCardPasses } from "@/features/card/card-passes";
import type { CardAccess } from "@/features/card/states";
import { encodeWalletSecret } from "@/lib/breez/secret";
import { CARD_SHARED_SERVICE } from "@/lib/card/card-keychain";
import { CARD_PASSES_KEY, loadCardPasses } from "@/lib/card/card-pass-store";
import { deriveCardRecordKeys, type CardState } from "@/lib/card/card-record";
import { deriveCardRoot } from "@/lib/card/keys";
import { approveCardPayee } from "@/lib/card/payees";
import { markPushToken } from "@/lib/card/push-marks";

import type * as FileSystemFake from "../../jest/expo-file-system";
import type * as SecureStoreFake from "../../jest/expo-secure-store";

const GROUP = "group.ch.swissbitcoinpay.checkout.staging.cards";
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    expoConfig: { extra: { cardAppGroup: "group.ch.swissbitcoinpay.checkout.staging.cards" } }
  }
}));

const fileSystem = jest.requireMock<typeof FileSystemFake>("expo-file-system");
const secureStore = jest.requireMock<typeof SecureStoreFake>("expo-secure-store");

// The test mnemonic of card-keys.test.ts (all-zero entropy), never a real wallet's.
const MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const ROOT = deriveCardRoot(encodeWalletSecret({ mnemonic: MNEMONIC }));
const WALLET = "02".padEnd(66, "a");
const CARD_ID = "30c19d9bfae333c1cb42a5ce6e20debb";
const TOKEN = "ExponentPushToken[fake-token-0000000000]";
const CARD_WALLET = { cardId: CARD_ID, walletGeneration: 1 };
const BAKERY = { id: "sattleme01@breez.tips", name: "Lakeside Bakery" };
const APPROVED_AT = Date.UTC(2026, 10, 23, 9, 0);
const ACCESS: CardAccess = { walletId: WALLET, root: ROOT, keys: deriveCardRecordKeys(ROOT) };

const STATE: CardState = {
  cardId: CARD_ID,
  uid: "04996c6a926980",
  keyVersion: 1,
  status: "active",
  relayHost: DEFAULT_CARD_RELAY_HOST,
  lastCounter: 10,
  depositedThrough: 1_010,
  maxPaymentSats: DEFAULT_CARD_PAYMENT_SATS,
  maxDaySats: DEFAULT_CARD_DAY_SATS,
  maxPaymentsPerHour: 5,
  suspended: false,
  name: "",
  look: null,
  issuer: null,
  settingsAt: 1_760_000_000_000,
  walletGeneration: 1,
  updatedAt: 1_760_000_000
};

async function kept(): Promise<string[]> {
  return (await loadCardPasses(WALLET)).passes.map((pass) => pass.cardId);
}

beforeEach(async () => {
  jest.replaceProperty(Platform, "OS", "ios");
  fileSystem.resetFileSystem();
  secureStore.resetSecureStore();
  fileSystem.setSharedContainers([GROUP]);
  // The extension pays (card-passes.ts reads the setting at each decision).
  jest.replaceProperty(cardConfig, "IOS_EXTENSION_PAYS_CARDS", true);
  // An approved merchant: the card pays without asking, the app closed.
  await approveCardPayee(WALLET, CARD_WALLET, BAKERY, APPROVED_AT);
});

describe("the cards' passes on an iPhone (card-passes.ts)", () => {
  it("are kept, in the keychain group the extension reads, while the card's channel holds this phone's push token", async () => {
    await markPushToken(CARD_ID, TOKEN);
    await syncCardPasses(ACCESS, [STATE]);
    expect(await kept()).toEqual([CARD_ID]);
    expect(secureStore.items.has(CARD_PASSES_KEY)).toBe(false);
    expect(
      [...secureStore.sharedItems.keys()].some(
        (id) => id.includes(CARD_SHARED_SERVICE) && id.includes(CARD_PASSES_KEY)
      )
    ).toBe(true);
  });

  it("are forgotten once the channel holds no token (notifications turned off), and never kept without a mark", async () => {
    await markPushToken(CARD_ID, TOKEN);
    await syncCardPasses(ACCESS, [STATE]);
    expect(await kept()).toEqual([CARD_ID]);
    await markPushToken(CARD_ID, null);
    await syncCardPasses(ACCESS, [STATE]);
    expect(await kept()).toEqual([]);
    secureStore.resetSecureStore();
    await syncCardPasses(ACCESS, [STATE]);
    expect(await kept()).toEqual([]);
  });

  it("are never kept while the extension pays no card, whatever the token", async () => {
    jest.replaceProperty(cardConfig, "IOS_EXTENSION_PAYS_CARDS", false);
    await markPushToken(CARD_ID, TOKEN);
    await syncCardPasses(ACCESS, [STATE]);
    expect(await kept()).toEqual([]);
  });

  it("are never kept in a build without the extension's app group", async () => {
    fileSystem.setSharedContainers([]);
    // The merchant approved there too (the documents directory): only the app group is missing.
    await approveCardPayee(WALLET, CARD_WALLET, BAKERY, APPROVED_AT);
    await markPushToken(CARD_ID, TOKEN);
    await syncCardPasses(ACCESS, [STATE]);
    expect(await kept()).toEqual([]);
  });

  it("follow the card's other rules: a card in pause, or of another card's token, keeps none", async () => {
    await markPushToken("0".repeat(32), TOKEN);
    await syncCardPasses(ACCESS, [STATE]);
    expect(await kept()).toEqual([]);
    await markPushToken(CARD_ID, TOKEN);
    await syncCardPasses(ACCESS, [{ ...STATE, status: "paused" as CardState["status"] }]);
    expect(await kept()).toEqual([]);
  });
});
