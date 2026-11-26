import { bytesToHex } from "@noble/hashes/utils.js";

import { closeAccount } from "@/features/account/session";
import {
  LEGACY_REFRESH_SECONDS,
  copyCardLegacyHistory,
  copyLegacyCopies,
  eraseLegacyCopies,
  readCardLegacyHistory,
  resetLegacyCardHistory,
  startMigratedCardHistory
} from "@/features/card/legacy-history";
import { eraseCardRecords } from "@/features/card/card-erasure";
import { copyCardMonths } from "@/features/card/relays-move";
import { withCardAccess } from "@/features/card/states";
import { encodeWalletSecret } from "@/lib/breez/secret";
import { cardStatesFilter, deriveCardRecordKeys } from "@/lib/card/card-record";
import { deriveHistoryRecordKeys, historyFilter } from "@/lib/card/history-records";
import { deriveCardRoot } from "@/lib/card/keys";
import {
  MAX_LEGACY_PART_BYTES,
  deriveLegacyHistoryKeys,
  legacyCopyOf,
  legacyCopyParts,
  legacyHistoryFilter,
  legacyHistoryOf,
  legacyNumberAddress,
  legacyNumberEvent,
  legacyPartAddress,
  legacyPartEvent,
  parseLegacyPart,
  type LegacyHistoryKeys
} from "@/lib/card/legacy-history-records";
import { legacyCardRowRef, type LegacyCardRow } from "@/lib/legacy-v2/card-history";
import { readLog } from "@/lib/log/log";
import type { NostrEvent } from "@/lib/nostr/event";
import { nip44Decrypt } from "@/lib/nostr/nip44";
import { RECORD_KIND, sealRecord } from "@/lib/nostr/record";
import { setDigest } from "@/lib/registry/archive";
import { currentRelays } from "@/lib/relays/current";

import { openTestAccount } from "../../jest/account";
import { legacyV2 } from "../../jest/legacy-v2-server";
import type * as RelaysFake from "../../jest/nostr-relays";

/*
 * The copy of a v2 card's history on the account's relays: read
 * on the v2 server by the card's printed number (its PIN when it has one), valued at the v2
 * server's price of its date, written whole to a majority of the relays, read back, erased with
 * the card's wallet, moved with the account's relays.
 */

const nostr = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");

const MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const root = deriveCardRoot(encodeWalletSecret({ mnemonic: MNEMONIC }));
const keys = deriveLegacyHistoryKeys(root);

const CARD = "0123456789abcdef0123456789abcdef";
const WALLET = { cardId: CARD, walletGeneration: 1 };
const NUMBER = "9337-6937-5632-2883";
/** 15.10.2026, 12:00 UTC. */
const AT = 1_792_065_600;

function row(id: string, fields: Partial<LegacyCardRow> = {}): LegacyCardRow {
  return {
    ref: legacyCardRowRef(id),
    kind: "payment",
    at: AT,
    sats: 2_500n,
    feeMsat: 0n,
    value: { minor: 168, digits: 2, currency: "CHF" },
    note: "",
    ...fields
  };
}

function v2Payment(id: string, fields: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    amount_sat: -2_500,
    fee_msat: 0,
    title: "🇨🇭 Swiss Bitcoin Pay Card",
    description: null,
    tag: "withdraw",
    status: "settled",
    payment_details: null,
    created_at: AT - 5,
    paid_at: AT,
    ...fields
  };
}

/** Every relay's answers, as queryRelaysPaged would give them (their stored records). */
function storedAnswers(): Map<string, NostrEvent[]> {
  return new Map(currentRelays().map((relay) => [relay, [...(nostr.stored.get(relay) ?? [])]]));
}

/** The records of the copies' author on `relay`, not its deletion requests. */
function legacyRecords(relay: string, author: LegacyHistoryKeys = keys): NostrEvent[] {
  return (nostr.stored.get(relay) ?? []).filter(
    (event) => event.pubkey === author.nostr.publicKey && event.kind === RECORD_KIND
  );
}

