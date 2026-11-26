import { schnorr } from "@noble/curves/secp256k1.js";
import { bytesToHex } from "@noble/hashes/utils.js";

import { TEST_MNEMONIC, TEST_WALLET_ID } from "../../jest/account";
import { taprootAddress } from "../../jest/bitcoin";
import { encodeWalletSecret } from "@/lib/breez/secret";
import { NewerRecordError, sealRecord } from "@/lib/nostr/record";
import {
  FUNDS_RECOVERY_VERSION,
  MAX_RECORDED_RECOVERIES,
  addsTo,
  fundsRecoveriesEvent,
  fundsRecoveriesOf,
  fundsRecoveriesValue,
  fundsRecoveryAddress,
  fundsRecoveryFilter,
  mergeFundsRecoveries,
  parseFundsRecoveries,
  type FundsRecoveries,
  type RecoverySubject
} from "@/lib/recovery/record";
import { deriveFundsRecoveryKeys, deriveTeamKeys, wipeFundsRecoveryKeys } from "@/lib/team/keys";

/*
 * The record of the recovery of each of the account's wallets' funds (src/lib/recovery/record.ts):
 * its keys and addresses, never to change once released, its format, and how copies merge.
 */

const team = deriveTeamKeys(encodeWalletSecret({ mnemonic: TEST_MNEMONIC }));
const ACCOUNT: RecoverySubject = { kind: "account" };
const CARD: RecoverySubject = { kind: "card", cardId: "0".repeat(32), walletGeneration: 1 };
const ADDRESS = taprootAddress(1);
const TXID = (n: number) => n.toString(16).padStart(64, "0");

function record(over: Partial<FundsRecoveries> = {}): FundsRecoveries {
  return {
    subject: ACCOUNT,
    walletId: TEST_WALLET_ID,
    destination: { address: ADDRESS, at: 1_800_000_000 },
    recoveries: [{ txid: TXID(1), valueSats: 5000n, at: 1_800_000_100 }],
    ...over
  };
}

describe("the funds recovery record's keys", () => {
  it("keep the released derivations: never change them", () => {
    const keys = deriveFundsRecoveryKeys(team);
    // Computed once from the team's root with Node's crypto.hkdfSync (salt "sattle.me/team").
    expect(bytesToHex(keys.encryptionKey)).toBe(
      "5c02b9c276ecafcfb5a99be7544679872f183be35535bfac67af2db4b5f7d3c9"
    );
    expect(bytesToHex(keys.addressKey)).toBe(
      "14a4c60fae975704551e746b8272837e11d4f7d7c2b7704bf1ed2174848c520d"
    );
    expect(bytesToHex(keys.nostr.secretKey)).toBe(
      "19113984efcfe05893bc183493a5a581b655d6b0768dc4d381041a693425b63b"
    );
    expect(keys.nostr.publicKey).toBe(bytesToHex(schnorr.getPublicKey(keys.nostr.secretKey)));
    expect(fundsRecoveryAddress(keys, ACCOUNT)).toBe(
      "912289faf34e533bc39d04298c8fc279830f0276b2c5c18658338368072c518e"
    );
    expect(fundsRecoveryAddress(keys, CARD)).toBe(
      "3a03addbd8ce5001adba55baf395ef0393c3f209ade125dc7296bd1f9aa6ddef"
    );
    // Each card's wallet at an address of its own; the author is none of the team's other ones.
    expect(
      fundsRecoveryAddress(keys, { ...CARD, walletGeneration: 2 } as RecoverySubject)
    ).not.toBe(fundsRecoveryAddress(keys, CARD));
    expect(keys.nostr.publicKey).not.toBe(team.publicKey);
  });

  it("are wiped once their operation is over", () => {
    const keys = deriveFundsRecoveryKeys(team);
    wipeFundsRecoveryKeys(keys);
    for (const key of [keys.nostr.secretKey, keys.encryptionKey, keys.addressKey]) {
      expect(key.every((byte) => byte === 0)).toBe(true);
    }
  });
});

describe("the funds recovery record's format", () => {
  it("reads back what it writes", () => {
    const value = fundsRecoveriesValue(record());
    expect(value).toEqual({
      version: FUNDS_RECOVERY_VERSION,
      subject: { kind: "account" },
      walletId: TEST_WALLET_ID,
      destination: { address: ADDRESS, at: 1_800_000_000 },
      recoveries: [{ txid: TXID(1), valueSats: 5000, at: 1_800_000_100 }]
    });
    expect(parseFundsRecoveries(value, ACCOUNT, "mainnet")).toEqual(record());
    // A card's: its wallet named in the value too.
    const card = record({ subject: CARD, destination: null, recoveries: [] });
    expect(parseFundsRecoveries(fundsRecoveriesValue(card), CARD, "mainnet")).toEqual(card);
  });

  it("refuses a value out of shape, of another wallet or another network", () => {
    const valid = fundsRecoveriesValue(record()) as Record<string, unknown>;
    const broken: unknown[] = [
      null,
      { ...valid, version: 0 },
      { ...valid, subject: { kind: "card", cardId: "0".repeat(32), walletGeneration: 1 } },
      { ...valid, subject: { kind: "other" } },
      { ...valid, walletId: "02ab" },
      { ...valid, destination: { address: taprootAddress(1, "bcrt"), at: 1 } },
      { ...valid, destination: { address: "bc1qm4tz8s0xk7v9yfh3e5c2nq6wjr8ad2wz9", at: 1 } },
      { ...valid, destination: { address: ADDRESS.toUpperCase(), at: 1 } },
      { ...valid, destination: { address: ADDRESS, at: -1 } },
      { ...valid, recoveries: [{ txid: "zz", valueSats: 1, at: 1 }] },
      { ...valid, recoveries: [{ txid: TXID(1), valueSats: 0, at: 1 }] },
      { ...valid, recoveries: [{ txid: TXID(1), valueSats: 1.5, at: 1 }] },
      {
        ...valid,
        recoveries: [
          { txid: TXID(1), valueSats: 1, at: 1 },
          { txid: TXID(1), valueSats: 2, at: 2 }
        ]
      },
      {
        ...valid,
        recoveries: Array.from({ length: MAX_RECORDED_RECOVERIES + 1 }, (_, i) => ({
          txid: TXID(i + 1),
          valueSats: 1,
          at: i
        }))
      }
    ];
    for (const value of broken) expect(parseFundsRecoveries(value, ACCOUNT, "mainnet")).toBeNull();
    expect(() => parseFundsRecoveries({ ...valid, version: 2 }, ACCOUNT, "mainnet")).toThrow(
      NewerRecordError
    );
  });
});

