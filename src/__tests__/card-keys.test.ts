import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";

import { DEFAULT_CARD_RELAY_HOST } from "@/config/card";
import { isBip39Phrase, recoveryWords } from "@/lib/breez/recovery-phrase";
import { encodeWalletSecret } from "@/lib/breez/secret";
import {
  FIRST_CARD_WALLET_GENERATION,
  MAX_KEY_VERSION,
  cardEncryptionKey,
  cardIdOf,
  cardKeysOf,
  cardWalletPhrase,
  channelSecretOf,
  deriveCardRoot,
  wipeCardKeys
} from "@/lib/card/keys";
import { canonicalRelayHost, isCanonicalRelayHost } from "@/lib/card/relay-host";

// A BIP-39 test mnemonic (all-zero entropy), never a real wallet's.
const MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const SECRET = encodeWalletSecret({ mnemonic: MNEMONIC });
const UID = hexToBytes("04996c6a926980");

/**
 * IRREVERSIBLE: the keys every paired card holds. Computed with Node's `crypto.hkdfSync`, not with
 * the app's code; never change them.
 */
const VECTORS = {
  root: "ba08cfc99b326a2467148c18acd3aa8d0cd46b30a01c97dabcd4f7cd026d22ec",
  k1: "a9a7a4665b113ebe7229fe456f75c8e1",
  id: "30c19d9bfae333c1cb42a5ce6e20debb",
  v1: {
    k0: "bb00a30323ede174c23bb7e9f921e06c",
    k2: "f9e1a7eb97511c0388ee46cd0e750271",
    k3: "3d92c3aeb1931e649c8e148c255d2adc",
    k4: "95b1fd8fce52f20218c2a51bdfed0a72"
  },
  v2: {
    k0: "eb73d5bee4aa065d0e5905ebb2c3a7c7",
    k2: "a0868f0b1e1eb1d8a213f5db1f6fb20c",
    k3: "2fffeb13ca551c57df1c9c3f5c76f820",
    k4: "4e65f542901d28e03649273ff9622433"
  },
  channel: "f5235b6fe33de4c5e818c6e4a2b96a79aac00809433bf09e0b5762e08e99fe37",
  /**
   * The words of the card's wallet at generations 1 and 2: their entropy computed with Node's
   * `crypto.hkdfSync` and Python's `hmac`, their words with a BIP-39 encoder of Python checked
   * against the official vectors.
   */
  wallet: {
    1: {
      entropy: "a01cc80ab01ed7be3e839146d81a2539",
      phrase: "parade town actor gasp uniform tenant wheel impulse egg school matter increase"
    },
    2: {
      entropy: "7d5afe642f280d311779875b937f8fee",
      phrase: "later subject october furnace liar obtain fuel couch fortune orbit token symptom"
    }
  }
};

/** HKDF-SHA256 under the card salt, with each `info` spelled out here. */
function plainHkdf(secret: Uint8Array, info: string, length = 32): string {
  return bytesToHex(hkdf(sha256, secret, utf8ToBytes("sattle.me/card"), utf8ToBytes(info), length));
}

