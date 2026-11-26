import { ecb } from "@noble/ciphers/aes.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";

import { DEFAULT_CARD_DAY_SATS, DEFAULT_CARD_PAYMENT_SATS } from "@/config/card";
import { encodeWalletSecret } from "@/lib/breez/secret";
import { cardOwnCopiesOf, cardOwnFilter, cardOwnKeys, cardOwnSecret } from "@/lib/card/card-own";
import {
  PASS_TAP_MARGIN,
  cardPassOf,
  cardPassValue,
  findPassTap,
  parseCardPass,
  wipeCardPass,
  type CardPass
} from "@/lib/card/card-pass";
import { CARD_PASSES_KEY, keepCardPasses, loadCardPasses } from "@/lib/card/card-pass-store";
import { cardStateEvent, type CardState } from "@/lib/card/card-record";
import {
  cardEncryptionKey,
  cardKeysOf,
  cardWalletPhrase,
  deriveCardRoot,
  walletPhraseOf
} from "@/lib/card/keys";
import { payeeModeEvent } from "@/lib/card/payee-records";
import { sunMac } from "@/lib/card/sun";

import type * as SecureStoreFake from "../../jest/expo-secure-store";

/*
 * A card's pass (src/lib/card/card-pass.ts): what an Android phone
 * keeps of one card to pay with it, the app closed, and the keys of that card's own copies
 * (card-own.ts); then how the phone keeps them (card-pass-store.ts).
 */

const secureStore = jest.requireMock<typeof SecureStoreFake>("expo-secure-store");

// The test mnemonic of card-keys.test.ts (all-zero entropy), never a real wallet's.
const MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const ROOT = deriveCardRoot(encodeWalletSecret({ mnemonic: MNEMONIC }));
const UID = "04996c6a926980";
/** Its id and its K2 at version 1, as card-keys.test.ts gives them. */
const CARD_ID = "30c19d9bfae333c1cb42a5ce6e20debb";
const K2_V1 = "f9e1a7eb97511c0388ee46cd0e750271";
const HOST = "relay.sattle.me";

/**
 * IRREVERSIBLE: the keys of a card's own copies, which every card's copies and every phone's pass
 * hold. Computed once with Python's `hmac` (HKDF-SHA256, RFC 5869), not with the app's code; never
 * change them.
 */
const VECTORS = {
  own: {
    1: "1119ed23cc1663b1f701fdd14d318d80f1f70638d64763bfa7a344fe028575d8",
    2: "bb2b5668baeea2be7500a4b26118242f99a06b8c842ff0187d18b70ce371606b"
  },
  keys: {
    stateNostr: "359c775e2f2c2c885079c69136e57b48a47bd454b43f1adb7bf44d21fe1acd69",
    stateEncryption: "6b8adeaf59c670a9a7a866723b35a29b0458f5ee1e7a8ea584571cd9cce41df2",
    stateAddress: "7750739d6f4746a476f27ca640a7a907f83e9f3ea149a3c168922ca7edbab7b5",
    payeesNostr: "15bf681634713f6caf7e2b1773d814ee1f22e894557f5c8a36866bb7046b0173",
    payeesEncryption: "68c4768de81ed11059877cc729c25760a64c1e9e11c76769cbae7357279fb864",
    payeesAddress: "f3e3d1fbfb49da3415381242cfb354dfd64cd6b9c6bcf6723982e45e23239ef8"
  }
};

function state(overrides: Partial<CardState> = {}): CardState {
  return {
    cardId: CARD_ID,
    uid: UID,
    keyVersion: 1,
    status: "active",
    relayHost: HOST,
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
    updatedAt: 1_760_000_000,
    ...overrides
  };
}

/** `c` of the card's tap at `counter`, as the card writes it. */
function cOf(counter: number, k2: string = K2_V1): string {
  return bytesToHex(sunMac(hexToBytes(k2), hexToBytes(UID), counter)).toUpperCase();
}

/**
 * `p` of the card's tap at `counter`, as the card writes it: its PICCData (tag C7, UID, counter in
 * little-endian, 5 bytes of padding) encrypted with the wallet's K1.
 */
function pOf(counter: number, uid: string = UID, k1 = cardEncryptionKey(ROOT)): string {
  const plain = new Uint8Array(16);
  plain[0] = 0xc7;
  plain.set(hexToBytes(uid), 1);
  plain.set([counter & 0xff, (counter >> 8) & 0xff, (counter >> 16) & 0xff], 8);
  plain.set([0x5a, 0x11, 0x22, 0x33, 0x44], 11);
  return bytesToHex(ecb(k1, { disablePadding: true }).encrypt(plain)).toUpperCase();
}

/** A well-formed `p` that no K1 opens into this card's PICCData. */
const P = "0123456789ABCDEF0123456789ABCDEF";