describe("the copies' keys", () => {
  // Computed once, then checked against Node's own HKDF (crypto.hkdfSync) from the card root.
  it("keep the released derivations", () => {
    expect(bytesToHex(keys.nostr.secretKey)).toBe(
      "c77544a3185c78add5a837b62be666c3d3d3dc8b18d0edd6cc87cfee4fed50c4"
    );
    expect(keys.nostr.publicKey).toBe(
      "43b54af1cb378b2c5f72869ad309c2d488938a91d5555590a40a0df9fc65db64"
    );
    expect(bytesToHex(keys.encryptionKey)).toBe(
      "4e71ae9ba9bf8c8c8f43178738e9a2cf2e77efeefc4b00b0c677595de9df0135"
    );
    expect(bytesToHex(keys.addressKey)).toBe(
      "e9983f3297930899b0ccb73f32d0fdf5904625227ec3afaa92606f706bb88908"
    );
    expect(legacyPartAddress(keys, WALLET, 0)).toBe(
      "3281038b12b75dc3dba6afb6dcb303541184ba6ea5b1b1e0a7be545b286a89ef"
    );
    expect(legacyPartAddress(keys, WALLET, 1)).toBe(
      "716b2614bae141dda46c8a6f1dbbd074c9d0ee6845664dcbdbdc31dbb1965751"
    );
    expect(legacyNumberAddress(keys, WALLET)).toBe(
      "efe66977bb61b4f01292a45b0c67d16a2cc7b015a73951dfb9564bf995427f73"
    );
  });

  it("are their own author, neither the cards' nor their history's", () => {
    const authors = legacyHistoryFilter(keys).authors;
    expect(authors).not.toEqual(cardStatesFilter(deriveCardRecordKeys(root)).authors);
    expect(authors).not.toEqual(historyFilter(deriveHistoryRecordKeys(root)).authors);
    // Another wallet of the card: other addresses.
    expect(legacyPartAddress(keys, { cardId: CARD, walletGeneration: 2 }, 0)).not.toBe(
      legacyPartAddress(keys, WALLET, 0)
    );
  });
});