describe("card keys", () => {
  const root = deriveCardRoot(SECRET);

  it("keeps the released derivations (vectors)", () => {
    expect(bytesToHex(root)).toBe(VECTORS.root);
    expect(bytesToHex(cardEncryptionKey(root))).toBe(VECTORS.k1);
    expect(cardIdOf(root, UID)).toBe(VECTORS.id);
    for (const version of [1, 2] as const) {
      const keys = cardKeysOf(root, UID, version);
      const expected = VECTORS[`v${version}`];
      expect(bytesToHex(keys.k0)).toBe(expected.k0);
      expect(bytesToHex(keys.k1)).toBe(VECTORS.k1);
      expect(bytesToHex(keys.k2)).toBe(expected.k2);
      expect(bytesToHex(keys.k3)).toBe(expected.k3);
      expect(bytesToHex(keys.k4)).toBe(expected.k4);
    }
    // The vector's relay host: any host derives its own secret, by the same formula.
    expect(bytesToHex(channelSecretOf(root, VECTORS.id, "relay.sattle.me"))).toBe(VECTORS.channel);
    expect(FIRST_CARD_WALLET_GENERATION).toBe(1);
    expect(cardWalletPhrase(root, VECTORS.id, 1)).toBe(VECTORS.wallet[1].phrase);
    expect(cardWalletPhrase(root, VECTORS.id, 2)).toBe(VECTORS.wallet[2].phrase);
  });

  it("is HKDF-SHA256 under the card salt, with these exact `info` strings", () => {
    expect(plainHkdf(root, `wallet/v1/${VECTORS.id}/1`, 16)).toBe(VECTORS.wallet[1].entropy);
    expect(plainHkdf(root, `wallet/v1/${VECTORS.id}/2`, 16)).toBe(VECTORS.wallet[2].entropy);
    expect(plainHkdf(SECRET, "card-root/v1")).toBe(VECTORS.root);
    expect(plainHkdf(root, "k1/v1", 16)).toBe(VECTORS.k1);
    expect(plainHkdf(root, "card-id/v1/04996c6a926980", 16)).toBe(VECTORS.id);
    expect(plainHkdf(root, "k2/v1/04996c6a926980/1", 16)).toBe(VECTORS.v1.k2);
    expect(plainHkdf(root, `channel-secret/v1/${VECTORS.id}/relay.sattle.me`)).toBe(
      VECTORS.channel
    );
  });

  it("gives five distinct keys, and new ones but K1 at each version", () => {
    const first = cardKeysOf(root, UID, 1);
    const second = cardKeysOf(root, UID, 2);
    const all = [first.k0, first.k1, first.k2, first.k3, first.k4].map(bytesToHex);

    expect(new Set(all).size).toBe(5);
    expect(all.every((key) => key.length === 32)).toBe(true);
    expect(second.k1).toEqual(first.k1);
    expect(second.k0).not.toEqual(first.k0);
    expect(second.k2).not.toEqual(first.k2);
  });

  it("gives another card, wallet or relay other keys and channels", () => {
    const otherUid = hexToBytes("04996c6a926981");
    const otherRoot = deriveCardRoot(encodeWalletSecret({ mnemonic: `${MNEMONIC} zoo` }));

    expect(cardIdOf(root, otherUid)).not.toBe(VECTORS.id);
    expect(cardKeysOf(root, otherUid, 1).k2).not.toEqual(cardKeysOf(root, UID, 1).k2);
    expect(cardIdOf(otherRoot, UID)).not.toBe(VECTORS.id);
    expect(cardEncryptionKey(otherRoot)).not.toEqual(cardEncryptionKey(root));
    expect(channelSecretOf(root, VECTORS.id, "relay.example.org")).not.toEqual(
      channelSecretOf(root, VECTORS.id, DEFAULT_CARD_RELAY_HOST)
    );
    // Each card its own wallet, and none of them the account's nor another account's card's.
    const otherId = cardIdOf(root, otherUid);
    expect(cardWalletPhrase(root, otherId, 1)).not.toBe(VECTORS.wallet[1].phrase);
    expect(cardWalletPhrase(otherRoot, VECTORS.id, 1)).not.toBe(VECTORS.wallet[1].phrase);
    expect(cardWalletPhrase(root, VECTORS.id, 1)).not.toBe(MNEMONIC);
  });

  it("gives a card's wallet a BIP-39 phrase of 12 words its wallets restore", () => {
    const words = cardWalletPhrase(root, VECTORS.id, 1).split(" ");
    expect(words).toHaveLength(12);
    expect(isBip39Phrase(words)).toBe(true);
    expect(recoveryWords(words.join(" "), undefined)).toEqual(words);
  });

  it("refuses a card wallet's id or generation out of shape", () => {
    for (const id of [VECTORS.id.toUpperCase(), VECTORS.id.slice(1), `${VECTORS.id}0`, ""]) {
      expect(() => cardWalletPhrase(root, id, 1)).toThrow(/card id/);
    }
    for (const generation of [0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => cardWalletPhrase(root, VECTORS.id, generation)).toThrow(/generation/);
    }
  });

  it("refuses a version, UID, id or host out of shape", () => {
    for (const version of [0, MAX_KEY_VERSION + 1, 1.5, Number.NaN]) {
      expect(() => cardKeysOf(root, UID, version)).toThrow(/version/);
    }
    expect(() => cardKeysOf(root, UID, MAX_KEY_VERSION)).not.toThrow();
    expect(() => cardIdOf(root, UID.slice(1))).toThrow(/UID/);
    expect(() => channelSecretOf(root, VECTORS.id.toUpperCase(), DEFAULT_CARD_RELAY_HOST)).toThrow(
      /card id/
    );
    expect(() => channelSecretOf(root, VECTORS.id, "Relay.Sattle.Me")).toThrow(/host/);
    expect(() => channelSecretOf(root, VECTORS.id, `${DEFAULT_CARD_RELAY_HOST}:443`)).toThrow(
      /host/
    );
  });

  it("wipes keys once used", () => {
    const keys = cardKeysOf(root, UID, 1);
    wipeCardKeys(keys);

    expect(
      [keys.k0, keys.k1, keys.k2, keys.k3, keys.k4].every((k) => k.every((b) => b === 0))
    ).toBe(true);
  });
});

describe("the default card relay", () => {
  it("is the host written into every card paired with it (DEFINITIVE)", () => {
    expect(DEFAULT_CARD_RELAY_HOST).toBe("relay.sattle.me");
    expect(isCanonicalRelayHost(DEFAULT_CARD_RELAY_HOST)).toBe(true);
  });
});

describe("canonicalRelayHost", () => {
  it.each([
    ["relay.sattle.me", "relay.sattle.me"],
    ["Card.Example.ORG", "card.example.org"],
    ["relay.example.org:443", "relay.example.org"],
    ["relay.example.org:8443", "relay.example.org:8443"],
    ["xn--bcher-kva.example", "xn--bcher-kva.example"],
    ["192.0.2.10", "192.0.2.10"]
  ])("reads %s as %s", (text, host) => {
    expect(canonicalRelayHost(text)).toBe(host);
  });

  it.each([
    "",
    "localhost",
    "https://relay.example.org",
    "relay.example.org/w",
    "relay.example.org.",
    " relay.example.org",
    "-relay.example.org",
    "relay-.example.org",
    "relay..example.org",
    "relay.example.org:0",
    "relay.example.org:080",
    "relay.example.org:65536",
    "relay.example.org:",
    "user@relay.example.org",
    "[2001:db8::1]",
    "relay.123",
    "256.0.0.1",
    "bücher.example",
    `${"a".repeat(64)}.example.org`
  ])("refuses %j", (text) => {
    expect(canonicalRelayHost(text)).toBeNull();
  });
});