describe("a card's own copies' keys (card-own.ts)", () => {
  it("derive from the card root, the card's id and its wallet's generation (vectors)", () => {
    expect(bytesToHex(cardOwnSecret(ROOT, { cardId: CARD_ID, walletGeneration: 1 }))).toBe(
      VECTORS.own[1]
    );
    expect(bytesToHex(cardOwnSecret(ROOT, { cardId: CARD_ID, walletGeneration: 2 }))).toBe(
      VECTORS.own[2]
    );
    const keys = cardOwnKeys(hexToBytes(VECTORS.own[1]));
    expect(bytesToHex(keys.state.nostr.secretKey)).toBe(VECTORS.keys.stateNostr);
    expect(bytesToHex(keys.state.encryptionKey)).toBe(VECTORS.keys.stateEncryption);
    expect(bytesToHex(keys.state.addressKey)).toBe(VECTORS.keys.stateAddress);
    expect(bytesToHex(keys.payees.nostr.secretKey)).toBe(VECTORS.keys.payeesNostr);
    expect(bytesToHex(keys.payees.encryptionKey)).toBe(VECTORS.keys.payeesEncryption);
    expect(bytesToHex(keys.payees.addressKey)).toBe(VECTORS.keys.payeesAddress);
    // HKDF-SHA256 as RFC 5869 gives it, the app's salt.
    const plain = hkdf(
      sha256,
      ROOT,
      utf8ToBytes("sattle.me/card"),
      utf8ToBytes(`own/v1/${CARD_ID}/1`),
      32
    );
    expect(bytesToHex(plain)).toBe(VECTORS.own[1]);
  });

  it("refuse an id or a generation out of shape", () => {
    expect(() => cardOwnSecret(ROOT, { cardId: "ABC", walletGeneration: 1 })).toThrow();
    expect(() => cardOwnSecret(ROOT, { cardId: CARD_ID, walletGeneration: 0 })).toThrow();
    expect(() => cardOwnKeys(new Uint8Array(16))).toThrow();
  });

  it("read a card's state and book from its copies, none of another wallet nor UID", () => {
    const keys = cardOwnKeys(hexToBytes(VECTORS.own[1]));
    const wallet = { cardId: CARD_ID, walletGeneration: 1 };
    const mode = {
      ...wallet,
      mode: "confirm" as const,
      modeAt: 1_760_000_000_000,
      updatedAt: 1_760_000_000
    };
    const answers = new Map([
      [
        "wss://a",
        [cardStateEvent(keys.state, state({ suspended: true })), payeeModeEvent(keys.payees, mode)]
      ]
    ]);
    const read = cardOwnCopiesOf(keys, wallet, answers, { uid: UID });
    expect(read).toMatchObject({ state: { suspended: true }, newer: false, answered: 1 });
    expect(read.payees.mode).toEqual(mode);
    expect(cardOwnFilter(keys).authors).toEqual([
      keys.state.nostr.publicKey,
      keys.payees.nostr.publicKey
    ]);
    // Another UID than the pass's, another wallet: not this card's.
    expect(cardOwnCopiesOf(keys, wallet, answers, { uid: "04a39493cc8680" }).state).toBeNull();
    expect(
      cardOwnCopiesOf(keys, { cardId: CARD_ID, walletGeneration: 2 }, answers, { uid: UID }).state
    ).toBeNull();
    // Another card's own keys open nothing of them.
    const other = cardOwnKeys(hexToBytes(VECTORS.own[2]));
    expect(cardOwnCopiesOf(other, wallet, answers, { uid: UID })).toMatchObject({
      state: null,
      payees: { mode: null }
    });
  });
});

