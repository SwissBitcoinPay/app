import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";

import { BIP39_ENGLISH } from "@/lib/breez/bip39-english";
import { bip39PhraseOf, isBip39Phrase, recoveryWords } from "@/lib/breez/recovery-phrase";
import { recoveryPhraseOf } from "@/lib/breez/seed";
import { recoveryPhraseOf as webRecoveryPhraseOf } from "@/lib/breez/seed.web";
import type { WalletSeed } from "@/lib/breez/types";

import { TEST_MNEMONIC, testSeed } from "../../jest/account";

/**
 * The phrases of 12 and 24 words of the official BIP-39 test vectors (trezor/python-mnemonic,
 * vectors.json, "english").
 */
const VECTORS = [
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about",
  "legal winner thank year wave sausage worth useful legal winner thank yellow",
  "letter advice cage absurd amount doctor acoustic avoid letter advice cage above",
  "zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo wrong",
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art",
  "legal winner thank year wave sausage worth useful legal winner thank year wave sausage worth useful legal winner thank year wave sausage worth title",
  "letter advice cage absurd amount doctor acoustic avoid letter advice cage absurd amount doctor acoustic avoid letter advice cage absurd amount doctor acoustic bless",
  "zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo vote",
  "ozone drill grab fiber curtain grace pudding thank cruise elder eight picnic",
  "hamster diagram private dutch cause delay private meat slide toddler razor book happy fancy gospel tennis maple dilemma loan word shrug inflict delay length",
  "scheme spot photo card baby mountain device kick cradle pact join borrow",
  "panda eyebrow bullet gorilla call smoke muffin taste mesh discover soft ostrich alcohol speed nation flash devote level hobby quick inner drive ghost inside",
  "cat swing flag economy stadium alone churn speed unique patch report train",
  "all hour make first leader extend hole alien behind guard gospel lava path output census museum junior mass reopen famous sing advance salt reform",
  "vessel ladder alter error federal sibling chat ability sun glass valve picture",
  "void come effort suffer camp survey warrior heavy shoot primary clutch crush open amazing screen patrol group space point ten exist slush involve unfold"
];

/** A web SDK seed (`Seed` of @breeztech/breez-sdk-spark), as passkey.web.ts gives it. */
function webSeed(mnemonic: string, passphrase?: string): WalletSeed {
  return { type: "mnemonic", mnemonic, passphrase } as unknown as WalletSeed;
}

describe("the BIP-39 word list", () => {
  it("is the official English list, word for word", () => {
    expect(BIP39_ENGLISH).toHaveLength(2048);
    expect(bytesToHex(sha256(utf8ToBytes(`${BIP39_ENGLISH.join("\n")}\n`)))).toBe(
      "2f5eed53a4727b4bf8880d8f3f199efc90e58503646d9ff8eff3a2ed3b24dbda"
    );
  });
});

describe("isBip39Phrase", () => {
  it("accepts the official vectors of 12 and 24 words", () => {
    expect(VECTORS).toHaveLength(16);
    for (const phrase of VECTORS) expect(isBip39Phrase(phrase.split(" "))).toBe(true);
  });

  it("refuses a wrong checksum, a word out of the list, another case or another length", () => {
    const valid = TEST_MNEMONIC.split(" ");
    expect(isBip39Phrase(valid)).toBe(true);
    // The last word carries the checksum: "abandon" there is wrong.
    expect(isBip39Phrase([...valid.slice(0, 11), "abandon"])).toBe(false);
    expect(isBip39Phrase([...valid.slice(0, 11), "abouts"])).toBe(false);
    expect(isBip39Phrase(valid.map((word) => word.toUpperCase()))).toBe(false);
    expect(isBip39Phrase(valid.slice(0, 11))).toBe(false);
    expect(isBip39Phrase([...valid, "abandon"])).toBe(false);
    expect(isBip39Phrase([])).toBe(false);
    // The official vector of 18 words: BIP-39, but no length the Breez SDK documents.
    expect(
      isBip39Phrase(
        "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon agent".split(
          " "
        )
      )
    ).toBe(false);
    // Not an Object's own keys: a Map.
    expect(isBip39Phrase([...valid.slice(0, 11), "constructor"])).toBe(false);
  });
});