describe("a card's copy", () => {
  const read = (events: NostrEvent[]) => legacyHistoryOf(keys, new Map([["wss://r", events]]));

  it("goes through its records and back, whole, its rows exact", () => {
    const rows = [
      row("a"),
      row("b", {
        kind: "recharge",
        sats: 50_000n,
        feeMsat: 1_500n,
        value: null,
        note: "For Heidi's coffee in Zürich 🎁"
      })
    ];
    const parts = legacyCopyParts(WALLET, rows);
    expect(parts).toHaveLength(1);
    const answers = read(parts.map((part) => legacyPartEvent(keys, part, AT)));
    const copy = legacyCopyOf(keys, WALLET, answers.parts, answers.newer);
    expect(copy.copied).toBe(true);
    expect([...copy.rows].sort((a, b) => (a.ref < b.ref ? -1 : 1))).toEqual(
      [...rows].sort((a, b) => (a.ref < b.ref ? -1 : 1))
    );
  });

  it("is cut in parts under what a relay takes, and read only whole", () => {
    const rows = Array.from({ length: 1_000 }, (_, index) => row(`p${index}`, { at: AT + index }));
    const parts = legacyCopyParts(WALLET, rows);
    expect(parts.length).toBeGreaterThan(1);
    const events = parts.map((part) => legacyPartEvent(keys, part, AT));
    for (const event of events) {
      expect(JSON.stringify(event).length).toBeLessThan(65_536);
    }
    const whole = read(events);
    expect(legacyCopyOf(keys, WALLET, whole.parts, whole.newer).rows).toHaveLength(1_000);
    // A part missing: none of it, never half a copy.
    const half = read(events.slice(1));
    expect(legacyCopyOf(keys, WALLET, half.parts, half.newer)).toMatchObject({
      copied: false,
      rows: []
    });
    expect(MAX_LEGACY_PART_BYTES).toBeLessThan(65_536);
  });

  it("holds an empty history as one part without a row: copied, empty", () => {
    const parts = legacyCopyParts(WALLET, []);
    expect(parts).toEqual([
      { version: 2, ...WALLET, part: 0, parts: 1, set: expect.any(String), rows: [] }
    ]);
    const answers = read([legacyPartEvent(keys, parts[0]!, AT)]);
    expect(legacyCopyOf(keys, WALLET, answers.parts, answers.newer)).toMatchObject({
      copied: true,
      rows: []
    });
  });

  it("reads a part written before notes as it is, and signs it again with no note", () => {
    const [part] = legacyCopyParts(WALLET, [row("a")]);
    const v1 = {
      version: 1,
      ...WALLET,
      part: 0,
      parts: 1,
      set: part!.set,
      rows: [
        {
          ref: legacyCardRowRef("a"),
          kind: "payment",
          at: AT,
          sats: 2_500,
          feeMsat: 0,
          value: { minor: 168, digits: 2, currency: "CHF" },
          // Never written by version 1: not read as a note.
          note: "x"
        }
      ]
    };
    const parsed = parseLegacyPart(v1);
    expect(parsed?.rows).toEqual([row("a")]);
    const answers = read([
      sealRecord({
        type: "card-legacy-history",
        value: v1,
        signer: keys.nostr.secretKey,
        encryptionKey: keys.encryptionKey,
        address: legacyPartAddress(keys, WALLET, 0),
        createdAt: AT
      })
    ]);
    expect(legacyCopyOf(keys, WALLET, answers.parts, answers.newer)).toMatchObject({
      copied: true,
      rows: [row("a")]
    });
    // Signed again (each year), it stays as it is, a version 1: the same rows, still no note.
    const again = read([legacyPartEvent(keys, parsed!, AT + 1)]);
    expect([...again.parts.values()].map(({ part }) => part.version)).toEqual([1]);
    expect(legacyCopyOf(keys, WALLET, again.parts, again.newer).rows).toEqual([row("a")]);
  });

  it("signs a full part written before notes again within what a relay takes", () => {
    // As version 1 filled a part: up to MAX_LEGACY_PART_BYTES of plaintext, rows without a note.
    const rows: LegacyCardRow[] = [];
    const v1Row = (kept: LegacyCardRow) => ({
      ref: kept.ref,
      kind: kept.kind,
      at: kept.at,
      sats: Number(kept.sats),
      feeMsat: Number(kept.feeMsat),
      value: kept.value
    });
    const plaintext = (kept: LegacyCardRow[]) =>
      JSON.stringify({
        t: "card-legacy-history",
        v: {
          version: 1,
          ...WALLET,
          part: 1_000,
          parts: 1_000,
          set: "0".repeat(64),
          rows: kept.map(v1Row)
        }
      }).length;
    for (
      let index = 0;
      plaintext([...rows, row(`f${index}`)]) <= MAX_LEGACY_PART_BYTES;
      index += 1
    ) {
      rows.push(row(`f${index}`));
    }
    rows.sort((a, b) => (a.ref < b.ref ? -1 : 1));
    const v1 = {
      version: 1 as const,
      ...WALLET,
      part: 0,
      parts: 1,
      set: setDigest(rows.map(({ ref }) => ref)),
      rows
    };
    expect(JSON.stringify(legacyPartEvent(keys, v1, AT)).length).toBeLessThan(65_536);
    // The same rows as a version 2, each a note longer: beyond it.
    expect(JSON.stringify(legacyPartEvent(keys, { ...v1, version: 2 }, AT)).length).toBeGreaterThan(
      65_536
    );
  });

  it("refuses a part out of shape, and leaves a newer one unread and unwritten", () => {
    const [part] = legacyCopyParts(WALLET, [row("a")]);
    const rowOf = (more: Record<string, unknown>) => ({
      ref: legacyCardRowRef("a"),
      kind: "payment",
      at: AT,
      sats: 2_500,
      feeMsat: 0,
      value: null,
      note: "",
      ...more
    });
    const value = (more: Record<string, unknown>) => ({
      version: 2,
      ...WALLET,
      part: 0,
      parts: 1,
      set: part!.set,
      rows: [],
      ...more
    });
    // A part of several, empty: no copy writes one.
    expect(parseLegacyPart(value({ parts: 2 }))).toBeNull();
    expect(parseLegacyPart(value({ cardId: "x" }))).toBeNull();
    expect(parseLegacyPart(value({ walletGeneration: 0 }))).toBeNull();
    expect(parseLegacyPart(value({ rows: [{ ref: "a", kind: "payment" }] }))).toBeNull();
    expect(parseLegacyPart(value({ rows: [rowOf({})] }))?.rows).toHaveLength(1);
    // A row of the current format names its note, at most 200 characters.
    expect(parseLegacyPart(value({ rows: [rowOf({ note: undefined })] }))).toBeNull();
    expect(parseLegacyPart(value({ rows: [rowOf({ note: 7 })] }))).toBeNull();
    expect(parseLegacyPart(value({ rows: [rowOf({ note: "x".repeat(201) })] }))).toBeNull();
    // Its rows' hash does not match: not whole.
    const forged = sealRecord({
      type: "card-legacy-history",
      value: { ...value({}), set: "0".repeat(64) },
      signer: keys.nostr.secretKey,
      encryptionKey: keys.encryptionKey,
      address: legacyPartAddress(keys, WALLET, 0),
      createdAt: AT
    });
    const forgedRead = read([forged]);
    expect(legacyCopyOf(keys, WALLET, forgedRead.parts, forgedRead.newer).copied).toBe(false);
    // A newer app's part: neither shown nor written over.
    const newer = sealRecord({
      type: "card-legacy-history",
      value: value({ version: 3 }),
      signer: keys.nostr.secretKey,
      encryptionKey: keys.encryptionKey,
      address: legacyPartAddress(keys, WALLET, 0),
      createdAt: AT
    });
    const newerRead = read([newer]);
    expect(legacyCopyOf(keys, WALLET, newerRead.parts, newerRead.newer)).toMatchObject({
      copied: false,
      newer: true
    });
  });

  it("takes no record of another author, nor one at another card's address", () => {
    const other = deriveLegacyHistoryKeys(
      deriveCardRoot(encodeWalletSecret({ mnemonic: `${MNEMONIC} zoo` }))
    );
    const [part] = legacyCopyParts(WALLET, [row("a")]);
    expect(read([legacyPartEvent(other, part!, AT)]).parts.size).toBe(0);
    // Its value says another card than its address.
    const moved = sealRecord({
      type: "card-legacy-history",
      value: {
        version: 1,
        cardId: "f".repeat(32),
        walletGeneration: 1,
        part: 0,
        parts: 1,
        set: part!.set,
        rows: []
      },
      signer: keys.nostr.secretKey,
      encryptionKey: keys.encryptionKey,
      address: legacyPartAddress(keys, WALLET, 0),
      createdAt: AT
    });
    expect(read([moved]).parts.size).toBe(0);
  });
});

