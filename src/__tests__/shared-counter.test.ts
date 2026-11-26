import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

import { DEFAULT_RELAYS } from "@/config/relays";
import { MAX_NUMBER_JUMP, REMOVED_SEAT_GRACE_SECONDS } from "@/config/team";
import { deriveAssistantKeys } from "@/lib/assistant/keys";
import { encodeWalletSecret } from "@/lib/breez/secret";
import {
  InvoiceCounterError,
  counterEvent,
  nextNumberOf,
  raiseSharedCounter,
  sharedCounterEvent,
  sharedCounterKeys,
  takeInvoiceNumber,
  takeSharedInvoiceNumber,
  takeSharedNumber,
  type SharedNumbering
} from "@/lib/invoice/counter";
import { publishToRelays } from "@/lib/nostr/pool";
import { sealRecord } from "@/lib/nostr/record";
import {
  assistantSecretKey,
  deriveInvoiceKeys,
  deriveTeamKeys,
  invoiceCounterKey,
  type InvoiceKeys
} from "@/lib/team/keys";

import type * as RelaysFake from "../../jest/nostr-relays";

const relays = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");

/** BIP-39 test mnemonic (all-zero entropy), never a real wallet's. */
const MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const team = deriveTeamKeys(encodeWalletSecret({ mnemonic: MNEMONIC }));
const owner = deriveInvoiceKeys(team);
const first = deriveAssistantKeys(assistantSecretKey(team, "01".repeat(16))).invoices;
const second = deriveAssistantKeys(assistantSecretKey(team, "02".repeat(16))).invoices;
const counterKey = invoiceCounterKey(team);
const shared = sharedCounterKeys(counterKey);
const NOW = 1_791_500_000;

const writer = (keys: InvoiceKeys) => keys.nostr.publicKey;

/** A call as `keys`'s author (and as `more`'s, as the owner's devices read every writer). */
const callOf = (keys: InvoiceKeys, more: readonly InvoiceKeys[] = []) => ({
  relays: DEFAULT_RELAYS,
  channel: "account" as const,
  timeoutMs: 1000,
  authKey: [keys.nostr.secretKey, ...more.map(({ nostr }) => nostr.secretKey)]
});

/** The owner's devices: they read every assistant, and keep their counter of format 1. */
const ownerNumbering: SharedNumbering = {
  own: owner,
  shared,
  writers: [writer(first), writer(second)],
  legacy: true
};
/** An assistant, as its channel tells it: the owner and the other assistant. */
const assistantNumbering = (own: InvoiceKeys, other: InvoiceKeys): SharedNumbering => ({
  own,
  shared,
  writers: [writer(owner), writer(other)],
  legacy: false
});

const ownerTakes = (now = NOW, year = 2026) =>
  takeSharedInvoiceNumber(ownerNumbering, callOf(owner, [first, second]), year, now);
const firstTakes = (now = NOW) =>
  takeSharedInvoiceNumber(assistantNumbering(first, second), callOf(first), 2026, now);
const secondTakes = (now = NOW) =>
  takeSharedInvoiceNumber(assistantNumbering(second, first), callOf(second), 2026, now);

beforeEach(() => relays.resetRelays());

describe("the shared counter's keys", () => {
  it("never change: every account's series derives from them", () => {
    const derive = (info: string) =>
      hkdf(sha256, counterKey, utf8ToBytes("sattle.me/invoice-counter"), utf8ToBytes(info), 32);
    expect(shared).toEqual({
      encryptionKey: derive("encryption-key/v1"),
      address: bytesToHex(derive("address/v1"))
    });
    expect(() => sharedCounterKeys(new Uint8Array(16))).toThrow();
  });
});

