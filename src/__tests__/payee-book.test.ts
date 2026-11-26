// Whom each card pays without asking, as the devices keep it in step (src/lib/card/payee-book.ts):
// each part of an entry merged by the time it was decided, the same whatever the order.
import {
  approvePayee,
  bookOf,
  choosePayeeMode,
  emptyPayeeBook,
  emptyPayeeBooks,
  markPayeesPublished,
  MAX_APPROVED_PAYEES,
  mergePayeeModes,
  mergePayees,
  mergeRemotePayees,
  parsePayee,
  parsePayeeMode,
  PAYEE_MODE_KEY,
  payeesView,
  payeeValue,
  removePayee,
  renamePayee,
  seePayee,
  withBook,
  type PayeeBook,
  type PayeeEntry
} from "@/lib/card/payee-book";

/** The card whose book the tests change, and another of the account. */
const CARD = "30c19d9bfae333c1cb42a5ce6e20debb";
const OTHER_CARD = "0123456789abcdef0123456789abcdef";
/** Their first wallets, whose books the tests change. */
const WALLET = { cardId: CARD, walletGeneration: 1 };
const OTHER_WALLET = { cardId: OTHER_CARD, walletGeneration: 1 };
/** The card's next wallet: the card deleted, then added again. */
const NEXT_WALLET = { cardId: CARD, walletGeneration: 2 };
const ADDRESS = "sattleme02c6047f94@breez.tips";
const OTHER = "bakery@example.com";
/** A node's key, compressed: a merchant identified by the node its invoices pay. */
const NODE = "030936e7a016fb3f5ce53c8db29da2b6dfbf8e068ea058c363e0fd77f444270d8a";
const T0 = 1_790_000_000_000;

function entry(fields: Partial<PayeeEntry> = {}): PayeeEntry {
  return {
    ...WALLET,
    id: ADDRESS,
    approved: true,
    approvalAt: T0,
    approvedAt: T0,
    approvedName: "Fine Bakery",
    localName: null,
    localNameAt: 0,
    lastName: "Fine Bakery",
    lastSeenAt: T0,
    updatedAt: T0 / 1000,
    ...fields
  };
}

describe("merging two copies of a merchant", () => {
  const copies: PayeeEntry[] = [
    entry(),
    entry({ approved: false, approvalAt: T0 + 10, updatedAt: T0 / 1000 + 1 }),
    entry({ approvalAt: T0 + 10, approvedAt: T0 + 10, approvedName: "FB" }),
    entry({ localName: "My bakery", localNameAt: T0 + 5, updatedAt: T0 / 1000 + 2 }),
    entry({ lastName: "Fine Bakery Ltd", lastSeenAt: T0 + 20 }),
    entry({ localName: "Another", localNameAt: T0 + 5 })
  ];

  it("is the same whatever the order of the copies (commutative, associative, idempotent)", () => {
    for (const a of copies) {
      expect(mergePayees(a, a)).toEqual(a);
      for (const b of copies) {
        expect(mergePayees(a, b)).toEqual(mergePayees(b, a));
        for (const c of copies) {
          expect(mergePayees(mergePayees(a, b), c)).toEqual(mergePayees(a, mergePayees(b, c)));
        }
      }
    }
  });

  it("keeps the later decision of each part, the removal on a tie", () => {
    const merged = copies.reduce(mergePayees);
    // Removed and approved again at the same time: removed (the cautious one).
    expect(merged.approved).toBe(false);
    expect(merged.approvalAt).toBe(T0 + 10);
    expect(merged.lastName).toBe("Fine Bakery Ltd");
    expect(merged.lastSeenAt).toBe(T0 + 20);
    // Two names set at the same time: the same one on every device.
    expect(merged.localName).toBe("Another");
    expect(merged.updatedAt).toBe(T0 / 1000 + 2);
    expect(() => mergePayees(entry(), entry({ id: OTHER }))).toThrow();
    // Another card's approval of the same merchant is its own, and so is another wallet's of the
    // same card (deleted, then added again).
    expect(() => mergePayees(entry(), entry({ cardId: OTHER_CARD }))).toThrow();
    expect(() => mergePayees(entry(), entry({ walletGeneration: 2 }))).toThrow();
  });

  it("never brings back an approval an older copy holds", () => {
    const removed = entry({ approved: false, approvalAt: T0 + 1 });
    expect(mergePayees(entry(), removed).approved).toBe(false);
    expect(mergePayees(removed, entry()).approved).toBe(false);
  });
});

