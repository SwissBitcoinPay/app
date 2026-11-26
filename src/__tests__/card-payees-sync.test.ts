import {
  DEFAULT_CARD_DAY_SATS,
  DEFAULT_CARD_PAYMENT_SATS,
  DEFAULT_CARD_PAYMENTS_PER_HOUR,
  DEFAULT_CARD_RELAY_HOST
} from "@/config/card";
import { detectSignUpLocation } from "@/features/account/detection";
import { closeAccount, openAccount } from "@/features/account/session";
import { syncCardPayees } from "@/features/card/payees-sync";
import { recordCardState, resetCardStates, withCardAccess } from "@/features/card/states";
import type { CardWalletOf } from "@/lib/card/keys";
import {
  PAYEE_MODE_KEY,
  approvePayee,
  bookOf,
  choosePayeeMode,
  emptyPayeeBook,
  payeeValue,
  payeesView,
  type PayeeEntry
} from "@/lib/card/payee-book";
import {
  derivePayeeRecordKeys,
  formerModeAddress,
  payeeAddress,
  payeeEvent,
  payeeModeAddress,
  payeeModeEvent,
  type PayeeRecordKeys
} from "@/lib/card/payee-records";
import {
  NewerCardPayeesError,
  approveCardPayee,
  loadCardPayees,
  loadPayeeBooks,
  removeCardPayee,
  renameCardPayee,
  setCardPayeeMode
} from "@/lib/card/payees";
import type { NostrEvent } from "@/lib/nostr/event";
import { publishToRelays } from "@/lib/nostr/pool";
import { NewerRecordError, openRecord, sealRecord } from "@/lib/nostr/record";
import { currentRelays } from "@/lib/relays/current";

import { OTHER_TEST_MNEMONIC, TEST_WALLET_ID, openTestAccount, testSeed } from "../../jest/account";
import type * as FileSystemFake from "../../jest/expo-file-system";
import type * as RelaysFake from "../../jest/nostr-relays";

/*
 * Whom each card pays without asking, on the account's relays (the cards managed on the web too,
 * their settings on Nostr; each card its own): the phone's books published there, another device's
 * changes merged into them, a newer app's records never written over.
 */

const nostr = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");
const fileSystem = jest.requireMock<typeof FileSystemFake>("expo-file-system");

const WALLET = TEST_WALLET_ID;
/** A card of the account, and another. */
const CARD = "30c19d9bfae333c1cb42a5ce6e20debb";
const OTHER_CARD = "0123456789abcdef0123456789abcdef";
/** Their first wallets; the card's next one (deleted, then added again). */
const CARD_WALLET = { cardId: CARD, walletGeneration: 1 };
const OTHER_CARD_WALLET = { cardId: OTHER_CARD, walletGeneration: 1 };
const NEXT_CARD_WALLET = { cardId: CARD, walletGeneration: 2 };
const NOW = Date.UTC(2026, 9, 15, 9, 0);
const LAKESIDE = { id: "sattleme01@breez.tips", name: "Lakeside Bakery" };

let keys: PayeeRecordKeys;

function dTag(event: NostrEvent): string | undefined {
  return event.tags.find(([name]) => name === "d")?.[1];
}

/** The events of the payees' author a relay holds, but the books' marker. */
function payeeRecords(relay: string): NostrEvent[] {
  return (nostr.stored.get(relay) ?? []).filter(
    (event) => event.pubkey === keys.nostr.publicKey && dTag(event) !== formerModeAddress(keys)
  );
}

/** What a relay holds at the former mode's address (format 1's, one book for every card). */
function formerRecords(relay: string): NostrEvent[] {
  return (nostr.stored.get(relay) ?? []).filter(
    (event) => event.pubkey === keys.nostr.publicKey && dTag(event) === formerModeAddress(keys)
  );
}

/**
 * The mode as an app of format 1 reads it (payee-records.ts and payee-book.ts of that format:
 * the former mode's address only, a version above 1 a newer app's).
 */