describe("the funds recovery record's copies", () => {
  it("merge: the address chosen first, every recovery once, the newest kept", () => {
    const later = { address: taprootAddress(2), at: 1_800_000_050 };
    const merged = mergeFundsRecoveries(
      record({ destination: later, recoveries: [{ txid: TXID(2), valueSats: 7000n, at: 9 }] }),
      record()
    );
    expect(merged.destination).toEqual({ address: ADDRESS, at: 1_800_000_000 });
    expect(merged.recoveries.map(({ txid }) => txid)).toEqual([TXID(1), TXID(2)]);
    // On a tie, the lowest address: every device keeps the same.
    const tie = { address: taprootAddress(0), at: 1_800_000_000 };
    expect(mergeFundsRecoveries(record(), record({ destination: tie })).destination).toEqual(
      [tie, { address: ADDRESS, at: 1_800_000_000 }].sort((a, b) =>
        a.address < b.address ? -1 : 1
      )[0]
    );
    // A transaction twice: its earliest entry.
    expect(
      mergeFundsRecoveries(
        record({ recoveries: [{ txid: TXID(1), valueSats: 4000n, at: 5 }] }),
        record()
      ).recoveries
    ).toEqual([{ txid: TXID(1), valueSats: 4000n, at: 5 }]);
    // Past the most a record keeps, the oldest go.
    const many = Array.from({ length: MAX_RECORDED_RECOVERIES }, (_, i) => ({
      txid: TXID(100 + i),
      valueSats: 1n,
      at: 1000 + i
    }));
    const full = mergeFundsRecoveries(record({ recoveries: many }), record());
    expect(full.recoveries).toHaveLength(MAX_RECORDED_RECOVERIES);
    expect(full.recoveries.some(({ txid }) => txid === TXID(1))).toBe(true);
    expect(full.recoveries.some(({ txid }) => txid === TXID(100))).toBe(false);
    expect(() =>
      mergeFundsRecoveries(record(), record({ walletId: `03${"1".repeat(64)}` }))
    ).toThrow();
  });

  it("tell whether a merge holds what a copy lacks", () => {
    expect(addsTo(record(), null)).toBe(true);
    expect(addsTo(record(), record())).toBe(false);
    expect(addsTo(record({ destination: null }), record())).toBe(true);
    expect(
      addsTo(
        mergeFundsRecoveries(
          record(),
          record({ recoveries: [{ txid: TXID(2), valueSats: 1n, at: 1 }] })
        ),
        record()
      )
    ).toBe(true);
  });

  it("are read from what relays hold: each copy checked, the readable ones merged", () => {
    const keys = deriveFundsRecoveryKeys(team);
    const one = fundsRecoveriesEvent(keys, record(), 1_800_000_200);
    const two = fundsRecoveriesEvent(
      keys,
      record({ recoveries: [{ txid: TXID(2), valueSats: 3000n, at: 1_800_000_150 }] }),
      1_800_000_300
    );
    // Another wallet's at this address, a newer app's, and the card's record elsewhere.
    const other = fundsRecoveriesEvent(keys, record({ walletId: `03${"1".repeat(64)}` }), 1);
    const newer = sealRecord({
      type: "funds-recovery",
      value: { version: 2 },
      signer: keys.nostr.secretKey,
      encryptionKey: keys.encryptionKey,
      address: fundsRecoveryAddress(keys, ACCOUNT),
      createdAt: 1_800_000_400
    });
    const card = fundsRecoveriesEvent(keys, record({ subject: CARD }), 1_800_000_500);
    const answers = new Map<string, unknown[]>([
      ["wss://a", [one, other]],
      ["wss://b", [two, newer, card, { kind: 1 }]]
    ]);

    const read = fundsRecoveriesOf(keys, ACCOUNT, "mainnet", answers, TEST_WALLET_ID);
    expect(read.newer).toBe(true);
    expect(read.newestAt).toBe(1_800_000_400);
    expect(read.recoveries?.recoveries.map(({ txid }) => txid)).toEqual([TXID(2), TXID(1)]);
    expect(fundsRecoveryFilter(keys, ACCOUNT)).toEqual({
      kinds: [30078],
      authors: [keys.nostr.publicKey],
      "#d": [fundsRecoveryAddress(keys, ACCOUNT)]
    });
    // Nothing held: none, never "empty" from a guess.
    expect(fundsRecoveriesOf(keys, ACCOUNT, "mainnet", new Map(), null)).toEqual({
      recoveries: null,
      newer: false,
      newestAt: null
    });
  });
});
