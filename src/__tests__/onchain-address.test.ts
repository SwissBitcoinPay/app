import { taprootAddress } from "../../jest/bitcoin";
import { bytesToWords, encodeBech32 } from "../../jest/lightning";
import { decodeBech32, decodeBech32m } from "../lib/lightning/bech32";
import { addressHrp, parseDepositAddress } from "../lib/onchain/address";
import { parseSentAddress } from "../lib/onchain/sent-address";

// BIP-350's test vectors, checked against its reference implementation.
const BIP350_TAPROOT = "bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0";
// Its "bech32 instead of bech32m" vector: the same program under the wrong checksum.
const BIP350_WRONG_CHECKSUM = "bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqh2y7hd";
const SEGWIT_V0 = "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4";

describe("bech32m", () => {
  it("tells the two checksums apart", () => {
    expect(decodeBech32m(BIP350_TAPROOT)).not.toBeNull();
    expect(decodeBech32(BIP350_TAPROOT)).toBeNull();
    expect(decodeBech32m(BIP350_WRONG_CHECKSUM)).toBeNull();
    expect(decodeBech32(SEGWIT_V0)).not.toBeNull();
    expect(decodeBech32m(SEGWIT_V0)).toBeNull();
  });
});

describe("parseDepositAddress", () => {
  it("accepts a taproot address of the build's network, as explorers print it", () => {
    expect(addressHrp("mainnet")).toBe("bc");
    expect(addressHrp("regtest")).toBe("bcrt");
    expect(parseDepositAddress(BIP350_TAPROOT, "mainnet")).toBe(BIP350_TAPROOT);
    expect(parseDepositAddress(BIP350_TAPROOT.toUpperCase(), "mainnet")).toBe(BIP350_TAPROOT);
    expect(parseDepositAddress(taprootAddress(3, "bcrt"), "regtest")).toBe(
      taprootAddress(3, "bcrt")
    );
  });

  it("refuses anything a Spark deposit address cannot be", () => {
    // Another network.
    expect(parseDepositAddress(BIP350_TAPROOT, "regtest")).toBeNull();
    expect(parseDepositAddress(taprootAddress(3, "bcrt"), "mainnet")).toBeNull();
    // Segwit v0, the wrong checksum, mixed case, damaged, too long.
    expect(parseDepositAddress(SEGWIT_V0, "mainnet")).toBeNull();
    expect(parseDepositAddress(BIP350_WRONG_CHECKSUM, "mainnet")).toBeNull();
    expect(parseDepositAddress(`BC1P${BIP350_TAPROOT.slice(4)}`, "mainnet")).toBeNull();
    expect(parseDepositAddress(`${BIP350_TAPROOT.slice(0, -1)}q`, "mainnet")).toBeNull();
    expect(parseDepositAddress(`${BIP350_TAPROOT}${"q".repeat(40)}`, "mainnet")).toBeNull();
    expect(parseDepositAddress("", "mainnet")).toBeNull();
    // Witness v1 with a 20-byte program, v2 with 32 bytes: not taproot.
    const v1Short = encodeBech32(
      "bc",
      [1, ...bytesToWords(new Uint8Array(20).fill(1))],
      0x2bc830a3
    );
    const v2 = encodeBech32("bc", [2, ...bytesToWords(new Uint8Array(32).fill(1))], 0x2bc830a3);
    expect(decodeBech32m(v1Short)).not.toBeNull();
    expect(parseDepositAddress(v1Short, "mainnet")).toBeNull();
    expect(parseDepositAddress(v2, "mainnet")).toBeNull();
    // 32 bytes whose padding bits are not zeros.
    const words = [1, ...bytesToWords(new Uint8Array(32).fill(1))];
    words[words.length - 1] |= 1;
    expect(parseDepositAddress(encodeBech32("bc", words, 0x2bc830a3), "mainnet")).toBeNull();
  });
});

describe("parseSentAddress", () => {
  // The Bitcoin wiki's examples of a P2PKH and a P2SH address, and BIP-173's P2WSH: checked
  // against @scure/btc-signer, which the app reads them with.
  const P2PKH = "1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2";
  const P2SH = "3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy";
  const P2WSH = "bc1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3qccfmv3";

  it("keeps a mainnet address of every type a withdrawal pays, segwit in lowercase", () => {
    expect(parseSentAddress(P2PKH)).toBe(P2PKH);
    expect(parseSentAddress(P2SH)).toBe(P2SH);
    expect(parseSentAddress(SEGWIT_V0)).toBe(SEGWIT_V0);
    expect(parseSentAddress(SEGWIT_V0.toUpperCase())).toBe(SEGWIT_V0);
    expect(parseSentAddress(P2WSH)).toBe(P2WSH);
    expect(parseSentAddress(BIP350_TAPROOT)).toBe(BIP350_TAPROOT);
  });

  it("refuses what is not an address it can prove", () => {
    expect(parseSentAddress("")).toBeNull();
    // A wrong checksum: base58 and bech32m.
    expect(parseSentAddress(`${P2PKH.slice(0, -1)}3`)).toBeNull();
    expect(parseSentAddress(BIP350_WRONG_CHECKSUM)).toBeNull();
    // Mixed case, too long.
    expect(parseSentAddress(`BC1Q${SEGWIT_V0.slice(4)}`)).toBeNull();
    expect(parseSentAddress(`${BIP350_TAPROOT}${"q".repeat(40)}`)).toBeNull();
    // Another network: regtest, testnet.
    expect(parseSentAddress(taprootAddress(3, "bcrt"))).toBeNull();
    expect(parseSentAddress("tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx")).toBeNull();
    // A witness version no withdrawal pays yet.
    const v2 = encodeBech32("bc", [2, ...bytesToWords(new Uint8Array(32).fill(1))], 0x2bc830a3);
    expect(parseSentAddress(v2)).toBeNull();
    // Another kind of recipient.
    expect(parseSentAddress("bakehouse@wallet.example")).toBeNull();
  });
});