describe("one series of numbers for the owner and its assistants", () => {
  it("takes the number after every writer's, whoever takes it", async () => {
    expect(await ownerTakes()).toEqual({ year: 2026, sequence: 1 });
    expect(await firstTakes()).toEqual({ year: 2026, sequence: 2 });
    expect(await secondTakes()).toEqual({ year: 2026, sequence: 3 });
    expect(await ownerTakes()).toEqual({ year: 2026, sequence: 4 });
    expect(await firstTakes()).toEqual({ year: 2026, sequence: 5 });
    // A new year starts again at 1.
    expect(await ownerTakes(NOW + 100, 2027)).toEqual({ year: 2027, sequence: 1 });
  });

  it("keeps the owner's counter of format 1, that an app from before reads", async () => {
    await firstTakes();
    expect(await ownerTakes()).toEqual({ year: 2026, sequence: 2 });
    // An owner's device still on an app from before: it reads the owner's numbers at least.
    expect(await takeInvoiceNumber(owner, callOf(owner), 2026, NOW)).toEqual({
      year: 2026,
      sequence: 3
    });
    // The owner's devices of now read what it wrote there.
    expect(await ownerTakes()).toEqual({ year: 2026, sequence: 4 });
  });

  it("stays above the invoices already saved", async () => {
    await expect(
      takeSharedInvoiceNumber(ownerNumbering, callOf(owner, [first, second]), 2026, NOW, [
        { year: 2026, sequence: 41 },
        { year: 2025, sequence: 90 }
      ])
    ).resolves.toEqual({ year: 2026, sequence: 42 });
    expect(
      nextNumberOf(
        [
          { version: 1, year: 2026, last: 7 },
          { version: 1, year: 2025, last: 30 }
        ],
        2026
      )
    ).toEqual({ year: 2026, sequence: 8 });
  });

  it("still counts a removed assistant's copy: a number is never given twice", async () => {
    await firstTakes(NOW);
    // Its key leaked, its holder takes numbers after its removal: relays keep its newest copy
    // only. Counted, it makes numbers jump; never would the owner give its last number again.
    await firstTakes(NOW + 100);
    await firstTakes(NOW + 100);
    const numbering = { ...ownerNumbering, writers: [writer(first)] };
    await expect(
      takeSharedInvoiceNumber(numbering, callOf(owner, [first]), 2026, NOW + 200)
    ).resolves.toEqual({ year: 2026, sequence: 4 });
  });

  it("reads each writer by its author: another's copy at the same address never counts", async () => {
    // Sealed with the counter's key (an assistant the owner does not know), at the same address.
    await publishToRelays(
      sharedCounterEvent(shared, second.nostr, { version: 1, year: 2026, last: 900 }, NOW),
      callOf(second)
    );
    const numbering = { ...ownerNumbering, writers: [writer(first)] };
    await expect(
      takeSharedInvoiceNumber(numbering, callOf(owner, [first]), 2026, NOW)
    ).resolves.toEqual({ year: 2026, sequence: 1 });
  });

  it("gives no number when too few relays answer or take the copy", async () => {
    for (const relay of DEFAULT_RELAYS.slice(0, 3)) relays.unreachable.add(relay);
    await expect(firstTakes()).rejects.toThrow(InvoiceCounterError);
    relays.unreachable.clear();
    for (const relay of DEFAULT_RELAYS.slice(0, 3)) relays.readOnly.add(relay);
    await expect(firstTakes()).rejects.toThrow(InvoiceCounterError);
    await expect(ownerTakes()).rejects.toThrow(InvoiceCounterError);
  });

  it("gives no number where relays keep each author's events to that author", async () => {
    await ownerTakes();
    // An assistant cannot read the owner's copy there: never a number that may be the owner's.
    for (const relay of DEFAULT_RELAYS.slice(0, 3)) relays.authorReads.add(relay);
    await expect(firstTakes()).rejects.toThrow(InvoiceCounterError);
    // The owner's devices hold every writer's key: they read them all there.
    await expect(ownerTakes()).resolves.toEqual({ year: 2026, sequence: 2 });
  });

  it("gives no number over a copy a newer app wrote", async () => {
    await publishToRelays(
      sealRecord({
        type: "invoice-counter-shared",
        value: { version: 2, year: 2026, last: 7 },
        signer: owner.nostr.secretKey,
        encryptionKey: shared.encryptionKey,
        address: shared.address,
        createdAt: NOW
      }),
      callOf(owner)
    );
    await expect(firstTakes(NOW + 10)).rejects.toThrow(InvoiceCounterError);
    await expect(ownerTakes(NOW + 10)).rejects.toThrow(InvoiceCounterError);
  });

  it("gives no number over the owner's counter of format 1 a newer app wrote", async () => {
    await publishToRelays(
      counterEvent(owner, { version: 1, year: 2026, last: 3 }, NOW),
      callOf(owner)
    );
    await expect(ownerTakes(NOW + 10)).resolves.toEqual({ year: 2026, sequence: 4 });
    // An assistant does not read it (it holds no key of it): the owner's copy says as much.
    await expect(firstTakes(NOW + 20)).resolves.toEqual({ year: 2026, sequence: 5 });
  });
});