describe("merging two copies of the mode", () => {
  it("keeps the later choice, the stricter on a tie, whatever the order", () => {
    const automatic = { ...WALLET, mode: "automatic" as const, modeAt: T0, updatedAt: 1 };
    const confirm = { ...WALLET, mode: "confirm" as const, modeAt: T0, updatedAt: 2 };
    const later = { ...WALLET, mode: "automatic" as const, modeAt: T0 + 1, updatedAt: 3 };
    expect(mergePayeeModes(automatic, confirm)).toEqual({ ...confirm, updatedAt: 2 });
    expect(mergePayeeModes(confirm, automatic)).toEqual({ ...confirm, updatedAt: 2 });
    expect(mergePayeeModes(confirm, later)).toEqual(later);
    expect(mergePayeeModes(later, confirm)).toEqual(later);
    expect(() => mergePayeeModes(confirm, { ...later, cardId: OTHER_CARD })).toThrow();
    expect(() => mergePayeeModes(confirm, { ...later, walletGeneration: 2 })).toThrow();
  });
});

describe("the holder's changes", () => {
  it("approves, sees again, renames, removes and approves again, each dated", () => {
    let book: PayeeBook = approvePayee(
      emptyPayeeBook(WALLET),
      { id: ADDRESS, name: "Fine Bakery" },
      T0
    );
    expect(payeesView(book).approved).toEqual([
      {
        id: ADDRESS,
        by: "address",
        approvedAt: T0,
        approvedName: "Fine Bakery",
        lastName: "Fine Bakery",
        lastSeenAt: T0,
        localName: null
      }
    ]);
    expect(book.unpublished).toEqual(new Set([ADDRESS]));

    // Seen again under another name: its approval holds.
    book = seePayee(book, { id: ADDRESS, name: "FB" }, T0 + 1000)!;
    expect(payeesView(book).approved[0]).toMatchObject({
      lastName: "FB",
      approvedName: "Fine Bakery"
    });
    // Nothing new: nothing written.
    expect(seePayee(book, { id: ADDRESS, name: "FB" }, T0 + 1000)).toBeNull();
    expect(seePayee(book, { id: OTHER, name: "X" }, T0 + 1000)).toBeNull();

    book = renamePayee(book, ADDRESS, "  My bakery ", T0 + 2000)!;
    expect(payeesView(book).approved[0].localName).toBe("My bakery");
    expect(renamePayee(book, ADDRESS, "My bakery", T0 + 3000)).toBeNull();
    expect(() => renamePayee(book, ADDRESS, "x".repeat(61), T0)).toThrow();

    book = removePayee(book, ADDRESS, T0 + 4000)!;
    expect(payeesView(book).approved).toEqual([]);
    expect(book.payees.get(ADDRESS)).toMatchObject({ approved: false, approvalAt: T0 + 4000 });
    expect(removePayee(book, ADDRESS, T0 + 5000)).toBeNull();

    // Approved again: a new approval, its own name kept.
    book = approvePayee(book, { id: ADDRESS, name: "New one" }, T0 + 6000);
    expect(payeesView(book).approved[0]).toMatchObject({
      approvedAt: T0 + 6000,
      approvedName: "New one",
      localName: "My bakery"
    });
    // Each copy written after the one before.
    expect(book.payees.get(ADDRESS)!.updatedAt).toBeGreaterThan(T0 / 1000);
  });

  it("dates each copy after the one before, even within one second or with a clock gone back", () => {
    let book = approvePayee(emptyPayeeBook(WALLET), { id: ADDRESS, name: "A" }, T0);
    const first = book.payees.get(ADDRESS)!.updatedAt;
    book = renamePayee(book, ADDRESS, "B", T0)!;
    expect(book.payees.get(ADDRESS)!.updatedAt).toBe(first + 1);
    book = removePayee(book, ADDRESS, T0 - 60_000)!;
    // A removal at an earlier time still wins over the approval it follows.
    expect(book.payees.get(ADDRESS)!.approvalAt).toBe(T0 + 1);
  });

  it("refuses an address that is not one, and a node's key out of shape", () => {
    for (const id of [
      "Shop@Example.com",
      NODE.toUpperCase(),
      `04${NODE.slice(2)}`,
      NODE.slice(0, 64),
      PAYEE_MODE_KEY,
      ""
    ]) {
      expect(() => approvePayee(emptyPayeeBook(WALLET), { id, name: "Shop" }, T0)).toThrow();
    }
  });

  it("keeps a node's last alias known when its alias could not be read", () => {
    let book = approvePayee(emptyPayeeBook(WALLET), { id: NODE, name: null }, T0);
    expect(book.payees.get(NODE)).toMatchObject({ approvedName: "", lastName: "" });
    book = seePayee(book, { id: NODE, name: "LNBank" }, T0 + 1)!;
    expect(book.payees.get(NODE)!.lastName).toBe("LNBank");
    // Not read: seen again, its alias kept.
    book = seePayee(book, { id: NODE, name: null }, T0 + 2)!;
    expect(book.payees.get(NODE)).toMatchObject({ lastName: "LNBank", lastSeenAt: T0 + 2 });
    // Removed, approved again without it read: under none, its last alias still kept.
    book = removePayee(book, NODE, T0 + 3)!;
    book = approvePayee(book, { id: NODE, name: null }, T0 + 4);
    expect(book.payees.get(NODE)).toMatchObject({
      approved: true,
      approvedName: "",
      lastName: "LNBank"
    });
  });

  it("approves a merchant identified by its node like one by its address, without a name", () => {
    let book = approvePayee(emptyPayeeBook(WALLET), { id: NODE, name: "" }, T0);
    book = approvePayee(book, { id: ADDRESS, name: "Fine" }, T0 + 1);
    expect(payeesView(book).approved).toEqual([
      {
        id: NODE,
        by: "node",
        approvedAt: T0,
        approvedName: "",
        lastName: "",
        lastSeenAt: T0,
        localName: null
      },
      expect.objectContaining({ id: ADDRESS, by: "address" })
    ]);
    // Seen again, named by the holder, removed: as any merchant.
    book = seePayee(book, { id: NODE, name: "" }, T0 + 1000)!;
    expect(book.payees.get(NODE)!.lastSeenAt).toBe(T0 + 1000);
    book = renamePayee(book, NODE, "The market stall", T0 + 2000)!;
    expect(payeesView(book).approved[0].localName).toBe("The market stall");
    book = removePayee(book, NODE, T0 + 3000)!;
    expect(payeesView(book).approved.map((payee) => payee.id)).toEqual([ADDRESS]);
    expect(parsePayee(payeeValue(book.payees.get(NODE)!))).toEqual(book.payees.get(NODE));
  });

  it("removes the merchants seen the longest ago past MAX_APPROVED_PAYEES", () => {
    let book = emptyPayeeBook(WALLET);
    for (let index = 0; index < MAX_APPROVED_PAYEES; index += 1) {
      book = approvePayee(book, { id: `shop${index}@example.com`, name: "S" }, T0 + index);
    }
    book = approvePayee(book, { id: ADDRESS, name: "Fine" }, T0 + 10_000);
    const approved = payeesView(book).approved.map((payee) => payee.id);
    expect(approved).toHaveLength(MAX_APPROVED_PAYEES);
    expect(approved).toContain(ADDRESS);
    expect(approved).not.toContain("shop0@example.com");
    expect(book.payees.get("shop0@example.com")?.approved).toBe(false);
  });

  it("chooses the mode, dated after the one before", () => {
    const book = choosePayeeMode(emptyPayeeBook(WALLET), "confirm", T0)!;
    expect(payeesView(book).mode).toBe("confirm");
    expect(book.mode).toEqual({ ...WALLET, mode: "confirm", modeAt: T0, updatedAt: T0 / 1000 });
    expect(book.unpublished).toEqual(new Set([PAYEE_MODE_KEY]));
    expect(choosePayeeMode(book, "confirm", T0 + 1)).toBeNull();
    expect(() => choosePayeeMode(book, "never" as never, T0)).toThrow();
  });
});

