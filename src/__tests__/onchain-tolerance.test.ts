import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";

import { TOLERANCE_STEP } from "@/config/onchain";
import { parseToleranceText, toleranceLabel, toleranceText } from "@/features/settings/tolerance";
import {
  MAX_ONCHAIN_TOLERANCE,
  coversWith,
  dueOnchain,
  leastAccepted,
  toleranceOf
} from "@/lib/onchain/tolerance";
import { TERMINAL_OPTIONS_VERSION, parseTerminalOptions } from "@/lib/terminal/model";

import tolerances from "./fixtures/checkout-spec/onchain-tolerances.json";

/*
 * The owner's tolerance of on-chain underpayments (src/lib/onchain/tolerance.ts): the same as the
 * integrations' (sattleme/checkout-spec 0.2.0, SPEC.md §31, "The merchant's tolerance"), against
 * its vectors copied byte for byte in fixtures/checkout-spec/; typed in "Settings" in percent by
 * tenths; kept beside the point of sale's options.
 */

/** The copy, its file in checkout-spec and that file's SHA-256 in checkout-spec's manifest.json. */
const SPEC_FILE = [
  "onchain-tolerances.json",
  "vectors/onchain-tolerances.json",
  "5182c7a660536878db5decb440a99da60dafb07874d3bdb551e04de1ed0ebdf7"
] as const;

// Node's types are not loaded (tsconfig `types` only lists jest): only what this test needs.
declare const __dirname: string;
const fs = jest.requireActual<{ readFileSync(path: string): Uint8Array }>("fs");
const { join } = jest.requireActual<{ join(...segments: string[]): string }>("path");

type Vectors = {
  values: { name: string; value?: unknown; expected: number }[];
  accepted: { sats: string; tolerance: number; expected: string }[];
  due: { sats: string; tolerance: number; paidByRests: string; expected: string }[];
};
const vectors = tolerances as Vectors;

it(`${SPEC_FILE[0]} is checkout-spec's ${SPEC_FILE[1]}`, () => {
  const bytes = fs.readFileSync(join(__dirname, "fixtures", "checkout-spec", SPEC_FILE[0]));
  expect(bytesToHex(sha256(bytes))).toBe(SPEC_FILE[2]);
});

describe("the tolerance (onchain-tolerances.json)", () => {
  it("is 10 % at most, set by tenths of a percent", () => {
    expect(MAX_ONCHAIN_TOLERANCE).toBe(1000);
    expect(TOLERANCE_STEP).toBe(10);
  });

  it.each(vectors.values)("reads $name", (c) => {
    expect(toleranceOf("value" in c ? c.value : undefined)).toBe(c.expected);
  });

  it.each(vectors.accepted)(
    "accepts $expected of $sats sats at $tolerance",
    ({ sats, tolerance, expected }) => {
      expect(leastAccepted(BigInt(sats), tolerance)).toBe(BigInt(expected));
    }
  );

  it.each(vectors.due)(
    "asks $expected on-chain of $sats sats at $tolerance, $paidByRests paid otherwise",
    ({ sats, tolerance, paidByRests, expected }) => {
      expect(dueOnchain(BigInt(sats), tolerance, BigInt(paidByRests))).toBe(BigInt(expected));
    }
  );
});

describe("a sale's payment, with its tolerance", () => {
  it("pays it in full, or short by no more than the tolerance with something on-chain", () => {
    // 46 550 of 49 000 at 5 %.
    expect(coversWith(49_000n, 0n, 49_000n, 500)).toBe(true);
    expect(coversWith(46_550n, 46_550n, 49_000n, 500)).toBe(true);
    expect(coversWith(46_549n, 46_549n, 49_000n, 500)).toBe(false);
    // On-chain and over Lightning (an invoice of the rest).
    expect(coversWith(46_550n, 20_000n, 49_000n, 500)).toBe(true);
    // Over Lightning alone, never: an invoice is paid whole.
    expect(coversWith(46_550n, 0n, 49_000n, 500)).toBe(false);
    // Without a tolerance, or with one that is not: the whole amount.
    expect(coversWith(48_999n, 48_999n, 49_000n, 0)).toBe(false);
    expect(coversWith(46_550n, 46_550n, 49_000n, 1500)).toBe(false);
    expect(coversWith(46_550n, 46_550n, 49_000n, 2.5)).toBe(false);
  });

  it("never accepts more missing than the tolerance: rounded down to the whole sat", () => {
    // 3 % of 10 001 is 300,03: 9 701 accepted at least, never 9 700.
    expect(leastAccepted(10_001n, 300)).toBe(9_701n);
    expect(coversWith(9_700n, 9_700n, 10_001n, 300)).toBe(false);
    // At 10 %, the largest amounts stay exact (sats in bigint).
    expect(leastAccepted(2_100_000_000_000_000n, 1000)).toBe(1_890_000_000_000_000n);
  });
});

describe('"Underpayment tolerance" in "Settings"', () => {
  it("reads a percent by tenths, from 0 to 10 %", () => {
    expect(parseToleranceText("")).toBe(0);
    expect(parseToleranceText("  ")).toBe(0);
    expect(parseToleranceText("0")).toBe(0);
    expect(parseToleranceText("5")).toBe(500);
    expect(parseToleranceText("2,5")).toBe(250);
    expect(parseToleranceText("2.5")).toBe(250);
    expect(parseToleranceText("2,5 %")).toBe(250);
    expect(parseToleranceText("0,1")).toBe(10);
    expect(parseToleranceText("10")).toBe(1000);
    // Zeros ending the decimals: the same tenth.
    expect(parseToleranceText("2,50")).toBe(250);
    expect(parseToleranceText("10,00 %")).toBe(1000);
    expect(parseToleranceText(",00")).toBe(0);
    // More than 2 decimals, even zeros: "1,000" may be a thousand (en-US).
    for (const text of [
      "10,1",
      "11",
      "2,55",
      "2,050",
      "2,500",
      "1,000",
      "-1",
      "abc",
      "5%%5",
      "1e1"
    ]) {
      expect(parseToleranceText(text)).toBeNull();
    }
  });

  it("shows it in the device's locale, none as nothing", () => {
    expect(toleranceText(0, "fr-CH")).toBe("");
    expect(toleranceText(250, "fr-CH")).toBe("2,5");
    expect(toleranceText(500, "fr-CH")).toBe("5");
    expect(toleranceText(250, "en-US")).toBe("2.5");
    expect(toleranceLabel(0, "fr-CH")).toBeNull();
    expect(toleranceLabel(250, "fr-CH")).toMatch(/^2,5\s?%$/);
    expect(toleranceLabel(1000, "en-US")).toBe("10%");
  });
});

describe("the point of sale's options", () => {
  const saved = { version: TERMINAL_OPTIONS_VERSION, account: "ab".repeat(32), onchain: true };

  it("keep the tolerance beside the choice of on-chain payments, absent when none", () => {
    expect(parseTerminalOptions({ ...saved, onchainTolerance: 500 })).toEqual({
      ...saved,
      onchainTolerance: 500
    });
    // Saved by an app before it: none.
    expect(parseTerminalOptions(saved)).toEqual(saved);
    // Anything else: none, the options still valid.
    for (const onchainTolerance of [0, -1, 1001, 2.5, "500", null]) {
      expect(parseTerminalOptions({ ...saved, onchainTolerance })).toEqual(saved);
    }
  });
});