describe("copying a v2 card's history", () => {
  beforeEach(async () => {
    nostr.resetRelays();
    resetLegacyCardHistory();
    await openTestAccount({ displayCurrency: "CHF" });
    // About 67,000 CHF a bitcoin around the card's payments.
    legacyV2.rates.set("CHF", [
      { time: AT - 300, price: 67_000 },
      { time: AT + 3_600, price: 68_000 }
    ]);
  });

  afterEach(() => closeAccount());

  const copy = (pin: string | null = null) =>
    withCardAccess((access) => copyCardLegacyHistory(access, WALLET, NUMBER, pin));
  const readBack = () => withCardAccess((access) => readCardLegacyHistory(access, WALLET));

  it("writes the card's whole history, each row valued at the v2 server's price then", async () => {
    legacyV2.cards.set(NUMBER, {
      pin: null,
      payments: [
        v2Payment("p1"),
        v2Payment("r1", { amount_sat: 100_000, tag: "lightning-deposit", paid_at: AT - 7_200 }),
        v2Payment("open", { status: "open" })
      ],
      wrongPins: 0
    });
    await expect(copy()).resolves.toBe("copied");
    const held = await readBack();
    expect(held.conclusive).toBe(true);
    const byRef = new Map(held.rows!.map((kept) => [kept.ref, kept]));
    // 2,500 sats at 67,000 CHF: 1.675 CHF, to the nearest centime.
    expect(byRef.get(legacyCardRowRef("p1"))).toEqual({
      ...row("p1"),
      value: { minor: 168, digits: 2, currency: "CHF" }
    });
    // Two hours before the nearest price: within a day, still its value.
    expect(byRef.get(legacyCardRowRef("r1"))).toMatchObject({
      kind: "recharge",
      sats: 100_000n,
      value: { minor: 6_700, currency: "CHF" }
    });
    expect(held.rows).toHaveLength(2);
    // On a majority of the account's relays.
    const holding = currentRelays().filter((relay) => legacyRecords(relay).length > 0);
    expect(holding.length).toBeGreaterThanOrEqual(3);
  });

  it("keeps each row's note as the v2 card portal showed it: its description, never its title", async () => {
    legacyV2.cards.set(NUMBER, {
      pin: null,
      payments: [
        v2Payment("p1"),
        v2Payment("r1", {
          amount_sat: 100_000,
          tag: "lightning-address-deposit",
          title: "Card 9337",
          description: "  Happy birthday!  "
        }),
        v2Payment("r2", { amount_sat: 3_000, tag: "deposit", title: "Card top-up" }),
        v2Payment("p2", {
          amount_sat: -1_000,
          title: "Register Lightning Address",
          description: "heidi@wallet.example"
        })
      ],
      wrongPins: 0
    });
    await expect(copy()).resolves.toBe("copied");
    const notes = new Map((await readBack()).rows!.map((kept) => [kept.ref, kept.note]));
    expect(notes).toEqual(
      new Map([
        [legacyCardRowRef("p1"), ""],
        [legacyCardRowRef("r1"), "Happy birthday!"],
        [legacyCardRowRef("r2"), ""],
        [legacyCardRowRef("p2"), "heidi@wallet.example"]
      ])
    );
  });

  it("keeps the sats alone when no price is near the row", async () => {
    legacyV2.rates.clear();
    legacyV2.cards.set(NUMBER, { pin: null, payments: [v2Payment("p1")], wrongPins: 0 });
    await expect(copy()).resolves.toBe("copied");
    expect((await readBack()).rows).toEqual([{ ...row("p1"), value: null }]);
  });

  it("copies an empty history as empty, and never asks the v2 server again", async () => {
    legacyV2.cards.set(NUMBER, { pin: null, payments: [], wrongPins: 0 });
    await expect(copy()).resolves.toBe("copied");
    expect((await readBack()).rows).toEqual([]);
    const asked = legacyV2.calls.length;
    await expect(copy()).resolves.toBe("copied");
    // Copied already: the relays say so, the v2 server is not asked.
    expect(legacyV2.calls).toHaveLength(asked);
  });

  it("asks the PIN of a card that has one, and copies with it", async () => {
    legacyV2.cards.set(NUMBER, { pin: "2580", payments: [v2Payment("p1")], wrongPins: 0 });
    await expect(copy()).resolves.toBe("pinRequired");
    expect((await readBack()).rows).toBeNull();
    await expect(copy("1111")).resolves.toBe("pinInvalid");
    await expect(copy("2580")).resolves.toBe("copied");
    expect((await readBack()).rows).toHaveLength(1);
    // The PIN goes to the v2 server only: in no record, opened with the account's keys, nor in the
    // journal support receives.
    const accountKeys = await withCardAccess(async ({ root: accountRoot }) =>
      deriveLegacyHistoryKeys(accountRoot)
    );
    const opened = currentRelays().flatMap((relay) =>
      legacyRecords(relay, accountKeys).map((event) =>
        nip44Decrypt(event.content, accountKeys.encryptionKey)
      )
    );
    expect(opened.length).toBeGreaterThan(0);
    for (const text of opened) expect(text).not.toContain("2580");
    for (const text of opened) expect(text).not.toContain("1111");
    expect(JSON.stringify(readLog())).not.toContain("2580");
    expect(JSON.stringify(readLog())).not.toContain("1111");
  });

  it("says the PIN locked, and a card the v2 server does not know", async () => {
    legacyV2.cards.set(NUMBER, { pin: "2580", payments: [], wrongPins: 5 });
    await expect(copy("2580")).resolves.toBe("pinLocked");
    legacyV2.cards.clear();
    await expect(copy()).resolves.toBe("unknownCard");
  });

  it("writes nothing and asks nothing when no majority of the relays answers", async () => {
    legacyV2.cards.set(NUMBER, { pin: null, payments: [v2Payment("p1")], wrongPins: 0 });
    for (const relay of currentRelays().slice(0, 3)) nostr.unreachable.add(relay);
    await expect(copy()).resolves.toBe("failed");
    expect(legacyV2.calls.filter(({ path }) => path === "/v1/apipayments/by-card")).toEqual([]);
  });

  it("fails without writing when the v2 server or its prices do not answer", async () => {
    legacyV2.cards.set(NUMBER, { pin: null, payments: [v2Payment("p1")], wrongPins: 0 });
    legacyV2.ratesDown = true;
    await expect(copy()).resolves.toBe("failed");
    legacyV2.ratesDown = false;
    legacyV2.byCardStatus = 503;
    await expect(copy()).resolves.toBe("failed");
    expect(currentRelays().flatMap((relay) => legacyRecords(relay))).toEqual([]);
  });

  it("makes one copy of a card at a time", async () => {
    legacyV2.cards.set(NUMBER, { pin: null, payments: [v2Payment("p1")], wrongPins: 0 });
    const outcomes = await withCardAccess((access) =>
      Promise.all([
        copyCardLegacyHistory(access, WALLET, NUMBER, null),
        copyCardLegacyHistory(access, WALLET, NUMBER, null)
      ])
    );
    expect(outcomes).toEqual(["copied", "copied"]);
    // One reading of the whole list, twice to be sure it stood still: two requests.
    expect(legacyV2.calls.filter(({ path }) => path === "/v1/apipayments/by-card")).toHaveLength(2);
  });

  it("keeps the card's number at its migration's end, then copies its history", async () => {
    legacyV2.cards.set(NUMBER, { pin: "2580", payments: [v2Payment("p1")], wrongPins: 0 });
    // A PIN: the number is kept for "History" to ask it.
    await expect(startMigratedCardHistory(WALLET, NUMBER)).resolves.toBe("pinRequired");
    expect(await readBack()).toMatchObject({ rows: null, number: NUMBER });
    legacyV2.cards.get(NUMBER)!.pin = null;
    resetLegacyCardHistory();
    await expect(startMigratedCardHistory(WALLET, NUMBER)).resolves.toBe("copied");
    expect(await readBack()).toMatchObject({ number: NUMBER, rows: [expect.anything()] });
  });

  it("signs again what is a year old, for relays that refuse events over three years", async () => {
    const [part] = legacyCopyParts(WALLET, [row("a")]);
    const old = AT - LEGACY_REFRESH_SECONDS - 10;
    const event = legacyPartEvent(keys, part!, old);
    for (const relay of currentRelays()) nostr.stored.set(relay, [event]);
    await withCardAccess((access) => readCardLegacyHistory(access, WALLET, AT));
    const newest = Math.max(...legacyRecords(currentRelays()[0]!).map((e) => e.created_at));
    expect(newest).toBeGreaterThanOrEqual(AT);
    expect((await readBack()).rows).toEqual([row("a")]);
  });

  it("signs again the shown card's records only, never another wallet's an erasure may have left", async () => {
    const other = { cardId: CARD, walletGeneration: 2 };
    const old = AT - LEGACY_REFRESH_SECONDS - 10;
    const [shown] = legacyCopyParts(other, [row("a")]);
    const [erased] = legacyCopyParts(WALLET, [row("b")]);
    const events = [legacyPartEvent(keys, shown!, old), legacyPartEvent(keys, erased!, old)];
    for (const relay of currentRelays()) nostr.stored.set(relay, [...events]);
    await withCardAccess((access) => readCardLegacyHistory(access, other, AT));
    const dates = (address: string) =>
      legacyRecords(currentRelays()[0]!)
        .filter((event) => event.tags.some(([name, value]) => name === "d" && value === address))
        .map((event) => event.created_at);
    expect(Math.max(...dates(legacyPartAddress(keys, other, 0)))).toBeGreaterThanOrEqual(AT);
    // The other wallet's (a deleted card's, kept by a relay that ignored its erasure): as it was.
    expect(dates(legacyPartAddress(keys, WALLET, 0))).toEqual([old]);
  });

  it('is erased with the card\'s other records when its wallet is ("Delete the card")', async () => {
    const events = [
      ...legacyCopyParts(WALLET, [row("a")]).map((part) => legacyPartEvent(keys, part, AT)),
      legacyNumberEvent(keys, { ...WALLET, number: NUMBER }, AT)
    ];
    for (const relay of currentRelays()) nostr.stored.set(relay, [...events]);
    const erased = await withCardAccess((access) =>
      eraseCardRecords(access, new Map([[CARD, 1]]), AT + 60)
    );
    expect(erased).toBe(true);
    const answers = legacyHistoryOf(keys, storedAnswers());
    expect(answers.parts.size).toBe(0);
    expect(answers.numbers.size).toBe(0);
  });

  it("goes to the new relays with the cards' months, before a change of relays is saved", async () => {
    const before = currentRelays();
    const next = ["wss://new-1.example", "wss://new-2.example", "wss://new-3.example"];
    const events = legacyCopyParts(WALLET, [row("a")]).map((part) =>
      legacyPartEvent(keys, part, AT)
    );
    for (const relay of before) nostr.stored.set(relay, [...events]);
    await expect(copyCardMonths(before, next)).resolves.not.toBeNull();
    for (const relay of next) {
      const answers = legacyHistoryOf(keys, new Map([[relay, nostr.stored.get(relay) ?? []]]));
      expect(legacyCopyOf(keys, WALLET, answers.parts, answers.newer).rows).toEqual([row("a")]);
    }
    // No majority of the new list takes it: the change waits.
    for (const relay of next.slice(0, 2)) nostr.unreachable.add(relay);
    nostr.stored.set(next[2]!, []);
    await expect(copyCardMonths(before, next)).resolves.toBeNull();
  });

  it("is erased with the card's wallet, another wallet's kept", async () => {
    const other = { cardId: CARD, walletGeneration: 2 };
    const events = [
      ...legacyCopyParts(WALLET, [row("a")]).map((part) => legacyPartEvent(keys, part, AT)),
      legacyNumberEvent(keys, { ...WALLET, number: NUMBER }, AT),
      ...legacyCopyParts(other, [row("b")]).map((part) => legacyPartEvent(keys, part, AT))
    ];
    for (const relay of currentRelays()) nostr.stored.set(relay, [...events]);
    const erased = await withCardAccess((access) =>
      eraseLegacyCopies(access, (wallet) => wallet.walletGeneration <= 1, currentRelays(), AT + 60)
    );
    expect(erased).toBe(true);
    const answers = legacyHistoryOf(keys, storedAnswers());
    expect(legacyCopyOf(keys, WALLET, answers.parts, answers.newer).copied).toBe(false);
    expect(answers.numbers.size).toBe(0);
    expect(legacyCopyOf(keys, other, answers.parts, answers.newer).rows).toEqual([row("b")]);
  });

  it("goes to the account's new relays, an erased wallet's left behind", async () => {
    const before = currentRelays();
    const next = ["wss://new-1.example", "wss://new-2.example", "wss://new-3.example"];
    const other = { cardId: CARD, walletGeneration: 2 };
    const events = [
      ...legacyCopyParts(WALLET, [row("a")]).map((part) => legacyPartEvent(keys, part, AT)),
      ...legacyCopyParts(other, [row("b")]).map((part) => legacyPartEvent(keys, part, AT))
    ];
    for (const relay of before) nostr.stored.set(relay, [...events]);
    const moved = await withCardAccess((access) =>
      copyLegacyCopies(access, new Map([[CARD, 1]]), before, next, AT)
    );
    expect(moved).toBe(true);
    for (const relay of next) {
      const answers = legacyHistoryOf(keys, new Map([[relay, nostr.stored.get(relay) ?? []]]));
      expect(legacyCopyOf(keys, other, answers.parts, answers.newer).rows).toEqual([row("b")]);
      expect(legacyCopyOf(keys, WALLET, answers.parts, answers.newer).copied).toBe(false);
    }
  });
});