describe("the relays' copies", () => {
  /** A book whose every entry a majority of the relays took. */
  function published(book: PayeeBook): PayeeBook {
    const copies = new Map<string, number>([[PAYEE_MODE_KEY, book.mode.updatedAt]]);
    for (const [address, copy] of book.payees) copies.set(address, copy.updatedAt);
    return markPayeesPublished(book, copies);
  }

  it("merge into the book: what only the book holds is to publish, the rest is theirs", () => {
    let book = published(approvePayee(emptyPayeeBook(WALLET), { id: ADDRESS, name: "Fine" }, T0));
    book = choosePayeeMode(book, "automatic", T0)!;
    // Another device removed the merchant later, and approved another.
    const merged = mergeRemotePayees(
      book,
      {
        mode: null,
        payees: new Map([
          [
            ADDRESS,
            entry({ approved: false, approvalAt: T0 + 1, approvedName: "Fine", lastName: "Fine" })
          ],
          [OTHER, entry({ id: OTHER })]
        ])
      },
      { conclusive: true }
    );
    expect(payeesView(merged).approved.map((payee) => payee.id)).toEqual([OTHER]);
    // The mode is only here; the merchant's removal is theirs, held whole.
    expect(merged.unpublished).toEqual(new Set([PAYEE_MODE_KEY]));
    expect(merged.payees.get(ADDRESS)!.updatedAt).toBe(T0 / 1000);
  });

  it("date what the book adds after every copy the relays hold", () => {
    let book = published(
      approvePayee(emptyPayeeBook(WALLET), { id: ADDRESS, name: "Fine Bakery" }, T0)
    );
    book = renamePayee(book, ADDRESS, "My bakery", T0 + 5000)!;
    book = choosePayeeMode(book, "automatic", T0 + 6000)!;
    // Meanwhile, another device saw the merchant again (a later copy, without the name) and wrote
    // an older choice of the mode later.
    const theirs = entry({ lastName: "FB", lastSeenAt: T0 + 9000, updatedAt: T0 / 1000 + 10 });
    const theirMode = {
      ...WALLET,
      mode: "confirm" as const,
      modeAt: T0 + 1000,
      updatedAt: T0 / 1000 + 20
    };
    const remote = { mode: theirMode, payees: new Map([[ADDRESS, theirs]]) };
    const merged = mergeRemotePayees(book, remote, { conclusive: false });
    expect(merged.payees.get(ADDRESS)).toEqual({
      ...theirs,
      localName: "My bakery",
      localNameAt: T0 + 5000,
      updatedAt: T0 / 1000 + 11
    });
    expect(merged.mode).toEqual({
      ...WALLET,
      mode: "automatic",
      modeAt: T0 + 6000,
      updatedAt: T0 / 1000 + 21
    });
    expect(merged.unpublished).toEqual(new Set([ADDRESS, PAYEE_MODE_KEY]));
    // Merged again with the same copies: nothing moves.
    expect(mergeRemotePayees(merged, remote, { conclusive: true })).toEqual(merged);
  });

  it("keep to publish what a relay holds already: a majority may not", () => {
    const book = approvePayee(emptyPayeeBook(WALLET), { id: ADDRESS, name: "Fine" }, T0);
    const copy = book.payees.get(ADDRESS)!;
    const remote = { mode: null, payees: new Map([[ADDRESS, copy]]) };
    const merged = mergeRemotePayees(book, remote, { conclusive: true });
    expect(merged.unpublished).toEqual(new Set([ADDRESS]));
    expect(merged.payees.get(ADDRESS)).toEqual(copy);
  });

  it("tell nothing of what they lack unless a majority of the relays answered", () => {
    let book = published(approvePayee(emptyPayeeBook(WALLET), { id: ADDRESS, name: "Fine" }, T0));
    book = published(choosePayeeMode(book, "confirm", T0)!);
    const none = { mode: null, payees: new Map<string, PayeeEntry>() };
    // Offline, or a minority: what the book holds is not known to be lacking.
    expect(mergeRemotePayees(book, none, { conclusive: false })).toEqual(book);
    // A majority holds none of it (new relays): all of it to publish.
    expect(mergeRemotePayees(book, none, { conclusive: true }).unpublished).toEqual(
      new Set([ADDRESS, PAYEE_MODE_KEY])
    );
  });

  it("are published once a majority took them, unless written again meanwhile", () => {
    const book = approvePayee(emptyPayeeBook(WALLET), { id: ADDRESS, name: "Fine" }, T0);
    const written = book.payees.get(ADDRESS)!.updatedAt;
    expect(markPayeesPublished(book, new Map([[ADDRESS, written]])).unpublished.size).toBe(0);
    const again = renamePayee(book, ADDRESS, "Me", T0 + 5000)!;
    expect(markPayeesPublished(again, new Map([[ADDRESS, written]])).unpublished).toEqual(
      new Set([ADDRESS])
    );
  });
});

