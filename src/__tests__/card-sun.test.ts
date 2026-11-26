import { ecb } from "@noble/ciphers/aes.js";
import { hexToBytes, bytesToHex } from "@noble/hashes/utils.js";

import { tapHash, tapHashes } from "@/lib/card/hashes";
import {
  decryptPiccData,
  parseSunParams,
  sessionMacKey,
  sessionVector,
  sunMac,
  verifySun
} from "@/lib/card/sun";

/** boltcard/docs/TEST_VECTORS.md: one real card, three taps. */
const K1 = hexToBytes("0c3b25d92b38ae443229dd59ad34b85d");
const K2 = hexToBytes("b45775776cb224c75bcde7ca3704e933");
const UID = hexToBytes("04996c6a926980");
const TAPS = [
  {
    p: "4E2E289D945A66BB13377A728884E867",
    c: "E19CCB1FED8892CE",
    counter: 3,
    sv2: [60, 195, 0, 1, 0, 128, 4, 153, 108, 106, 146, 105, 128, 3, 0, 0],
    ks: [242, 92, 75, 92, 230, 171, 63, 244, 5, 242, 135, 175, 172, 78, 77, 26],
    // Hash of `c` (hashes.ts), computed once with Node's crypto.
    hash: "XkOwbcNvZY68-fe-yQtpjw"
  },
  {
    p: "00F48C4F8E386DED06BCDC78FA92E2FE",
    c: "66B4826EA4C155B4",
    counter: 5,
    sv2: [60, 195, 0, 1, 0, 128, 4, 153, 108, 106, 146, 105, 128, 5, 0, 0],
    ks: [73, 70, 39, 105, 116, 24, 126, 152, 96, 101, 139, 189, 130, 16, 200, 190],
    hash: "a0vacCabQGmI_AqHhVVYkw"
  },
  {
    p: "0DBF3C59B59B0638D60B5842A997D4D1",
    c: "CC61660C020B4D96",
    counter: 7,
    sv2: [60, 195, 0, 1, 0, 128, 4, 153, 108, 106, 146, 105, 128, 7, 0, 0],
    ks: [97, 189, 177, 81, 15, 79, 217, 5, 102, 95, 162, 58, 192, 199, 38, 97],
    hash: "BfVSsRSv6_ZOxU_3wWmmtA"
  }
];

describe("SUN of a BoltCard tap", () => {
  it.each(TAPS)("matches the BoltCard test vector of counter $counter", (tap) => {
    const params = parseSunParams(tap.p, tap.c)!;

    expect(decryptPiccData(K1, params.p)).toEqual({ uid: UID, counter: tap.counter });
    expect(Array.from(sessionVector(UID, tap.counter))).toEqual(tap.sv2);
    expect(Array.from(sessionMacKey(K2, UID, tap.counter))).toEqual(tap.ks);
    expect(bytesToHex(sunMac(K2, UID, tap.counter)).toUpperCase()).toBe(tap.c);
    expect(verifySun(K1, K2, params.p, params.c)).toEqual({ uid: UID, counter: tap.counter });
    expect(tapHash(params.c)).toBe(tap.hash);
  });

  it("refuses a tap of another key, a forged MAC or a MAC of another tap", () => {
    const { p, c } = parseSunParams(TAPS[0].p, TAPS[0].c)!;
    const otherKey = hexToBytes("00".repeat(16));
    const forged = c.slice();
    forged[7] ^= 1;
    const otherTap = parseSunParams(TAPS[1].p, TAPS[1].c)!;

    expect(verifySun(otherKey, K2, p, c)).toBeNull();
    expect(verifySun(K1, otherKey, p, c)).toBeNull();
    expect(verifySun(K1, K2, p, forged)).toBeNull();
    expect(verifySun(K1, K2, p, otherTap.c)).toBeNull();
  });

  it("refuses PICCData of another tag", () => {
    // PICCData of tag 0xC6 (UID of another length), encrypted with K1.
    const plain = Uint8Array.of(0xc6, ...UID, 3, 0, 0, 1, 2, 3, 4, 5);
    const p = ecb(K1, { disablePadding: true }).encrypt(plain);

    expect(decryptPiccData(K1, p)).toBeNull();
  });

  it("reads the counter little-endian over its 3 bytes", () => {
    const plain = Uint8Array.of(0xc7, ...UID, 0x56, 0x34, 0x12, 9, 9, 9, 9, 9);
    const p = ecb(K1, { disablePadding: true }).encrypt(plain);

    expect(decryptPiccData(K1, p)?.counter).toBe(0x123456);
  });

  it("reads `p` and `c` of either case, nothing else", () => {
    expect(parseSunParams(TAPS[0].p.toLowerCase(), TAPS[0].c.toLowerCase())).toEqual(
      parseSunParams(TAPS[0].p, TAPS[0].c)
    );
    expect(parseSunParams(TAPS[0].p.slice(1), TAPS[0].c)).toBeNull();
    expect(parseSunParams(TAPS[0].p, `${TAPS[0].c}0`)).toBeNull();
    expect(parseSunParams(`${TAPS[0].p.slice(1)}G`, TAPS[0].c)).toBeNull();
    expect(parseSunParams(TAPS[0].p, ` ${TAPS[0].c.slice(1)}`)).toBeNull();
    expect(parseSunParams(undefined, TAPS[0].c)).toBeNull();
    expect(parseSunParams(TAPS[0].p, ["E19CCB1FED8892CE"])).toBeNull();
  });

  it("refuses a UID or a counter out of shape", () => {
    expect(() => sunMac(K2, UID.slice(1), 1)).toThrow();
    expect(() => sunMac(K2, UID, -1)).toThrow();
    expect(() => sunMac(K2, UID, 0x1000000)).toThrow();
    expect(() => sunMac(K2, UID, 1.5)).toThrow();
  });
});

describe("tap hashes", () => {
  it("hashes the taps of consecutive counters, in order", () => {
    const hashes = tapHashes(K2, UID, 3, 5);

    expect(hashes).toHaveLength(5);
    expect(hashes[0]).toBe(TAPS[0].hash);
    expect(hashes[2]).toBe(TAPS[1].hash);
    expect(hashes[4]).toBe(TAPS[2].hash);
    expect(new Set(hashes).size).toBe(5);
    expect(hashes.every((hash) => /^[A-Za-z0-9_-]{22}$/.test(hash))).toBe(true);
  });

  it("stops at the counter's last value", () => {
    expect(tapHashes(K2, UID, 0xfffffe, 10)).toHaveLength(2);
    expect(tapHashes(K2, UID, 0, 0)).toEqual([]);
    expect(() => tapHashes(K2, UID, -1, 1)).toThrow();
    expect(() => tapHash(new Uint8Array(16))).toThrow();
  });
});