describe("recoveryWords", () => {
  it("gives the words of a phrase written as the SDK writes it, without a passphrase", () => {
    expect(recoveryWords(TEST_MNEMONIC, undefined)).toEqual(TEST_MNEMONIC.split(" "));
    expect(recoveryWords(TEST_MNEMONIC, "")).toEqual(TEST_MNEMONIC.split(" "));
  });

  it("gives none with a passphrase, which the words alone would not restore", () => {
    expect(recoveryWords(TEST_MNEMONIC, "TREZOR")).toBeNull();
  });

  it("gives none of words written otherwise or failing their checksum", () => {
    expect(recoveryWords(`${TEST_MNEMONIC} `, undefined)).toBeNull();
    expect(recoveryWords(TEST_MNEMONIC.replace(" ", "  "), undefined)).toBeNull();
    expect(recoveryWords(TEST_MNEMONIC.replace("about", "abandon"), undefined)).toBeNull();
  });
});

/** The entropy a phrase carries (its bits without the checksum), read without the app's code. */
function entropyOf(phrase: string): Uint8Array {
  const words = phrase.split(" ");
  let bits = 0n;
  for (const word of words) bits = (bits << 11n) | BigInt(BIP39_ENGLISH.indexOf(word));
  const checksumBits = words.length / 3;
  const entropy = new Uint8Array((words.length * 11 - checksumBits) / 8);
  let rest = bits >> BigInt(checksumBits);
  for (let at = entropy.length - 1; at >= 0; at--) {
    entropy[at] = Number(rest & 0xffn);
    rest >>= 8n;
  }
  return entropy;
}

describe("bip39PhraseOf", () => {
  it("gives the words of the official vectors from their entropy", () => {
    const fill = (byte: number, length: number) => new Uint8Array(length).fill(byte);
    expect(bip39PhraseOf(fill(0x00, 16)).join(" ")).toBe(VECTORS[0]);
    expect(bip39PhraseOf(fill(0x7f, 16)).join(" ")).toBe(VECTORS[1]);
    expect(bip39PhraseOf(fill(0x80, 16)).join(" ")).toBe(VECTORS[2]);
    expect(bip39PhraseOf(fill(0xff, 16)).join(" ")).toBe(VECTORS[3]);
    expect(bip39PhraseOf(fill(0x00, 32)).join(" ")).toBe(VECTORS[4]);
    expect(bip39PhraseOf(fill(0x7f, 32)).join(" ")).toBe(VECTORS[5]);
    expect(bip39PhraseOf(fill(0x80, 32)).join(" ")).toBe(VECTORS[6]);
    expect(bip39PhraseOf(fill(0xff, 32)).join(" ")).toBe(VECTORS[7]);
    expect(bip39PhraseOf(hexToBytes("9e885d952ad362caeb4efe34a8e91bd2")).join(" ")).toBe(
      VECTORS[8]
    );
    expect(
      bip39PhraseOf(
        hexToBytes("68a79eaca2324873eacc50cb9c6eca8cc68ea5d936f98787c60c7ebc74e6ce7c")
      ).join(" ")
    ).toBe(VECTORS[9]);
  });

  it("gives back every official phrase from the entropy it carries", () => {
    for (const phrase of VECTORS) expect(bip39PhraseOf(entropyOf(phrase)).join(" ")).toBe(phrase);
  });

  it("refuses entropy of another length than 16 or 32 bytes", () => {
    for (const length of [0, 15, 17, 20, 24, 28, 31, 33]) {
      expect(() => bip39PhraseOf(new Uint8Array(length))).toThrow(/16 or 32 bytes/);
    }
  });
});

describe("recoveryPhraseOf", () => {
  it("reads a native SDK seed (Seed.Mnemonic), never raw entropy", () => {
    expect(recoveryPhraseOf(testSeed())).toEqual(TEST_MNEMONIC.split(" "));
    const entropy = { tag: "Entropy", inner: [new ArrayBuffer(16)] } as unknown as WalletSeed;
    expect(recoveryPhraseOf(entropy)).toBeNull();
    const withPassphrase = {
      tag: "Mnemonic",
      inner: { mnemonic: TEST_MNEMONIC, passphrase: "TREZOR" }
    } as unknown as WalletSeed;
    expect(recoveryPhraseOf(withPassphrase)).toBeNull();
  });

  it("reads a web SDK seed the same way", () => {
    expect(webRecoveryPhraseOf(webSeed(TEST_MNEMONIC))).toEqual(TEST_MNEMONIC.split(" "));
    expect(webRecoveryPhraseOf(webSeed(TEST_MNEMONIC, "TREZOR"))).toBeNull();
    const entropy = Object.assign([...new Uint8Array(16)], { type: "entropy" });
    expect(webRecoveryPhraseOf(entropy as unknown as WalletSeed)).toBeNull();
  });
});