describe("the series, with relays that stay connected without answering", () => {
  // No call waits for every relay.
  const pairs = DEFAULT_RELAYS.flatMap((a, i) =>
    DEFAULT_RELAYS.slice(i + 1).map((b): [string, string] => [a, b])
  );

  /** Runs `promise` on fake timers: its outcome, and how long (fake ms) it took to settle. */
  async function timed<T>(promise: Promise<T>): Promise<{ value: T | Error; ms: number }> {
    const startedAt = Date.now();
    let settled: { value: T | Error } | null = null;
    void promise.then(
      (value) => {
        settled = { value };
      },
      (error: Error) => {
        settled = { value: error };
      }
    );
    while (settled === null) {
      if (Date.now() - startedAt > 100_000) throw new Error("Never settled");
      await jest.advanceTimersByTimeAsync(10);
    }
    return { value: (settled as { value: T | Error }).value, ms: Date.now() - startedAt };
  }

  beforeEach(() => {
    jest.useFakeTimers({ now: Date.now(), doNotFake: ["queueMicrotask", "nextTick"] });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  /** As `callOf`, a relay given 10 s to answer: none is waited for that long. */
  const slowCallOf = (keys: InvoiceKeys, more: readonly InvoiceKeys[] = []) => ({
    ...callOf(keys, more),
    timeoutMs: 10_000
  });
  const takers = [
    (now: number) =>
      takeSharedInvoiceNumber(ownerNumbering, slowCallOf(owner, [first, second]), 2026, now),
    (now: number) =>
      takeSharedInvoiceNumber(assistantNumbering(first, second), slowCallOf(first), 2026, now),
    (now: number) =>
      takeSharedInvoiceNumber(assistantNumbering(second, first), slowCallOf(second), 2026, now)
  ];

  it("never gives a number twice, whichever two relays stay quiet", async () => {
    let sequence = 0;
    for (const [silent, mute] of pairs) {
      relays.silent.clear();
      relays.latency.clear();
      relays.silent.add(silent);
      relays.latency.set(mute, Infinity);
      // Each writer in turn: each finds the last number another took on a majority.
      const { value, ms } = await timed(takers[sequence % 3](NOW + sequence));
      sequence += 1;
      expect(value).toEqual({ year: 2026, sequence });
      // No relay's timeout waited for: the majority, then its grace.
      expect(ms).toBeLessThan(2000);
    }
  });

  it("gives no number without a majority, never a guess", async () => {
    await timed(ownerTakes());
    for (const relay of DEFAULT_RELAYS.slice(2)) relays.silent.add(relay);
    const { value, ms } = await timed(takers[1](NOW + 1));
    expect(value).toBeInstanceOf(InvoiceCounterError);
    // Known only once the silent relays' time passed.
    expect(ms).toBeGreaterThanOrEqual(10_000);
  });
});

describe("a writer's key in other hands", () => {
  const GRACE = REMOVED_SEAT_GRACE_SECONDS;
  /** The owner's devices, `first` removed at `removedAt`: no longer among the writers. */
  const withRemoved = (removedAt: number): SharedNumbering => ({
    ...ownerNumbering,
    writers: [writer(second)],
    removed: [{ author: writer(first), removedAt }]
  });
  const forged = (keys: InvoiceKeys, value: unknown, createdAt: number) =>
    publishToRelays(
      sealRecord({
        type: "invoice-counter-shared",
        value,
        signer: keys.nostr.secretKey,
        encryptionKey: shared.encryptionKey,
        address: shared.address,
        createdAt
      }),
      callOf(keys)
    );
  const ownerCall = callOf(owner, [first, second]);
  // What is left out is logged (logFailure), the code's own text.
  beforeEach(() => jest.spyOn(console, "warn").mockImplementation(() => undefined));
  afterEach(() => jest.restoreAllMocks());

  it("leaves out a removed writer's copy of a newer format, counts its last readable one", async () => {
    expect(await firstTakes()).toEqual({ year: 2026, sequence: 1 });
    await forged(first, { version: 2, year: 2026, last: 9 }, NOW + 10);
    // Read by its author: the relays hold its newest copy only, of a newer format.
    await expect(
      takeSharedInvoiceNumber(withRemoved(NOW + 5), ownerCall, 2026, NOW + 20)
    ).resolves.toEqual({ year: 2026, sequence: 1 });
    // The same copy, its writer in the team: no number (an app too old to read it).
    await expect(ownerTakes(NOW + 30)).rejects.toThrow(InvoiceCounterError);
  });

  it("never reads a removed writer again once the owner's copy is dated after it", async () => {
    expect(await firstTakes()).toEqual({ year: 2026, sequence: 1 });
    const removedAt = NOW + 5;
    // Its last number taken into the owner's copy, past the clocks' margin.
    const later = removedAt + GRACE + 1;
    await expect(
      raiseSharedCounter(withRemoved(removedAt), ownerCall, 2026, later)
    ).resolves.toEqual({ number: { year: 2026, sequence: 1 }, absorbed: [writer(first)] });
    // Whatever its key's holder publishes since: never read (a jump within the bound included).
    await forged(first, { version: 1, year: 2026, last: 500 }, later + 10);
    await expect(
      takeSharedNumber(withRemoved(removedAt), ownerCall, 2026, later + 20)
    ).resolves.toEqual({ number: { year: 2026, sequence: 2 }, absorbed: [writer(first)] });
  });

  it("reads a removed writer while the owner's copy may not hold it, within the bound", async () => {
    expect(await firstTakes()).toEqual({ year: 2026, sequence: 1 });
    expect(await firstTakes()).toEqual({ year: 2026, sequence: 2 });
    // Removed within the clocks' margin of the owner's copy: its copy still counts.
    await expect(
      takeSharedInvoiceNumber(withRemoved(NOW + 5), ownerCall, 2026, NOW + 20)
    ).resolves.toEqual({ year: 2026, sequence: 3 });
  });

  it("raises the owner's copy only while a removed writer is not held, never past a number", async () => {
    // Nothing given in the year: nothing saved, the writer held all the same.
    await expect(raiseSharedCounter(withRemoved(NOW), ownerCall, 2026, NOW + 1)).resolves.toEqual({
      number: { year: 2026, sequence: 0 },
      absorbed: [writer(first)]
    });
    expect(await ownerTakes(NOW + 2)).toEqual({ year: 2026, sequence: 1 });
    expect(await firstTakes(NOW + 3)).toEqual({ year: 2026, sequence: 2 });
    // The owner's copy (1) below the removed writer's (2): raised to it, no number taken.
    await expect(
      raiseSharedCounter(withRemoved(NOW + 4), ownerCall, 2026, NOW + 5)
    ).resolves.toEqual({ number: { year: 2026, sequence: 2 }, absorbed: [writer(first)] });
    // An app of before (format 1) reads it too.
    expect(await takeInvoiceNumber(owner, callOf(owner), 2026, NOW + 6)).toEqual({
      year: 2026,
      sequence: 3
    });
  });

  it("leaves out a copy or a number of `floor` too far above the writer's own copies", async () => {
    expect(await ownerTakes()).toEqual({ year: 2026, sequence: 1 });
    await forged(first, { version: 1, year: 2026, last: Number.MAX_SAFE_INTEGER - 1 }, NOW + 10);
    expect(await ownerTakes(NOW + 20)).toEqual({ year: 2026, sequence: 2 });
    expect(await secondTakes(NOW + 30)).toEqual({ year: 2026, sequence: 3 });
    // An invoice listed with such a number (a forged one): left out too.
    await expect(
      takeSharedInvoiceNumber(ownerNumbering, ownerCall, 2026, NOW + 40, [
        { year: 2026, sequence: Number.MAX_SAFE_INTEGER }
      ])
    ).resolves.toEqual({ year: 2026, sequence: 4 });
  });

  it("follows a copy up to MAX_NUMBER_JUMP above the writer's own: never a number twice", async () => {
    expect(await ownerTakes()).toEqual({ year: 2026, sequence: 1 });
    await forged(first, { version: 1, year: 2026, last: 2 + MAX_NUMBER_JUMP }, NOW + 10);
    // One past the bound of the owner's copy (1): left out.
    expect(await ownerTakes(NOW + 20)).toEqual({ year: 2026, sequence: 2 });
    // At the bound of its copy now (2): followed. A jump of MAX_NUMBER_JUMP at most each time,
    // "Wallet" warns of it (assistant-alerts.ts).
    expect(await ownerTakes(NOW + 30)).toEqual({ year: 2026, sequence: 3 + MAX_NUMBER_JUMP });
  });

  it("never gives nor saves a number past safe integers", async () => {
    await forged(owner, { version: 1, year: 2026, last: Number.MAX_SAFE_INTEGER }, NOW);
    await expect(ownerTakes(NOW + 10)).rejects.toThrow(InvoiceCounterError);
    await expect(raiseSharedCounter(withRemoved(NOW), ownerCall, 2026, NOW + 20)).rejects.toThrow(
      InvoiceCounterError
    );
  });
});