function readAsFormat1(event: NostrEvent) {
  return openRecord(event, {
    type: "card-payee-mode",
    encryptionKey: keys.encryptionKey,
    address: formerModeAddress(keys),
    author: keys.nostr.publicKey,
    parse: (value) => {
      const version = (value as { version?: unknown }).version;
      if (typeof version === "number" && version > 1) throw new NewerRecordError();
      return value;
    }
  });
}

/** Another device of the account (the web app, another phone) publishes a merchant's copy. */
async function publishElsewhere(event: NostrEvent): Promise<void> {
  await publishToRelays(event, {
    relays: currentRelays(),
    channel: "account",
    timeoutMs: 1000,
    authKey: keys.nostr.secretKey
  });
}

/** Another phone of the account: this one's storage empty. */
function anotherPhone(): void {
  fileSystem.resetFileSystem();
}

beforeEach(async () => {
  nostr.resetRelays();
  fileSystem.resetFileSystem();
  await openTestAccount();
  keys = await withCardAccess(async ({ root }) => derivePayeeRecordKeys(root));
});

afterEach(() => {
  closeAccount();
  resetCardStates();
  jest.restoreAllMocks();
});

describe("a card deleted, then added again", () => {
  /** cardIdOf(root, UID) with the test account's keys: CARD (card-keys.test.ts). */
  const UID = "04996c6a926980";

  /** Another device's book of `wallet`, on the relays: "Automatic", the Lakeside approved. */
  async function bookElsewhere(wallet: CardWalletOf): Promise<void> {
    const book = choosePayeeMode(
      approvePayee(emptyPayeeBook(wallet), LAKESIDE, NOW),
      "automatic",
      NOW
    )!;
    await publishElsewhere(payeeModeEvent(keys, book.mode));
    await publishElsewhere(payeeEvent(keys, book.payees.get(LAKESIDE.id)!));
  }

  it("never takes back an earlier wallet's book that a relay still holds", async () => {
    // The card's first wallet's book, left on the relays (its erasure missed: card-erasure.ts).
    await bookElsewhere(CARD_WALLET);
    // Added again: its next wallet's mode chosen on this phone.
    await setCardPayeeMode(WALLET, NEXT_CARD_WALLET, "confirm", { now: NOW + 1000 });
    const { books, conclusive } = await syncCardPayees();
    expect(conclusive).toBe(true);
    expect(payeesView(bookOf(books, NEXT_CARD_WALLET))).toEqual({ mode: "confirm", approved: [] });
    expect(await loadCardPayees(WALLET, NEXT_CARD_WALLET)).toEqual({
      mode: "confirm",
      approved: []
    });
    // Published at the next wallet's address only; the first wallet's left as they were.
    for (const relay of currentRelays()) {
      expect(payeeRecords(relay).map(dTag).sort()).toEqual(
        [
          payeeModeAddress(keys, CARD_WALLET),
          payeeAddress(keys, CARD_WALLET, LAKESIDE.id),
          payeeModeAddress(keys, NEXT_CARD_WALLET)
        ].sort()
      );
    }
    // Another phone of the account, its storage empty: the same.
    anotherPhone();
    expect(payeesView(bookOf((await syncCardPayees()).books, NEXT_CARD_WALLET))).toEqual({
      mode: "confirm",
      approved: []
    });
  });

  it("drops this phone's book of the earlier wallet once the relays hold the next one's", async () => {
    // This phone approved a merchant for the card's first wallet, never told of its deletion.
    await approveCardPayee(WALLET, CARD_WALLET, LAKESIDE, NOW);
    // Meanwhile the card was added again elsewhere, its next wallet's mode chosen there.
    await publishElsewhere(
      payeeModeEvent(keys, {
        ...NEXT_CARD_WALLET,
        mode: "confirm",
        modeAt: NOW + 5000,
        updatedAt: NOW / 1000 + 5
      })
    );
    const { books } = await syncCardPayees();
    expect([...books.books.values()].map((book) => book.walletGeneration)).toEqual([2]);
    expect(await loadCardPayees(WALLET, NEXT_CARD_WALLET)).toEqual({
      mode: "confirm",
      approved: []
    });
    // The first wallet's merchant, this phone's only, never published.
    for (const relay of currentRelays()) {
      expect(payeeRecords(relay).map(dTag)).toEqual([payeeModeAddress(keys, NEXT_CARD_WALLET)]);
    }
  });

  it("brings back nothing of a wallet this session knows erased", async () => {
    // A relay still holds the deleted card's book (its erasure missed it).
    await bookElsewhere(CARD_WALLET);
    await withCardAccess((access) =>
      recordCardState(access, {
        cardId: CARD,
        uid: UID,
        keyVersion: 1,
        status: "deleted",
        relayHost: DEFAULT_CARD_RELAY_HOST,
        lastCounter: 0,
        depositedThrough: 0,
        maxPaymentSats: DEFAULT_CARD_PAYMENT_SATS,
        maxDaySats: DEFAULT_CARD_DAY_SATS,
        maxPaymentsPerHour: DEFAULT_CARD_PAYMENTS_PER_HOUR,
        suspended: false,
        name: "",
        look: null,
        issuer: null,
        settingsAt: NOW,
        walletGeneration: 1
      })
    );
    const { books } = await syncCardPayees();
    expect(books.books.size).toBe(0);
    expect((await loadPayeeBooks(WALLET)).books.size).toBe(0);
    // Its other card is not concerned.
    await approveCardPayee(WALLET, OTHER_CARD_WALLET, LAKESIDE, NOW);
    expect([...(await syncCardPayees({ fresh: true })).books.books.keys()]).toEqual([OTHER_CARD]);
  });
});

