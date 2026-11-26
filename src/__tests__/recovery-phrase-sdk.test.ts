/**
 * @jest-environment node
 */
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { hmac } from "@noble/hashes/hmac.js";
import { pbkdf2 } from "@noble/hashes/pbkdf2.js";
import { sha256, sha512 } from "@noble/hashes/sha2.js";
import { bytesToHex, concatBytes, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";

import { BIP39_ENGLISH } from "@/lib/breez/bip39-english";
import { WALLET_LABEL } from "@/lib/breez/config";
import { encodeWalletSecret } from "@/lib/breez/secret";
import { recoveryPhraseOf } from "@/lib/breez/seed";
import { recoveryPhraseOf as webRecoveryPhraseOf } from "@/lib/breez/seed.web";
import type { WalletSeed } from "@/lib/breez/types";
import { cardWalletPhrase, deriveCardRoot } from "@/lib/card/keys";

/*
 * What the Breez SDK gives for a wallet of a passkey, and what its recovery phrase restores,
 * checked with the SDK itself: its WebAssembly build for Node (@breeztech/breez-sdk-spark 0.28.4,
 * the Rust core of the native build too), without any network. The passkey is a PRF provider of
 * the test (HMAC-SHA256 of each salt, as WebAuthn's PRF): the SDK derives the wallet from its
 * outputs as from a real passkey's.
 */

type Sdk = typeof import("@breeztech/breez-sdk-spark/nodejs");
type PrfProvider = ConstructorParameters<Sdk["PasskeyClient"]>[0];

declare const __dirname: string;
const { join } = jest.requireActual<{ join(...segments: string[]): string }>("path");

/**
 * The SDK's bindings, without the storage set-up of its Node entry (no wallet is connected): the
 * file its `nodejs` export loads (package.json of @breeztech/breez-sdk-spark 0.28.4).
 */
function loadSdk(): Sdk {
  return jest.requireActual(
    join(
      __dirname,
      "..",
      "..",
      "node_modules",
      "@breeztech",
      "breez-sdk-spark",
      "nodejs",
      "breez_sdk_spark_wasm.js"
    )
  );
}

const PASSKEY_KEY = utf8ToBytes("a passkey of the tests, never a real one");

/** The passkey's PRF output for `salt`. */
function prf(salt: string): Uint8Array {
  return hmac(sha256, PASSKEY_KEY, utf8ToBytes(salt));
}

const provider: PrfProvider = {
  deriveSeeds: async (salts: string[]) => ({ seeds: salts.map(prf), credentialId: null }),
  isSupported: async () => true
};

/** BIP-39: the words of `entropy` (its bits, then its checksum, 11 bits a word). */
function wordsOf(entropy: Uint8Array): string[] {
  const checksumBits = (entropy.length * 8) / 32;
  let bits = BigInt(`0x${bytesToHex(entropy)}`);
  bits = (bits << BigInt(checksumBits)) | BigInt(sha256(entropy)[0] >> (8 - checksumBits));
  const count = ((entropy.length * 8 + checksumBits) / 11) | 0;
  return Array.from(
    { length: count },
    (_, at) => BIP39_ENGLISH[Number((bits >> BigInt((count - 1 - at) * 11)) & 0x7ffn)]
  );
}

/** BIP-39: the seed of a phrase (PBKDF2-HMAC-SHA512, 2048 rounds, salt "mnemonic" + passphrase). */
function bip39Seed(words: readonly string[], passphrase = ""): Uint8Array {
  return pbkdf2(sha512, utf8ToBytes(words.join(" ")), utf8ToBytes(`mnemonic${passphrase}`), {
    c: 2048,
    dkLen: 64
  });
}

/** BIP-32: the compressed public key at a path of hardened indexes, from a BIP-39 seed. */
function hardenedPublicKey(seed: Uint8Array, indexes: readonly number[]): string {
  const n = secp256k1.Point.CURVE().n;
  let node = hmac(sha512, utf8ToBytes("Bitcoin seed"), seed);
  for (const index of indexes) {
    const data = new Uint8Array(37);
    data.set(node.subarray(0, 32), 1);
    new DataView(data.buffer).setUint32(33, (index | 0x80000000) >>> 0);
    const next = hmac(sha512, node.subarray(32), data);
    const key =
      (BigInt(`0x${bytesToHex(next.subarray(0, 32))}`) +
        BigInt(`0x${bytesToHex(node.subarray(0, 32))}`)) %
      n;
    node = concatBytes(hexToBytes(key.toString(16).padStart(64, "0")), next.subarray(32));
  }
  return bytesToHex(secp256k1.getPublicKey(node.subarray(0, 32), true));
}

/** The Spark identity on mainnet (spark-sdk 0.28.4, signer/default_signer.rs): m/8797555'/1'/0'. */
function sparkIdentityOf(words: readonly string[]): string {
  return hardenedPublicKey(bip39Seed(words), [8797555, 1, 0]);
}

/** The identity the SDK gives a phrase, as its seed-based connect does (`defaultExternalSigners`). */
async function sdkIdentityOf(sdk: Sdk, mnemonic: string, passphrase?: string): Promise<string> {
  const signers = sdk.defaultExternalSigners(mnemonic, passphrase ?? null, "mainnet", null);
  try {
    const key = await signers.sparkSigner.getIdentityPublicKey();
    return bytesToHex(Uint8Array.from(key.bytes));
  } finally {
    signers.free();
  }
}

/** The wallet of the test's passkey, as the app signs in (passkey.ts: the label, no Nostr). */
async function passkeyWallet(sdk: Sdk) {
  const client = new sdk.PasskeyClient(provider, null, null);
  try {
    return (await client.signIn({ label: WALLET_LABEL })).wallet;
  } finally {
    client.free();
  }
}

describe("the recovery phrase of a passkey's wallet (Breez SDK 0.28.4)", () => {
  it("is the 12 BIP-39 words of the first 16 bytes of the passkey's PRF output, no passphrase", async () => {
    const { seed } = await passkeyWallet(loadSdk());
    expect(seed).toMatchObject({ type: "mnemonic" });
    if (seed.type !== "mnemonic") throw new Error("Not a mnemonic");
    expect(seed.passphrase).toBeUndefined();

    const words = webRecoveryPhraseOf(seed as unknown as WalletSeed);
    expect(words).toEqual(wordsOf(prf(WALLET_LABEL).subarray(0, 16)));
    expect(words).toHaveLength(12);
    // The native SDK gives the same seed as `Seed.Mnemonic` (the same Rust core).
    const native = { tag: "Mnemonic", inner: { mnemonic: seed.mnemonic, passphrase: undefined } };
    expect(recoveryPhraseOf(native as unknown as WalletSeed)).toEqual(words);
  });

  it("restores the same Spark identity, in the SDK and in any BIP-39 wallet", async () => {
    const sdk = loadSdk();
    const { seed } = await passkeyWallet(sdk);
    if (seed.type !== "mnemonic") throw new Error("Not a mnemonic");
    const words = webRecoveryPhraseOf(seed as unknown as WalletSeed);
    if (!words) throw new Error("No recovery phrase");

    const identity = await sdkIdentityOf(sdk, seed.mnemonic, seed.passphrase);
    expect(identity).toMatch(/^0[23][0-9a-f]{64}$/);
    // The words as shown, typed again: the same wallet.
    await expect(sdkIdentityOf(sdk, words.join(" "))).resolves.toBe(identity);
    // Derived without the SDK, by BIP-39 and BIP-32 alone: the same identity.
    expect(sparkIdentityOf(words)).toBe(identity);
  });

  it("restores a card's wallet from its words, as the SDK connects it (card-keys.test.ts)", async () => {
    const sdk = loadSdk();
    // The card of card-keys.test.ts: the card root of the BIP-39 test mnemonic, its UID's id.
    const root = deriveCardRoot(
      encodeWalletSecret({
        mnemonic:
          "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about"
      })
    );
    const phrase = cardWalletPhrase(root, "30c19d9bfae333c1cb42a5ce6e20debb", 1);
    // IRREVERSIBLE: the Spark identity of that card's wallet, given by the SDK (the card salt of
    // sattle.me).
    const identity = "0220d6f8c1b9741d354fa94d148482c752223fddea3475b093380d0ca3c700a215";

    await expect(sdkIdentityOf(sdk, phrase)).resolves.toBe(identity);
    expect(sparkIdentityOf(phrase.split(" "))).toBe(identity);
  });

  it("derives BIP-39 seeds as the official vectors (the check above derives right)", () => {
    expect(bytesToHex(bip39Seed("abandon ".repeat(11).concat("about").split(" "), "TREZOR"))).toBe(
      "c55257c360c07c72029aebc1b53c05ed0362ada38ead3e3e9efa3708e53495531f09a6987599d18264c1e1c92f2cf141630c7a3c4ab7c81b2f001698e7463b04"
    );
  });
});
