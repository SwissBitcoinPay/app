import { wipeDevice } from "@/features/settings/device-wipe";
import { CARD_PAYMENTS_DIR_NAME, loadCardPayments, logCardPayment } from "@/lib/card/payment-log";
import {
  CARD_PUSH_MARKS_KEY,
  forgetPushMark,
  loadPushMarks,
  markPushToken
} from "@/lib/card/push-marks";

import type * as FileSystemFake from "../../jest/expo-file-system";
import type * as SecureStoreFake from "../../jest/expo-secure-store";

const secureStore = jest.requireMock<typeof SecureStoreFake>("expo-secure-store");
const fileSystem = jest.requireMock<typeof FileSystemFake>("expo-file-system");

const CARD = "0123456789abcdef0123456789abcdef";
const OTHER = "fedcba9876543210fedcba9876543210";
const THIRD = "00112233445566778899aabbccddeeff";
const TOKEN = "ExponentPushToken[AAAAAAAAAAAAAAAAAAAAAA]";
const RENEWED = "ExponentPushToken[BBBBBBBBBBBBBBBBBBBBBB]";

beforeEach(() => {
  secureStore.resetSecureStore();
  fileSystem.resetFileSystem();
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => jest.restoreAllMocks());

describe("the cards' push marks", () => {
  it("keep, per card, the token sealed in its hashes, or none", async () => {
    expect(await loadPushMarks()).toEqual(new Map());
    await Promise.all([
      markPushToken(CARD, TOKEN),
      markPushToken(OTHER, null),
      markPushToken(THIRD, RENEWED)
    ]);
    expect(await loadPushMarks()).toEqual(
      new Map([
        [CARD, TOKEN],
        [OTHER, null],
        [THIRD, RENEWED]
      ])
    );
    await forgetPushMark(CARD);
    expect(await loadPushMarks()).toEqual(
      new Map([
        [OTHER, null],
        [THIRD, RENEWED]
      ])
    );
  });

  it("are stored under their irreversible key, in format 3", async () => {
    expect(CARD_PUSH_MARKS_KEY).toBe("card-push-marks");
    await markPushToken(CARD, TOKEN);
    await markPushToken(OTHER, null);
    expect(JSON.parse(secureStore.items.get(CARD_PUSH_MARKS_KEY)!)).toEqual({
      version: 3,
      cards: { [CARD]: TOKEN, [OTHER]: null }
    });
  });

  it.each([
    ["1 (bare tokens)", { version: 1, cards: { [CARD]: TOKEN, [OTHER]: null } }],
    [
      "2 (a token and its wake kind)",
      { version: 2, cards: { [CARD]: { to: TOKEN, wake: "data" } } }
    ]
  ])("no longer read format %s: none known, each sealed again", async (_name, stored) => {
    secureStore.items.set(CARD_PUSH_MARKS_KEY, JSON.stringify(stored));
    expect(await loadPushMarks()).toEqual(new Map());
    await markPushToken(THIRD, TOKEN);
    expect(JSON.parse(secureStore.items.get(CARD_PUSH_MARKS_KEY)!)).toEqual({
      version: 3,
      cards: { [THIRD]: TOKEN }
    });
  });

  it("leave out what is out of shape: that card's token is sealed again", async () => {
    secureStore.items.set(
      CARD_PUSH_MARKS_KEY,
      JSON.stringify({
        version: 3,
        cards: {
          [CARD]: "not a token",
          card: TOKEN,
          [THIRD]: { to: TOKEN, wake: "alert" },
          "11111111111111111111111111111111": 42,
          [OTHER]: TOKEN
        }
      })
    );
    expect(await loadPushMarks()).toEqual(new Map([[OTHER, TOKEN]]));
    secureStore.items.set(CARD_PUSH_MARKS_KEY, "{");
    expect(await loadPushMarks()).toEqual(new Map());
    secureStore.items.set(CARD_PUSH_MARKS_KEY, JSON.stringify({ version: 0, cards: {} }));
    expect(await loadPushMarks()).toEqual(new Map());
  });

  it("are never written over by an older app", async () => {
    const newer = JSON.stringify({ version: 4, cards: {} });
    secureStore.items.set(CARD_PUSH_MARKS_KEY, newer);
    expect(await loadPushMarks()).toEqual(new Map());
    await markPushToken(CARD, TOKEN);
    expect(secureStore.items.get(CARD_PUSH_MARKS_KEY)).toBe(newer);
  });

  it("never fail a sync when the secure store refuses: the mark is only lost", async () => {
    secureStore.setItemAsync.mockRejectedValueOnce(new Error("Value too large"));
    await expect(markPushToken(CARD, TOKEN)).resolves.toBeUndefined();
    expect(await loadPushMarks()).toEqual(new Map());
    await markPushToken(CARD, TOKEN);
    expect(await loadPushMarks()).toEqual(new Map([[CARD, TOKEN]]));
  });
});

describe('"Log out" (wipeDevice)', () => {
  it("removes the push marks and the log of card payments", async () => {
    await markPushToken(CARD, TOKEN);
    await logCardPayment({
      id: "1",
      cardId: CARD,
      walletGeneration: 1,
      at: Date.now(),
      amountSats: 1_000n,
      paymentHash: "1".padStart(64, "0"),
      description: null,
      outcome: "sent",
      reason: null,
      pr: "lnbc1",
      payee: null,
      preimage: null,
      value: null
    });
    expect(CARD_PAYMENTS_DIR_NAME).toBe("card-payments");
    await wipeDevice();
    expect(secureStore.items.has(CARD_PUSH_MARKS_KEY)).toBe(false);
    expect([...fileSystem.files.keys()].some((uri) => uri.includes("/card-payments/"))).toBe(false);
    expect(await loadCardPayments()).toEqual([]);
  });
});