describe("a card's pass (card-pass.ts)", () => {
  it("holds that card's own secrets only, as the card root gives them", () => {
    const pass = cardPassOf(ROOT, state());
    expect(pass).toMatchObject({
      cardId: CARD_ID,
      walletGeneration: 1,
      uid: UID,
      keyVersion: 1,
      relayHost: HOST
    });
    expect(pass.k1).toEqual(cardEncryptionKey(ROOT));
    expect(bytesToHex(pass.k2)).toBe(K2_V1);
    expect(bytesToHex(pass.ownSecret)).toBe(VECTORS.own[1]);
    expect(walletPhraseOf(pass.walletEntropy)).toBe(cardWalletPhrase(ROOT, CARD_ID, 1));
    const value = cardPassValue(pass);
    expect(Object.keys(value).sort()).toEqual(
      [
        "cardId",
        "walletGeneration",
        "uid",
        "keyVersion",
        "relayHost",
        "k1",
        "k2",
        "walletEntropy",
        "channelSecret",
        "ownSecret"
      ].sort()
    );
    // Never the root nor K0.
    const keys = cardKeysOf(ROOT, hexToBytes(UID), 1);
    const text = JSON.stringify(value);
    for (const secret of [ROOT, keys.k0]) {
      expect(text).not.toContain(bytesToHex(secret));
    }
    expect(parseCardPass(value)).toEqual(pass);
  });

  it("is refused out of shape", () => {
    const value = cardPassValue(cardPassOf(ROOT, state()));
    for (const [key, bad] of [
      ["cardId", "ABC"],
      ["walletGeneration", 0],
      ["uid", "04996C6A926980"],
      ["keyVersion", 0],
      ["relayHost", "Card.Example.com"],
      ["k1", undefined],
      ["k1", "ab".repeat(15)],
      ["k2", "00"],
      ["walletEntropy", 1],
      ["channelSecret", "zz".repeat(32)],
      ["ownSecret", null]
    ] as const) {
      expect(parseCardPass({ ...value, [key]: bad })).toBeNull();
    }
    expect(parseCardPass(null)).toBeNull();
    expect(parseCardPass([value])).toBeNull();
  });

  it("is wiped by its holder", () => {
    const pass = cardPassOf(ROOT, state());
    wipeCardPass(pass);
    for (const bytes of [
      pass.k1,
      pass.k2,
      pass.walletEntropy,
      pass.channelSecret,
      pass.ownSecret
    ]) {
      expect(bytes.every((byte) => byte === 0)).toBe(true);
    }
  });

  describe("checks a tap as the account does: p with K1, c with K2 (findPassTap)", () => {
    let pass: CardPass;
    beforeEach(() => {
      pass = cardPassOf(ROOT, state());
    });

    /** The card's tap at `counter`. */
    const tapOf = (counter: number) => [pOf(counter), cOf(counter)] as const;

    it("takes its counter after the last one seen, up to the hashes left and a deposit beyond", () => {
      const at = { lastCounter: 10, depositedThrough: 1_010 };
      expect(findPassTap(pass, at, ...tapOf(11))).toEqual({ ok: true, counter: 11 });
      // Either case: readers and relays differ.
      expect(findPassTap(pass, at, pOf(500).toLowerCase(), cOf(500).toLowerCase())).toEqual({
        ok: true,
        counter: 500
      });
      expect(findPassTap(pass, at, ...tapOf(1_010 + PASS_TAP_MARGIN))).toEqual({
        ok: true,
        counter: 1_010 + PASS_TAP_MARGIN
      });
      // Past what this phone deposited and a deposit: another phone's hashes, the holder asked.
      expect(findPassTap(pass, at, ...tapOf(1_011 + PASS_TAP_MARGIN))).toEqual({
        ok: false,
        reason: "otherCard"
      });
    });

    it("refuses the card's true c with a p it did not write: the relay's forged tap", () => {
      // The relay keeps the hash of each next `c` (hashes.ts): 64 bits, which it may find by
      // trying them all. Without K1 it cannot make the `p` that goes with it.
      const at = { lastCounter: 10, depositedThrough: 1_010 };
      expect(findPassTap(pass, at, P, cOf(11))).toEqual({ ok: false, reason: "otherCard" });
      // Another tap's `p` of the same card: its counter is not that of `c`.
      expect(findPassTap(pass, at, pOf(12), cOf(11))).toEqual({ ok: false, reason: "otherCard" });
      // A `p` of this UID and counter encrypted with another key.
      const otherK1 = new Uint8Array(16).fill(7);
      expect(findPassTap(pass, at, pOf(11, UID, otherK1), cOf(11))).toEqual({
        ok: false,
        reason: "otherCard"
      });
      expect(pass.k1).toEqual(cardEncryptionKey(ROOT));
    });

    it("says a tap already seen, however old", () => {
      const at = { lastCounter: 100, depositedThrough: 1_100 };
      expect(findPassTap(pass, at, ...tapOf(100))).toEqual({ ok: false, reason: "replayed" });
      expect(findPassTap(pass, at, ...tapOf(1))).toEqual({ ok: false, reason: "replayed" });
      expect(findPassTap(pass, at, ...tapOf(101))).toEqual({ ok: true, counter: 101 });
    });

    it("refuses another card's tap, one of other keys, and one out of shape", () => {
      const at = { lastCounter: 10, depositedThrough: 1_010 };
      // The same card's tap at its next keys' version: not this pass's.
      const k2v2 = bytesToHex(cardKeysOf(ROOT, hexToBytes(UID), 2).k2);
      expect(findPassTap(pass, at, pOf(11), cOf(11, k2v2))).toEqual({
        ok: false,
        reason: "otherCard"
      });
      // Another card of the wallet (same K1): its UID is not the pass's.
      const other = cardPassOf(ROOT, state({ uid: "04a39493cc8680", cardId: "0".repeat(32) }));
      expect(findPassTap(other, at, ...tapOf(11))).toEqual({ ok: false, reason: "otherCard" });
      expect(findPassTap(pass, at, "p", cOf(11))).toEqual({ ok: false, reason: "malformed" });
      expect(findPassTap(pass, at, pOf(11), "1234")).toEqual({ ok: false, reason: "malformed" });
    });
  });
});