describe("one read of the merchants at a time", () => {
  it("shares the read running, and starts one after it for a change just made", async () => {
    // Two of "Cards"'s sections, mounted together: one read.
    const first = syncCardPayees();
    expect(syncCardPayees()).toBe(first);
    // A change made meanwhile: a read that starts once that one ends, shared too.
    await setCardPayeeMode(WALLET, CARD_WALLET, "confirm", { now: NOW });
    const fresh = syncCardPayees({ fresh: true });
    expect(fresh).not.toBe(first);
    expect(syncCardPayees({ fresh: true })).toBe(fresh);
    await first;
    expect(bookOf((await fresh).books, CARD_WALLET).unpublished).toEqual(new Set());
    // Asked once it ended: a read of its own.
    const later = syncCardPayees();
    expect(later).not.toBe(fresh);
    await later;
    // Another account's read never joins this one's.
    const again = syncCardPayees();
    closeAccount();
    await openAccount({
      seed: testSeed(OTHER_TEST_MNEMONIC),
      walletId: "03".padEnd(66, "b"),
      created: true,
      detect: () => detectSignUpLocation(),
      businessNameWord: "Merchant"
    });
    const other = syncCardPayees();
    expect(other).not.toBe(again);
    await Promise.all([again.catch(() => undefined), other]);
  });
});