describe("a copy's value", () => {
  it("goes through its value and back, checked whole", () => {
    expect(parsePayee(payeeValue(entry()))).toEqual(entry());
    const refused: Record<string, unknown>[] = [
      { cardId: undefined },
      { cardId: CARD.toUpperCase() },
      { cardId: "9d818bd8" },
      { walletGeneration: undefined },
      { walletGeneration: 0 },
      { walletGeneration: 1.5 },
      { walletGeneration: "1" },
      { address: "Shop@Example.com" },
      { approved: "yes" },
      { approvalAt: -1 },
      { approvedAt: T0 + 1 },
      { approvedName: "x".repeat(256) },
      { localName: "   " },
      { localName: "x".repeat(61) },
      { lastSeenAt: 1.5 },
      { version: 0 }
    ];
    for (const fields of refused) {
      expect(parsePayee({ ...payeeValue(entry()), ...fields })).toBeNull();
    }
    // 3 is a node's entry (NODE_PAYEE_FORMAT_VERSION): never an address's.
    expect(parsePayee({ ...payeeValue(entry()), version: 3 })).toBeNull();
    expect(parsePayee({ ...payeeValue(entry()), version: 4 })).toBe("newer");
    expect(parsePayee(null)).toBeNull();
  });

  it("keeps the released value of a merchant identified by its address (format 2)", () => {
    expect(payeeValue(entry())).toEqual({
      version: 2,
      cardId: CARD,
      walletGeneration: 1,
      address: ADDRESS,
      approved: true,
      approvalAt: T0,
      approvedAt: T0,
      approvedName: "Fine Bakery",
      localName: null,
      localNameAt: 0,
      lastName: "Fine Bakery",
      lastSeenAt: T0,
      updatedAt: T0 / 1000
    });
    expect(Object.keys(payeeValue(entry()))).toEqual([
      "version",
      "cardId",
      "walletGeneration",
      "address",
      "approved",
      "approvalAt",
      "approvedAt",
      "approvedName",
      "localName",
      "localNameAt",
      "lastName",
      "lastSeenAt",
      "updatedAt"
    ]);
  });

  it("writes a merchant identified by its node in format 3, read back whole", () => {
    const node = entry({ id: NODE, approvedName: "", lastName: "" });
    const value = payeeValue(node);
    expect(value).toMatchObject({ version: 3, node: NODE });
    expect(value).not.toHaveProperty("address");
    expect(parsePayee(value)).toEqual(node);
    const refused: Record<string, unknown>[] = [
      // Format 3 names a node only, format 2 an address only, never both.
      { version: 2 },
      { address: ADDRESS },
      { node: ADDRESS },
      { node: NODE.toUpperCase() },
      { node: `04${NODE.slice(2)}` },
      { node: NODE.slice(0, 64) },
      { node: undefined }
    ];
    for (const fields of refused) expect(parsePayee({ ...value, ...fields })).toBeNull();
    // An address's value naming a node: neither.
    expect(parsePayee({ ...payeeValue(entry()), address: NODE })).toBeNull();
    expect(parsePayee({ ...value, version: 4 })).toBe("newer");
  });

  it("reads the mode's value, checked whole", () => {
    const mode = { ...WALLET, mode: "confirm" as const, modeAt: T0, updatedAt: 5 };
    expect(parsePayeeMode({ version: 2, ...mode })).toEqual(mode);
    expect(parsePayeeMode({ version: 2, ...mode, mode: "never" })).toBeNull();
    expect(parsePayeeMode({ version: 2, ...mode, cardId: "" })).toBeNull();
    expect(parsePayeeMode({ version: 2, ...mode, walletGeneration: 0 })).toBeNull();
    expect(parsePayeeMode({ version: 2, ...mode, walletGeneration: undefined })).toBeNull();
    expect(parsePayeeMode({ version: 3, ...mode })).toBe("newer");
  });

  it("reads a copy of version 1, one book for every card, as no card's (not migrated)", () => {
    const { cardId: _cardId, ...v1 } = entry();
    expect(parsePayee({ ...v1, version: 1 })).toBeNull();
    expect(parsePayee({ ...payeeValue(entry()), version: 1 })).toBeNull();
    expect(parsePayeeMode({ version: 1, mode: "automatic", modeAt: T0, updatedAt: 5 })).toBeNull();
  });
});