describe("the passes the phone keeps (card-pass-store.ts)", () => {
  const WALLET = "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";

  it("keeps them for one wallet, at a key never renamed, in format 2", async () => {
    expect(CARD_PASSES_KEY).toBe("card-passes");
    const pass = cardPassOf(ROOT, state());
    await expect(keepCardPasses(WALLET, [pass])).resolves.toBe(true);
    expect(JSON.parse(secureStore.items.get(CARD_PASSES_KEY)!)).toEqual({
      version: 2,
      walletId: WALLET,
      passes: [cardPassValue(pass)]
    });
    expect(await loadCardPasses(WALLET)).toEqual({ passes: [pass], newer: false });
    expect(await loadCardPasses("02" + "ab".repeat(32))).toEqual({ passes: [], newer: false });
    // None: forgotten.
    await keepCardPasses(WALLET, []);
    expect(secureStore.items.has(CARD_PASSES_KEY)).toBe(false);
  });

  it("writes only what changed, and trusts none of a copy out of shape", async () => {
    const pass = cardPassOf(ROOT, state());
    await keepCardPasses(WALLET, [pass]);
    const writes = secureStore.setItemAsync.mock.calls.length;
    await keepCardPasses(WALLET, [cardPassOf(ROOT, state())]);
    expect(secureStore.setItemAsync.mock.calls.length).toBe(writes);
    const stored = JSON.parse(secureStore.items.get(CARD_PASSES_KEY)!) as { passes: object[] };
    secureStore.items.set(
      CARD_PASSES_KEY,
      JSON.stringify({ ...stored, passes: [...stored.passes, { cardId: "x" }] })
    );
    expect(await loadCardPasses(WALLET)).toEqual({ passes: [], newer: false });
    // None to keep any more: the copy out of shape goes too, with the secrets it still holds.
    await expect(keepCardPasses(WALLET, [])).resolves.toBe(true);
    expect(secureStore.items.has(CARD_PASSES_KEY)).toBe(false);
  });

  it("is the same wallet's whatever the case of its id: not written again", async () => {
    await keepCardPasses(WALLET, [cardPassOf(ROOT, state())]);
    const writes = secureStore.setItemAsync.mock.calls.length;
    await keepCardPasses(WALLET.toUpperCase(), [cardPassOf(ROOT, state())]);
    expect(secureStore.setItemAsync.mock.calls.length).toBe(writes);
    expect((await loadCardPasses(WALLET.toUpperCase())).passes).toHaveLength(1);
  });

  it("never uses nor writes over a newer app's", async () => {
    secureStore.items.set(CARD_PASSES_KEY, JSON.stringify({ version: 3, walletId: WALLET }));
    expect(await loadCardPasses(WALLET)).toEqual({ passes: [], newer: true });
    await expect(keepCardPasses(WALLET, [cardPassOf(ROOT, state())])).resolves.toBe(false);
    await expect(keepCardPasses(WALLET, [])).resolves.toBe(false);
    expect(JSON.parse(secureStore.items.get(CARD_PASSES_KEY)!)).toEqual({
      version: 3,
      walletId: WALLET
    });
  });

  it("never uses a pass of format 1 (no K1), and writes format 2 over it", async () => {
    const pass = cardPassOf(ROOT, state());
    const { k1: _k1, ...withoutK1 } = cardPassValue(pass);
    secureStore.items.set(
      CARD_PASSES_KEY,
      JSON.stringify({ version: 1, walletId: WALLET, passes: [withoutK1] })
    );
    expect(await loadCardPasses(WALLET)).toEqual({ passes: [], newer: false });
    await expect(keepCardPasses(WALLET, [pass])).resolves.toBe(true);
    expect(JSON.parse(secureStore.items.get(CARD_PASSES_KEY)!)).toMatchObject({ version: 2 });
    expect(await loadCardPasses(WALLET)).toEqual({ passes: [pass], newer: false });
    // None to keep: it goes, with the secrets it held.
    secureStore.items.set(
      CARD_PASSES_KEY,
      JSON.stringify({ version: 1, walletId: WALLET, passes: [withoutK1] })
    );
    await expect(keepCardPasses(WALLET, [])).resolves.toBe(true);
    expect(secureStore.items.has(CARD_PASSES_KEY)).toBe(false);
  });
});