describe("the phone's book on the account's relays", () => {
  it("is published to every relay, the merchant and its approval sealed", async () => {
    await setCardPayeeMode(WALLET, CARD_WALLET, "confirm", { now: NOW });
    await approveCardPayee(WALLET, CARD_WALLET, LAKESIDE, NOW);
    const { books, conclusive } = await syncCardPayees();
    const book = bookOf(books, CARD_WALLET);
    expect(conclusive).toBe(true);
    expect(book.unpublished).toEqual(new Set());
    for (const relay of currentRelays()) {
      const records = payeeRecords(relay);
      expect(records).toHaveLength(2);
      for (const record of records) {
        // Neither the address nor the name in clear. Each has a dot or spaces, never found by
        // chance in the ciphertext's base64 (a three-letter name alone was, about once in a
        // hundred runs).
        expect(JSON.stringify(record)).not.toContain(LAKESIDE.id);
        expect(JSON.stringify(record)).not.toContain(LAKESIDE.name);
      }
    }
    // Another phone of the account finds it there.
    anotherPhone();
    expect(await loadCardPayees(WALLET, CARD_WALLET)).toEqual({ mode: "approved", approved: [] });
    await syncCardPayees();
    expect(await loadCardPayees(WALLET, CARD_WALLET)).toMatchObject({
      mode: "confirm",
      approved: [{ id: LAKESIDE.id, approvedAt: NOW, approvedName: LAKESIDE.name }]
    });
    expect(bookOf(await loadPayeeBooks(WALLET), CARD_WALLET).unpublished).toEqual(new Set());
  });

  it("keeps each card's book apart: another phone finds each card's own", async () => {
    await approveCardPayee(WALLET, CARD_WALLET, LAKESIDE, NOW);
    await setCardPayeeMode(WALLET, OTHER_CARD_WALLET, "automatic", {
      now: NOW,
      passkeyConfirmed: true
    });
    const { books } = await syncCardPayees();
    expect(bookOf(books, CARD_WALLET).unpublished).toEqual(new Set());
    expect(bookOf(books, OTHER_CARD_WALLET).unpublished).toEqual(new Set());
    anotherPhone();
    await syncCardPayees();
    expect(await loadCardPayees(WALLET, CARD_WALLET)).toMatchObject({
      mode: "approved",
      approved: [{ id: LAKESIDE.id }]
    });
    expect(await loadCardPayees(WALLET, OTHER_CARD_WALLET)).toEqual({
      mode: "automatic",
      approved: []
    });
  });

  it("publishes only the books' marker for an account whose holder never chose nor approved", async () => {
    const { books, conclusive } = await syncCardPayees();
    const book = bookOf(books, CARD_WALLET);
    expect(conclusive).toBe(true);
    expect(book.payees.size).toBe(0);
    // The account's backup was published as it opened; of the payees' author, the marker alone.
    const published = nostr.calls.filter(
      (call) => call.operation === "publish" && call.event?.pubkey === keys.nostr.publicKey
    );
    expect(published.map((call) => dTag(call.event!))).toEqual(
      currentRelays().map(() => formerModeAddress(keys))
    );
    for (const relay of currentRelays()) expect(payeeRecords(relay)).toEqual([]);
    // Given once: the next read finds it on every relay.
    const before = nostr.calls.length;
    await syncCardPayees();
    expect(nostr.calls.slice(before).filter((call) => call.operation === "publish")).toEqual([]);
  });

  it("marks the books for an app of format 1, which then pays no card", async () => {
    // The holder only chose a mode, on another device: no merchant's record for an older app to
    // see as a newer app's.
    await setCardPayeeMode(WALLET, CARD_WALLET, "confirm", { now: NOW });
    await syncCardPayees();
    for (const relay of currentRelays()) {
      const [marker] = formerRecords(relay);
      expect(readAsFormat1(marker)).toMatchObject({ status: "newer" });
    }
    // This app reads it as no card's.
    expect((await loadCardPayees(WALLET, CARD_WALLET)).mode).toBe("confirm");
    expect((await syncCardPayees()).books.newerOnRelays).toBe(false);
  });

  it("gives the marker back after an app of format 1 wrote its mode there", async () => {
    await syncCardPayees();
    const [marker] = formerRecords(currentRelays()[0]);
    // An app of format 1 (not updated yet) changes its mode later.
    const old = sealRecord({
      type: "card-payee-mode",
      value: { version: 1, mode: "automatic", modeAt: NOW, updatedAt: marker.created_at + 60 },
      signer: keys.nostr.secretKey,
      encryptionKey: keys.encryptionKey,
      address: formerModeAddress(keys),
      createdAt: marker.created_at + 60,
      block: 1024
    });
    await publishElsewhere(old);
    for (const relay of currentRelays()) expect(formerRecords(relay)).toEqual([old]);
    await syncCardPayees();
    for (const relay of currentRelays()) {
      const [again] = formerRecords(relay);
      expect(again.created_at).toBeGreaterThan(old.created_at);
      expect(readAsFormat1(again)).toMatchObject({ status: "newer" });
    }
  });

  it("takes another device's removal: the merchant's next payment asks again", async () => {
    await approveCardPayee(WALLET, CARD_WALLET, LAKESIDE, NOW);
    await syncCardPayees();
    const [published] = [...bookOf(await loadPayeeBooks(WALLET), CARD_WALLET).payees.values()];
    // The holder removed it on the web, later.
    const removed: PayeeEntry = {
      ...published,
      approved: false,
      approvalAt: NOW + 60_000,
      updatedAt: published.updatedAt + 60
    };
    await publishElsewhere(payeeEvent(keys, removed));
    await syncCardPayees();
    expect((await loadCardPayees(WALLET, CARD_WALLET)).approved).toEqual([]);
    // Approved again on this phone, later still: approved, on the relays too.
    await approveCardPayee(WALLET, CARD_WALLET, LAKESIDE, NOW + 120_000);
    await syncCardPayees();
    anotherPhone();
    await syncCardPayees();
    expect((await loadCardPayees(WALLET, CARD_WALLET)).approved).toMatchObject([
      { approvedAt: NOW + 120_000 }
    ]);
  });

  it("dates what this phone adds after the relays' copy, both kept", async () => {
    await approveCardPayee(WALLET, CARD_WALLET, LAKESIDE, NOW);
    await syncCardPayees();
    const [published] = [...bookOf(await loadPayeeBooks(WALLET), CARD_WALLET).payees.values()];
    // Meanwhile, another phone saw the merchant again, under another name, and wrote it later
    // than this phone's rename below.
    const seen: PayeeEntry = {
      ...published,
      lastName: "The Lake",
      lastSeenAt: NOW + 30_000,
      updatedAt: published.updatedAt + 3600
    };
    await publishElsewhere(payeeEvent(keys, seen));
    await renameCardPayee(WALLET, CARD_WALLET, LAKESIDE.id, "My bakery", NOW + 10_000);
    const { books } = await syncCardPayees();
    const book = bookOf(books, CARD_WALLET);
    const merged = book.payees.get(LAKESIDE.id)!;
    expect(merged).toMatchObject({
      lastName: "The Lake",
      localName: "My bakery",
      updatedAt: seen.updatedAt + 1
    });
    expect(book.unpublished).toEqual(new Set());
    // Every relay keeps the merged copy, the later.
    for (const relay of currentRelays()) {
      expect(payeeRecords(relay).map((record) => record.created_at)).toEqual([seen.updatedAt + 1]);
    }
  });

  it("keeps what no majority took, published at the next sync", async () => {
    const relays = currentRelays();
    for (const relay of relays.slice(0, 3)) nostr.readOnly.add(relay);
    await approveCardPayee(WALLET, CARD_WALLET, LAKESIDE, NOW);
    let refresh = await syncCardPayees();
    // Read by a majority, taken by a minority: still to publish.
    expect(refresh.conclusive).toBe(true);
    expect(bookOf(refresh.books, CARD_WALLET).unpublished).toEqual(new Set([LAKESIDE.id]));
    nostr.readOnly.clear();
    refresh = await syncCardPayees();
    expect(bookOf(refresh.books, CARD_WALLET).unpublished).toEqual(new Set());
    for (const relay of relays) expect(payeeRecords(relay)).toHaveLength(1);
  });

  it("offline: the book as the phone keeps it, nothing more to publish", async () => {
    await approveCardPayee(WALLET, CARD_WALLET, LAKESIDE, NOW);
    await syncCardPayees();
    const before = bookOf(await loadPayeeBooks(WALLET), CARD_WALLET);
    for (const relay of currentRelays()) nostr.unreachable.add(relay);
    const { books, conclusive } = await syncCardPayees();
    const book = bookOf(books, CARD_WALLET);
    expect(conclusive).toBe(false);
    expect(book).toEqual(before);
    // Relays again, with nothing of the book (another list): all of it published there.
    nostr.resetRelays();
    const again = await syncCardPayees();
    expect(bookOf(again.books, CARD_WALLET).unpublished).toEqual(new Set());
    for (const relay of currentRelays()) expect(payeeRecords(relay)).toHaveLength(1);
  });

  it("reads every page: more records than a relay sends at once", async () => {
    const count = nostr.MAX_EVENTS_PER_FILTER + 20;
    for (let index = 0; index < count; index += 1) {
      await approveCardPayee(
        WALLET,
        CARD_WALLET,
        { id: `shop${index}@breez.tips`, name: `Shop ${index}` },
        NOW + index * 1000
      );
    }
    await syncCardPayees();
    anotherPhone();
    const { conclusive } = await syncCardPayees();
    expect(conclusive).toBe(true);
    expect((await loadCardPayees(WALLET, CARD_WALLET)).approved).toHaveLength(count);
  });
});