describe("the books of the account's cards", () => {
  it("give each card its own mode and merchants, the default for a card without a book", () => {
    let books = emptyPayeeBooks();
    expect(payeesView(bookOf(books, WALLET))).toEqual({ mode: "approved", approved: [] });
    books = withBook(books, approvePayee(bookOf(books, WALLET), { id: ADDRESS, name: "B" }, T0));
    books = withBook(books, choosePayeeMode(bookOf(books, OTHER_WALLET), "confirm", T0)!);
    expect(payeesView(bookOf(books, WALLET))).toMatchObject({
      mode: "approved",
      approved: [{ id: ADDRESS }]
    });
    // The merchant approved for the first card is not for the other, in its own mode.
    expect(payeesView(bookOf(books, OTHER_WALLET))).toEqual({ mode: "confirm", approved: [] });
    expect(bookOf(books, OTHER_WALLET).mode.cardId).toBe(OTHER_CARD);
    expect([...books.books.keys()].sort()).toEqual([OTHER_CARD, CARD].sort());
    expect(books.newerOnRelays).toBe(false);
  });

  it("give a card added again after its deletion a book of its own: nothing of before", () => {
    let books = withBook(
      emptyPayeeBooks(),
      choosePayeeMode(
        approvePayee(emptyPayeeBook(WALLET), { id: ADDRESS, name: "B" }, T0),
        "automatic",
        T0
      )!
    );
    // Its next wallet: the default mode, nobody approved, whatever its first wallet's book says.
    expect(payeesView(bookOf(books, NEXT_WALLET))).toEqual({ mode: "approved", approved: [] });
    expect(bookOf(books, NEXT_WALLET)).toMatchObject({ ...NEXT_WALLET, unpublished: new Set() });
    // Its own book once kept; its first wallet's is then nobody's.
    books = withBook(books, choosePayeeMode(bookOf(books, NEXT_WALLET), "confirm", T0 + 1)!);
    expect(payeesView(bookOf(books, NEXT_WALLET))).toEqual({ mode: "confirm", approved: [] });
    expect(payeesView(bookOf(books, WALLET))).toEqual({ mode: "approved", approved: [] });
    // An earlier wallet's copies never merge into it, its mode nor a merchant it approved.
    expect(() =>
      mergeRemotePayees(
        bookOf(books, NEXT_WALLET),
        { mode: { ...WALLET, mode: "automatic", modeAt: T0 + 5, updatedAt: 9 }, payees: new Map() },
        { conclusive: true }
      )
    ).toThrow();
    expect(() =>
      mergeRemotePayees(
        bookOf(books, NEXT_WALLET),
        { mode: null, payees: new Map([[OTHER, entry({ id: OTHER })]]) },
        { conclusive: true }
      )
    ).toThrow();
  });
});