describe("a newer app's records", () => {
  /** A merchant's record of a format this app cannot read, at its address, later. */
  function newerRecord(entry: PayeeEntry): NostrEvent {
    return sealRecord({
      type: "card-payee",
      value: { ...payeeValue(entry), version: 4, more: true },
      signer: keys.nostr.secretKey,
      encryptionKey: keys.encryptionKey,
      address: payeeAddress(keys, entry, entry.id),
      createdAt: entry.updatedAt + 600,
      block: 1024
    });
  }

  it("stop the phone's payments and changes, and are never written over", async () => {
    await approveCardPayee(WALLET, CARD_WALLET, LAKESIDE, NOW);
    await syncCardPayees();
    const [published] = [...bookOf(await loadPayeeBooks(WALLET), CARD_WALLET).payees.values()];
    const newer = newerRecord(published);
    await publishElsewhere(newer);
    // This phone changes the merchant meanwhile: never published over the newer record.
    await renameCardPayee(WALLET, CARD_WALLET, LAKESIDE.id, "My bakery", NOW + 1000);
    const { books } = await syncCardPayees();
    const book = bookOf(books, CARD_WALLET);
    expect(books.newerOnRelays).toBe(true);
    expect(book.unpublished).toEqual(new Set([LAKESIDE.id]));
    for (const relay of currentRelays()) expect(payeeRecords(relay)).toEqual([newer]);
    await expect(loadCardPayees(WALLET, CARD_WALLET)).rejects.toBeInstanceOf(NewerCardPayeesError);
    await expect(removeCardPayee(WALLET, CARD_WALLET, LAKESIDE.id)).rejects.toBeInstanceOf(
      NewerCardPayeesError
    );
  });

  it("stop them until a majority of the relays answers without one", async () => {
    await approveCardPayee(WALLET, CARD_WALLET, LAKESIDE, NOW);
    await syncCardPayees();
    const [published] = [...bookOf(await loadPayeeBooks(WALLET), CARD_WALLET).payees.values()];
    await publishElsewhere(newerRecord(published));
    await syncCardPayees();
    // A newer app's records gone (relays that lost them, or that a newer app replaced): a
    // minority's answer does not tell.
    nostr.resetRelays();
    const relays = currentRelays();
    for (const relay of relays.slice(0, 3)) nostr.unreachable.add(relay);
    expect((await syncCardPayees()).books.newerOnRelays).toBe(true);
    nostr.unreachable.clear();
    expect((await syncCardPayees()).books.newerOnRelays).toBe(false);
    expect((await loadCardPayees(WALLET, CARD_WALLET)).approved).toHaveLength(1);
    // Its own copy published again where it was missing.
    for (const relay of relays) expect(payeeRecords(relay)).toHaveLength(1);
  });

  it("leave the mode's record and the others published", async () => {
    await approveCardPayee(WALLET, CARD_WALLET, LAKESIDE, NOW);
    await syncCardPayees();
    const [published] = [...bookOf(await loadPayeeBooks(WALLET), CARD_WALLET).payees.values()];
    await publishElsewhere(newerRecord(published));
    await approveCardPayee(
      WALLET,
      CARD_WALLET,
      { id: "frank@breez.tips", name: "Frank" },
      NOW + 1000
    );
    await setCardPayeeMode(WALLET, CARD_WALLET, "automatic", {
      now: NOW + 2000,
      passkeyConfirmed: true
    });
    const { books } = await syncCardPayees();
    const book = bookOf(books, CARD_WALLET);
    expect(book.unpublished).toEqual(new Set([LAKESIDE.id]));
    expect(book.unpublished.has(PAYEE_MODE_KEY)).toBe(false);
  });
});
