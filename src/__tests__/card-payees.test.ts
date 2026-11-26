import { decidePayee, decidePayeeAmong } from "@/lib/card/payee-decision";
import { isPayeeHomonym, payeeNameKey } from "@/lib/card/payee-names";
import type { PayeeCheck } from "@/lib/card/payee-proof";
import { PAYEE_MODE_KEY, bookOf } from "@/lib/card/payee-book";
import {
  CARD_PAYEES_DIR_NAME,
  DEFAULT_CARD_PAYEE_MODE,
  FormerCardWalletError,
  LooserCardPayeeModeError,
  MAX_APPROVED_PAYEES,
  NewerCardPayeesError,
  approveCardPayee,
  loadCardPayees,
  loadPayeeBooks,
  noteCardPayee,
  removeCardPayee,
  renameCardPayee,
  setCardPayeeMode,
  updatePayeeBooks,
  type CardPayees
} from "@/lib/card/payees";
import * as web from "@/lib/card/payees.web";
import { wipeDevice } from "@/features/settings/device-wipe";

import type * as FileSystemFake from "../../jest/expo-file-system";

/*
 * Whom each card pays without asking (each card its own): the holder's mode for the card,
 * "Approved merchants" by default,
 * and the merchants approved for it, keyed by address, as the phone keeps them in a file and the
 * web app in memory (their relays: card-payees-sync.test.ts); and what the mode decides for each
 * payee.
 */

const fileSystem = jest.requireMock<typeof FileSystemFake>("expo-file-system");
const PAYEES_URI = `file:///data/user/0/ch.swissbitcoinpay.checkout.staging/files/${CARD_PAYEES_DIR_NAME}/payees.json`;

const WALLET = "02".padEnd(66, "a");
/** The card the tests change the book of, and another of the account. */
const CARD = "30c19d9bfae333c1cb42a5ce6e20debb";
const OTHER_CARD = "0123456789abcdef0123456789abcdef";
/** Their first wallets, whose books the tests change; the card's next (deleted, added again). */
const CARD_WALLET = { cardId: CARD, walletGeneration: 1 };
const OTHER_CARD_WALLET = { cardId: OTHER_CARD, walletGeneration: 1 };
const NEXT_CARD_WALLET = { cardId: CARD, walletGeneration: 2 };
const NOW = Date.UTC(2026, 9, 15, 9, 0);
const LAC = { id: "sattleme01@breez.tips", name: "Lakeside Bakery" };
/** A node's key: a merchant identified by the node its invoices pay. */
const NODE = "030936e7a016fb3f5ce53c8db29da2b6dfbf8e068ea058c363e0fd77f444270d8a";

/** A check the mode decides on (a refused payee is never paid, whatever the mode). */
type Checked = Exclude<PayeeCheck, { status: "refused" }>;

function identified(payee: { id: string; name: string }): Checked {
  return {
    status: "identified",
    payee: {
      by: "address",
      ...payee,
      metadata: "[]",
      verify: "https://breez.tips/v",
      verifyAnswer: "{}"
    }
  };
}

const UNIDENTIFIED: Checked = { status: "unidentified", reason: "noProof", verifyAnswer: null };

beforeEach(() => fileSystem.resetFileSystem());

describe("the holder's merchants, on this phone", () => {
  it('start in "Approved merchants", nobody approved', async () => {
    expect(DEFAULT_CARD_PAYEE_MODE).toBe("approved");
    await expect(loadCardPayees(WALLET, CARD_WALLET)).resolves.toEqual({
      mode: "approved",
      approved: []
    });
    expect(fileSystem.files.has(PAYEES_URI)).toBe(false);
  });

  it("keep each card's mode and approved merchants under their irreversible name", async () => {
    expect(CARD_PAYEES_DIR_NAME).toBe("card-payees");
    await setCardPayeeMode(WALLET, CARD_WALLET, "confirm");
    await approveCardPayee(WALLET, CARD_WALLET, LAC, NOW);
    expect(await loadCardPayees(WALLET, CARD_WALLET)).toEqual({
      mode: "confirm",
      approved: [
        {
          id: LAC.id,
          by: "address",
          approvedAt: NOW,
          approvedName: LAC.name,
          lastName: LAC.name,
          lastSeenAt: NOW,
          localName: null
        }
      ]
    });
    const written = Date.now();
    expect(JSON.parse(fileSystem.files.get(PAYEES_URI)!)).toEqual({
      version: 3,
      walletId: WALLET,
      books: [
        {
          cardId: CARD,
          walletGeneration: 1,
          mode: {
            version: 2,
            cardId: CARD,
            walletGeneration: 1,
            mode: "confirm",
            modeAt: expect.any(Number),
            updatedAt: expect.any(Number)
          },
          payees: [
            {
              version: 2,
              cardId: CARD,
              walletGeneration: 1,
              address: LAC.id,
              approved: true,
              approvalAt: NOW,
              approvedAt: NOW,
              approvedName: LAC.name,
              localName: null,
              localNameAt: 0,
              lastName: LAC.name,
              lastSeenAt: NOW,
              updatedAt: NOW / 1000
            }
          ],
          // Neither is on the relays yet.
          unpublished: [PAYEE_MODE_KEY, LAC.id]
        }
      ],
      newerOnRelays: false
    });
    const { mode } = bookOf(await loadPayeeBooks(WALLET), CARD_WALLET);
    expect(mode.modeAt).toBeLessThanOrEqual(written);
    expect(mode.updatedAt).toBe(Math.floor(mode.modeAt / 1000));
  });

  it("give each card its own: a merchant approved for one card asks on the other", async () => {
    await approveCardPayee(WALLET, CARD_WALLET, LAC, NOW);
    await setCardPayeeMode(WALLET, OTHER_CARD_WALLET, "automatic", { passkeyConfirmed: true });
    expect(await loadCardPayees(WALLET, CARD_WALLET)).toMatchObject({
      mode: "approved",
      approved: [{ id: LAC.id }]
    });
    const other = await loadCardPayees(WALLET, OTHER_CARD_WALLET);
    expect(other).toEqual({ mode: "automatic", approved: [] });
    expect(decidePayee(other, identified(LAC)).automaticLocked).toBe(false);
    await removeCardPayee(WALLET, OTHER_CARD_WALLET, LAC.id);
    expect((await loadCardPayees(WALLET, CARD_WALLET)).approved).toHaveLength(1);
  });
  it("keep an approval when the merchant declares another name, and the holder's own", async () => {
    await approveCardPayee(WALLET, CARD_WALLET, LAC, NOW);
    await noteCardPayee(WALLET, CARD_WALLET, { ...LAC, name: "The Lake, bakery" }, NOW + 1000);
    // Approved again (confirmed in another mode): the first approval holds.
    await approveCardPayee(WALLET, CARD_WALLET, { ...LAC, name: "The Lake" }, NOW + 2000);
    await renameCardPayee(WALLET, CARD_WALLET, LAC.id, "  My bakery  ");
    const [payee] = (await loadCardPayees(WALLET, CARD_WALLET)).approved;
    expect(payee).toEqual({
      id: LAC.id,
      by: "address",
      approvedAt: NOW,
      approvedName: LAC.name,
      lastName: "The Lake",
      lastSeenAt: NOW + 2000,
      localName: "My bakery"
    });
    // Empty: its declared name again.
    await renameCardPayee(WALLET, CARD_WALLET, LAC.id, " ");
    expect((await loadCardPayees(WALLET, CARD_WALLET)).approved[0]!.localName).toBeNull();
    await expect(renameCardPayee(WALLET, CARD_WALLET, LAC.id, "x".repeat(61))).rejects.toThrow();
    // Nothing noted for a merchant not approved.
    await noteCardPayee(WALLET, CARD_WALLET, { id: "other@breez.tips", name: "Other" }, NOW);
    expect((await loadCardPayees(WALLET, CARD_WALLET)).approved).toHaveLength(1);
  });

  it("forget a merchant removed: its next payment asks again", async () => {
    await approveCardPayee(WALLET, CARD_WALLET, LAC, NOW);
    await removeCardPayee(WALLET, CARD_WALLET, LAC.id);
    const payees = await loadCardPayees(WALLET, CARD_WALLET);
    expect(payees.approved).toEqual([]);
    expect(decidePayee(payees, identified(LAC))).toMatchObject({
      automatic: false,
      cause: "newPayee"
    });
  });

  it("are another wallet's: not this one's", async () => {
    await approveCardPayee(WALLET, CARD_WALLET, LAC, NOW);
    await setCardPayeeMode(WALLET, CARD_WALLET, "automatic", { passkeyConfirmed: true });
    await expect(loadCardPayees("03".padEnd(66, "b"), CARD_WALLET)).resolves.toEqual({
      mode: "approved",
      approved: []
    });
    // The same wallet, its id in another case.
    expect((await loadCardPayees(WALLET.toUpperCase(), CARD_WALLET)).mode).toBe("automatic");
  });

  it("are never written over by an older app, and refuse to be read", async () => {
    const newer = JSON.stringify({ version: 4, walletId: WALLET, cards: {} });
    fileSystem.files.set(PAYEES_URI, newer);
    await expect(loadCardPayees(WALLET, CARD_WALLET)).rejects.toBeInstanceOf(NewerCardPayeesError);
    await expect(loadPayeeBooks(WALLET)).rejects.toBeInstanceOf(NewerCardPayeesError);
    await expect(approveCardPayee(WALLET, CARD_WALLET, LAC, NOW)).rejects.toBeInstanceOf(
      NewerCardPayeesError
    );
    await expect(setCardPayeeMode(WALLET, CARD_WALLET, "confirm")).rejects.toBeInstanceOf(
      NewerCardPayeesError
    );
    expect(fileSystem.files.get(PAYEES_URI)).toBe(newer);
    // A merchant of a newer format in books of this one: the same, for every card.
    fileSystem.files.delete(PAYEES_URI);
    await approveCardPayee(WALLET, CARD_WALLET, LAC, NOW);
    const file = JSON.parse(fileSystem.files.get(PAYEES_URI)!) as {
      books: { payees: object[] }[];
    };
    const [book] = file.books;
    const later = JSON.stringify({
      ...file,
      books: [{ ...book, payees: [{ ...book.payees[0], version: 4 }] }]
    });
    fileSystem.files.set(PAYEES_URI, later);
    await expect(loadCardPayees(WALLET, OTHER_CARD_WALLET)).rejects.toBeInstanceOf(
      NewerCardPayeesError
    );
    await expect(removeCardPayee(WALLET, CARD_WALLET, LAC.id)).rejects.toBeInstanceOf(
      NewerCardPayeesError
    );
    expect(fileSystem.files.get(PAYEES_URI)).toBe(later);
  });
  it("pay nothing and change nothing while the relays hold a newer app's records", async () => {
    await approveCardPayee(WALLET, CARD_WALLET, LAC, NOW);
    // What the relays' read finds (card-payees-sync.test.ts): for some card, which one unknown.
    await updatePayeeBooks(WALLET, (books) => ({ ...books, newerOnRelays: true }));
    for (const card of [CARD_WALLET, OTHER_CARD_WALLET]) {
      await expect(loadCardPayees(WALLET, card)).rejects.toBeInstanceOf(NewerCardPayeesError);
    }
    await expect(noteCardPayee(WALLET, CARD_WALLET, LAC, NOW + 1)).rejects.toBeInstanceOf(
      NewerCardPayeesError
    );
    await expect(
      setCardPayeeMode(WALLET, OTHER_CARD_WALLET, "automatic", { passkeyConfirmed: true })
    ).rejects.toBeInstanceOf(NewerCardPayeesError);
    await expect(renameCardPayee(WALLET, CARD_WALLET, LAC.id, "X")).rejects.toBeInstanceOf(
      NewerCardPayeesError
    );
    // Kept as they are, flag included, for a newer app's read to clear it.
    expect((await loadPayeeBooks(WALLET)).newerOnRelays).toBe(true);
    await updatePayeeBooks(WALLET, (books) => ({ ...books, newerOnRelays: false }));
    expect((await loadCardPayees(WALLET, CARD_WALLET)).approved).toHaveLength(1);
  });
  it("read damaged, or out of shape: the default mode, nobody approved", async () => {
    fileSystem.files.set(PAYEES_URI, "{not json");
    await expect(loadCardPayees(WALLET, CARD_WALLET)).resolves.toEqual({
      mode: "approved",
      approved: []
    });
    // Books of this format out of shape: none.
    const books = { version: 3, walletId: WALLET, books: [], newerOnRelays: false };
    for (const shape of [{ books: "x" }, { newerOnRelays: "no" }, { walletId: 7 }]) {
      fileSystem.files.set(PAYEES_URI, JSON.stringify({ ...books, ...shape }));
      await expect(loadCardPayees(WALLET, CARD_WALLET)).resolves.toEqual({
        mode: "approved",
        approved: []
      });
    }
    // A card's book out of shape is left out, a repeated card kept once; entries out of shape, or
    // naming another card, are left out, a repeated address kept once.
    await approveCardPayee(WALLET, CARD_WALLET, LAC, NOW);
    await setCardPayeeMode(WALLET, CARD_WALLET, "automatic", { passkeyConfirmed: true });
    const file = JSON.parse(fileSystem.files.get(PAYEES_URI)!) as {
      books: { mode: Record<string, unknown>; payees: Record<string, unknown>[] }[];
    };
    const [book] = file.books;
    const [lac] = book.payees;
    fileSystem.files.set(
      PAYEES_URI,
      JSON.stringify({
        ...file,
        books: [
          {
            ...book,
            payees: [
              lac,
              { ...lac, lastName: "Copy" },
              { ...lac, address: "Not An Address" },
              { ...lac, address: "b@breez.tips", approvedAt: -1 },
              { ...lac, address: "c@breez.tips", cardId: OTHER_CARD },
              // The card's next wallet's: not this book's either.
              { ...lac, address: "f@breez.tips", walletGeneration: 2 },
              { ...lac, address: "d@breez.tips", lastName: "x".repeat(256) }
            ],
            unpublished: [PAYEE_MODE_KEY, "c@breez.tips", 7]
          },
          { ...book, payees: [] },
          { ...book, cardId: "nope" },
          { ...book, cardId: OTHER_CARD, walletGeneration: 0 },
          { cardId: OTHER_CARD, payees: "x", unpublished: [] }
        ]
      })
    );
    const read = await loadPayeeBooks(WALLET);
    expect([...read.books.keys()]).toEqual([CARD]);
    expect([...bookOf(read, CARD_WALLET).payees.keys()]).toEqual([LAC.id]);
    expect(bookOf(read, CARD_WALLET).unpublished).toEqual(new Set([PAYEE_MODE_KEY]));
    expect((await loadCardPayees(WALLET, CARD_WALLET)).mode).toBe("automatic");
    // A mode out of shape, another card's or another wallet's: the default mode.
    const [kept] = (JSON.parse(fileSystem.files.get(PAYEES_URI)!) as typeof file).books;
    for (const mode of [
      { version: 2, mode: "never" },
      { ...book.mode, cardId: OTHER_CARD },
      { ...book.mode, walletGeneration: 2 }
    ]) {
      fileSystem.files.set(PAYEES_URI, JSON.stringify({ ...file, books: [{ ...kept, mode }] }));
      expect((await loadCardPayees(WALLET, CARD_WALLET)).mode).toBe("approved");
    }
  });
  it("take nothing of the books of before, one for every card (no migration)", async () => {
    const lac = {
      address: LAC.id,
      approvedAt: NOW,
      approvedName: LAC.name,
      lastName: "The Lake",
      lastSeenAt: NOW + 5000,
      localName: "My bakery"
    };
    const formats = [
      { version: 1, walletId: WALLET, mode: "automatic", approved: [lac] },
      {
        version: 2,
        walletId: WALLET,
        mode: { version: 1, mode: "automatic", modeAt: NOW, updatedAt: NOW / 1000 },
        payees: [],
        unpublished: [PAYEE_MODE_KEY],
        newerOnRelays: false
      }
    ];
    for (const format of formats) {
      const before = JSON.stringify(format);
      fileSystem.files.set(PAYEES_URI, before);
      // Every card in the default mode, nobody approved: every payment asks.
      for (const card of [CARD_WALLET, OTHER_CARD_WALLET]) {
        await expect(loadCardPayees(WALLET, card)).resolves.toEqual({
          mode: "approved",
          approved: []
        });
      }
      expect((await loadPayeeBooks(WALLET)).books.size).toBe(0);
      // Read only: an older app (OTA rollback) still finds its own until the first change.
      expect(fileSystem.files.get(PAYEES_URI)).toBe(before);
      await setCardPayeeMode(WALLET, CARD_WALLET, "confirm");
      expect(JSON.parse(fileSystem.files.get(PAYEES_URI)!)).toMatchObject({ version: 3 });
    }
  });
  it("keep at most 500 merchants for a card, the one seen the longest ago dropped first", async () => {
    const entry = (index: number) => ({
      version: 2,
      cardId: CARD,
      walletGeneration: 1,
      address: `m${index}@breez.tips`,
      approved: true,
      approvalAt: NOW,
      approvedAt: NOW,
      approvedName: `M${index}`,
      localName: null,
      localNameAt: 0,
      lastName: `M${index}`,
      lastSeenAt: NOW + (index === 7 ? -1 : index),
      updatedAt: NOW / 1000
    });
    fileSystem.files.set(
      PAYEES_URI,
      JSON.stringify({
        version: 3,
        walletId: WALLET,
        books: [
          {
            cardId: CARD,
            walletGeneration: 1,
            mode: {
              version: 2,
              cardId: CARD,
              walletGeneration: 1,
              mode: "approved",
              modeAt: 0,
              updatedAt: 0
            },
            payees: Array.from({ length: MAX_APPROVED_PAYEES }, (_, index) => entry(index)),
            unpublished: []
          }
        ],
        newerOnRelays: false
      })
    );
    await approveCardPayee(WALLET, CARD_WALLET, LAC, NOW + 10_000);
    const kept = (await loadCardPayees(WALLET, CARD_WALLET)).approved;
    expect(kept).toHaveLength(MAX_APPROVED_PAYEES);
    expect(kept.some((payee) => payee.id === "m7@breez.tips")).toBe(false);
    expect(kept.some((payee) => payee.id === LAC.id)).toBe(true);
    // Another card's count is its own.
    await approveCardPayee(WALLET, OTHER_CARD_WALLET, LAC, NOW);
    expect((await loadCardPayees(WALLET, OTHER_CARD_WALLET)).approved).toHaveLength(1);
  });
  it("keep a declared name of breez.tips' length at most, cut on whole characters", async () => {
    await approveCardPayee(WALLET, CARD_WALLET, { ...LAC, name: "ü".repeat(300) }, NOW);
    expect((await loadCardPayees(WALLET, CARD_WALLET)).approved[0]!.approvedName).toBe(
      "ü".repeat(255)
    );
    await approveCardPayee(
      WALLET,
      CARD_WALLET,
      { id: "e@breez.tips", name: "😀".repeat(200) },
      NOW
    );
    const emoji = (await loadCardPayees(WALLET, CARD_WALLET)).approved.find(
      (payee) => payee.id === "e@breez.tips"
    )!.approvedName;
    expect(emoji.length).toBeLessThanOrEqual(255);
    expect(emoji).toBe("😀".repeat(127));
  });

  it("keep a card added again apart from its former wallet's book", async () => {
    await approveCardPayee(WALLET, CARD_WALLET, LAC, NOW);
    await setCardPayeeMode(WALLET, CARD_WALLET, "automatic", { passkeyConfirmed: true });
    // Its next wallet: the default mode, nobody approved.
    await expect(loadCardPayees(WALLET, NEXT_CARD_WALLET)).resolves.toEqual({
      mode: "approved",
      approved: []
    });
    // Its first change keeps the next wallet's book, the former one gone with it.
    await setCardPayeeMode(WALLET, NEXT_CARD_WALLET, "confirm");
    expect(await loadCardPayees(WALLET, NEXT_CARD_WALLET)).toEqual({
      mode: "confirm",
      approved: []
    });
    await expect(loadCardPayees(WALLET, CARD_WALLET)).resolves.toEqual({
      mode: "approved",
      approved: []
    });
    // A screen or a payment of before (the former wallet): refused, never written over it.
    const kept = fileSystem.files.get(PAYEES_URI);
    await expect(approveCardPayee(WALLET, CARD_WALLET, LAC, NOW + 1)).rejects.toBeInstanceOf(
      FormerCardWalletError
    );
    await expect(
      setCardPayeeMode(WALLET, CARD_WALLET, "automatic", { passkeyConfirmed: true })
    ).rejects.toBeInstanceOf(FormerCardWalletError);
    expect(fileSystem.files.get(PAYEES_URI)).toBe(kept);
  });

  it("go with log out (wipeDevice)", async () => {
    await approveCardPayee(WALLET, CARD_WALLET, LAC, NOW);
    await wipeDevice();
    expect([...fileSystem.files.keys()].some((uri) => uri.includes("/card-payees/"))).toBe(false);
  });
});

describe("a mode that asks less often", () => {
  afterEach(() => web.forgetCardPayees());

  it.each([
    ["on this phone", { setCardPayeeMode, loadCardPayees }],
    [
      "in the web app",
      { setCardPayeeMode: web.setCardPayeeMode, loadCardPayees: web.loadCardPayees }
    ]
  ])("is kept only once the passkey confirmed it, a stricter one at once, %s", async (_, store) => {
    // "Always confirm" first: stricter than the default, no passkey.
    await store.setCardPayeeMode(WALLET, CARD_WALLET, "confirm");
    // Back to "Approved merchants", then "Automatic": looser, refused without it.
    await expect(store.setCardPayeeMode(WALLET, CARD_WALLET, "approved")).rejects.toBeInstanceOf(
      LooserCardPayeeModeError
    );
    await expect(store.setCardPayeeMode(WALLET, CARD_WALLET, "automatic")).rejects.toBeInstanceOf(
      LooserCardPayeeModeError
    );
    expect((await store.loadCardPayees(WALLET, CARD_WALLET)).mode).toBe("confirm");
    // Each card its own: the other card, at the default, is not stricter for it.
    await expect(
      store.setCardPayeeMode(WALLET, OTHER_CARD_WALLET, "automatic")
    ).rejects.toBeInstanceOf(LooserCardPayeeModeError);
    await store.setCardPayeeMode(WALLET, OTHER_CARD_WALLET, "confirm");
    // With it: kept.
    await store.setCardPayeeMode(WALLET, CARD_WALLET, "automatic", { passkeyConfirmed: true });
    expect((await store.loadCardPayees(WALLET, CARD_WALLET)).mode).toBe("automatic");
    // Stricter again, at once.
    await store.setCardPayeeMode(WALLET, CARD_WALLET, "approved");
    expect((await store.loadCardPayees(WALLET, CARD_WALLET)).mode).toBe("approved");
    expect((await store.loadCardPayees(WALLET, OTHER_CARD_WALLET)).mode).toBe("confirm");
  });

  it("is refused as looser than the mode the relays brought, not the one shown before", async () => {
    // Another device chose "Always confirm" (the relays' copy merged here).
    await updatePayeeBooks(WALLET, (books) => ({
      ...books,
      books: new Map([
        [
          CARD,
          {
            ...bookOf(books, CARD_WALLET),
            mode: {
              ...CARD_WALLET,
              mode: "confirm",
              modeAt: NOW,
              updatedAt: Math.floor(NOW / 1000)
            }
          }
        ]
      ])
    }));
    await expect(setCardPayeeMode(WALLET, CARD_WALLET, "approved")).rejects.toBeInstanceOf(
      LooserCardPayeeModeError
    );
    expect((await loadCardPayees(WALLET, CARD_WALLET)).mode).toBe("confirm");
  });
});

describe("the holder's merchants, in the web app", () => {
  afterEach(() => web.forgetCardPayees());

  it("are kept in memory, the open account's only, until the page closes or log out", async () => {
    await expect(web.loadCardPayees(WALLET, CARD_WALLET)).resolves.toEqual({
      mode: "approved",
      approved: []
    });
    await web.setCardPayeeMode(WALLET, CARD_WALLET, "confirm");
    await web.approveCardPayee(WALLET, CARD_WALLET, LAC, NOW);
    await web.renameCardPayee(WALLET, CARD_WALLET, LAC.id, "My bakery");
    expect(await web.loadCardPayees(WALLET.toUpperCase(), CARD_WALLET)).toMatchObject({
      mode: "confirm",
      approved: [{ id: LAC.id, localName: "My bakery" }]
    });
    expect(bookOf(await web.loadPayeeBooks(WALLET), CARD_WALLET).unpublished).toEqual(
      new Set([PAYEE_MODE_KEY, LAC.id])
    );
    await expect(web.loadCardPayees(WALLET, OTHER_CARD_WALLET)).resolves.toEqual({
      mode: "approved",
      approved: []
    });
    // Nothing written to the phone's storage.
    expect(fileSystem.files.size).toBe(0);
    await expect(web.loadCardPayees("03".padEnd(66, "b"), CARD_WALLET)).resolves.toEqual({
      mode: "approved",
      approved: []
    });
    web.forgetCardPayees();
    await expect(web.loadCardPayees(WALLET, CARD_WALLET)).resolves.toEqual({
      mode: "approved",
      approved: []
    });
  });
  it("refuse the same while the relays hold a newer app's records", async () => {
    await web.updatePayeeBooks(WALLET, (books) => ({ ...books, newerOnRelays: true }));
    await expect(web.loadCardPayees(WALLET, CARD_WALLET)).rejects.toBeInstanceOf(
      web.NewerCardPayeesError
    );
    await expect(web.setCardPayeeMode(WALLET, CARD_WALLET, "confirm")).rejects.toBeInstanceOf(
      web.NewerCardPayeesError
    );
  });
});

describe("two merchants' names", () => {
  it("are the same name case, spaces and accents aside", () => {
    expect(payeeNameKey("Lakeside Bakery")).toBe(payeeNameKey("  LAKESIDE  BAKERY "));
    expect(payeeNameKey("Zürich Ångström")).toBe(payeeNameKey("zurich angstrom"));
    expect(payeeNameKey("Zürich​ Ångström")).toBe(payeeNameKey("zurichangstrom"));
    expect(payeeNameKey("Ｃａｆｅ")).toBe(payeeNameKey("cafe"));
    expect(payeeNameKey("Lakeside Coffee")).not.toBe(payeeNameKey("Lakeside Coffee 2"));
  });

  it("point out a merchant not approved bearing an approved one's name", async () => {
    await approveCardPayee(WALLET, CARD_WALLET, LAC, NOW);
    await approveCardPayee(
      WALLET,
      CARD_WALLET,
      { id: "sattleme02@breez.tips", name: "Grocery" },
      NOW
    );
    await renameCardPayee(WALLET, CARD_WALLET, "sattleme02@breez.tips", "Frank's");
    const { approved } = await loadCardPayees(WALLET, CARD_WALLET);
    const homonym = { id: "relay@breez.tips", name: "lakeside  bakery" };
    expect(isPayeeHomonym(approved, homonym)).toBe(true);
    expect(isPayeeHomonym(approved, { ...homonym, name: "frank's" })).toBe(true);
    expect(isPayeeHomonym(approved, { ...homonym, name: "Other" })).toBe(false);
    // The approved merchant itself is no homonym.
    expect(isPayeeHomonym(approved, LAC)).toBe(false);
    expect(isPayeeHomonym(approved, { ...homonym, name: " " })).toBe(false);
  });
});

describe("what the mode decides", () => {
  async function payees(mode: CardPayees["mode"]): Promise<CardPayees> {
    await setCardPayeeMode(WALLET, CARD_WALLET, mode, { passkeyConfirmed: true });
    await approveCardPayee(WALLET, CARD_WALLET, LAC, NOW);
    return loadCardPayees(WALLET, CARD_WALLET);
  }

  it('"Approved merchants": an approved merchant paid without asking, others asked', async () => {
    const list = await payees("approved");
    expect(decidePayee(list, identified(LAC))).toEqual({
      payee: {
        status: "approved",
        name: LAC.name,
        by: "address",
        node: null,
        approvedAt: NOW,
        localName: null,
        formerName: null,
        homonym: false
      },
      automatic: true,
      automaticLocked: true,
      cause: "unconfirmed",
      approveOnConfirm: false
    });
    expect(decidePayee(list, identified({ id: "new@breez.tips", name: "New" }))).toEqual({
      payee: {
        status: "new",
        name: "New",
        by: "address",
        node: null,
        approvedAt: null,
        localName: null,
        formerName: null,
        homonym: false
      },
      automatic: false,
      automaticLocked: false,
      cause: "newPayee",
      approveOnConfirm: true
    });
    // Not identified: asked, never approved.
    expect(decidePayee(list, UNIDENTIFIED)).toEqual({
      payee: {
        status: "unidentified",
        name: null,
        by: null,
        node: null,
        approvedAt: null,
        localName: null,
        formerName: null,
        homonym: false
      },
      automatic: false,
      automaticLocked: false,
      cause: "unidentifiedPayee",
      approveOnConfirm: false
    });
  });

  it("shows a homonym, and the name an approved merchant was approved under", async () => {
    const list = await payees("approved");
    expect(
      decidePayee(list, identified({ id: "relay@breez.tips", name: "LAKESIDE BAKERY" }))
    ).toMatchObject({ payee: { status: "new", homonym: true }, automatic: false });
    // Renamed by the merchant: still approved, its former name shown.
    expect(decidePayee(list, identified({ ...LAC, name: "The Lake" }))).toMatchObject({
      payee: { status: "approved", name: "The Lake", formerName: LAC.name },
      automatic: true
    });
    // Its name cleaned for display: no reordering marks, one line.
    expect(
      decidePayee(list, identified({ id: "x@breez.tips", name: "Evil‮Coffee\n" })).payee.name
    ).toBe("Evil Coffee");
  });

  it('"Automatic": every payee paid without asking, shown as not checked', async () => {
    const list = await payees("automatic");
    for (const check of [identified(LAC), identified({ id: "n@breez.tips", name: "N" })]) {
      expect(decidePayee(list, check)).toMatchObject({
        payee: { status: "unchecked" },
        automatic: true,
        approveOnConfirm: false
      });
    }
    expect(decidePayee(list, UNIDENTIFIED)).toMatchObject({
      payee: { status: "unchecked", name: null },
      automatic: true,
      cause: "unconfirmed"
    });
  });

  it("pays without asking, the account closed, an identified merchant approved only", async () => {
    // "Automatic": shown as not checked, but approved or not as the book says.
    const automatic = await payees("automatic");
    expect(decidePayee(automatic, identified(LAC)).automaticLocked).toBe(true);
    expect(
      decidePayee(automatic, identified({ id: "n@breez.tips", name: "N" })).automaticLocked
    ).toBe(false);
    expect(decidePayee(automatic, UNIDENTIFIED).automaticLocked).toBe(false);
    // An approved merchant's homonym is not it.
    expect(
      decidePayee(automatic, identified({ id: "relay@breez.tips", name: LAC.name })).automaticLocked
    ).toBe(false);
    // "Always confirm": nobody.
    const confirm = await payees("confirm");
    expect(decidePayee(confirm, identified(LAC)).automaticLocked).toBe(false);
    // Removed, in "Approved merchants": asked again.
    await setCardPayeeMode(WALLET, CARD_WALLET, "approved", { passkeyConfirmed: true });
    expect(
      decidePayee(await loadCardPayees(WALLET, CARD_WALLET), identified(LAC)).automaticLocked
    ).toBe(true);
    await removeCardPayee(WALLET, CARD_WALLET, LAC.id);
    expect(
      decidePayee(await loadCardPayees(WALLET, CARD_WALLET), identified(LAC)).automaticLocked
    ).toBe(false);
  });

  it("asks every payment of a card not told yet, whatever the candidates' modes", async () => {
    // The account closed, no card root on this phone: the tap is checked after the passkey, and
    // two cards of the account are on its relay.
    await setCardPayeeMode(WALLET, CARD_WALLET, "automatic", { passkeyConfirmed: true });
    await approveCardPayee(WALLET, CARD_WALLET, LAC, NOW);
    await approveCardPayee(WALLET, OTHER_CARD_WALLET, LAC, NOW + 5000);
    const both = [
      await loadCardPayees(WALLET, CARD_WALLET),
      await loadCardPayees(WALLET, OTHER_CARD_WALLET)
    ];
    // Approved for both: approved, whichever it is, from the later approval on.
    expect(decidePayeeAmong(both, identified(LAC))).toEqual({
      payee: {
        status: "approved",
        name: LAC.name,
        by: "address",
        node: null,
        approvedAt: NOW + 5000,
        localName: null,
        formerName: null,
        homonym: false
      },
      automatic: false,
      automaticLocked: false,
      cause: "unconfirmed",
      approveOnConfirm: false
    });
    // The point of sale's proof missing: said as such, whichever card it is.
    expect(decidePayeeAmong(both, UNIDENTIFIED)).toMatchObject({
      payee: { status: "unidentified", name: null },
      automatic: false,
      automaticLocked: false,
      cause: "unidentifiedPayee"
    });
    // No candidate known: nobody approved.
    expect(decidePayeeAmong([], identified(LAC))).toMatchObject({
      payee: { status: "new", homonym: false },
      automatic: false,
      cause: "newPayee",
      approveOnConfirm: false
    });
  });

  it("never shows a payee approved for some candidates only as approved", async () => {
    await approveCardPayee(WALLET, CARD_WALLET, LAC, NOW);
    await renameCardPayee(WALLET, CARD_WALLET, LAC.id, "My bakery", NOW + 1);
    const candidates = [
      await loadCardPayees(WALLET, CARD_WALLET),
      await loadCardPayees(WALLET, OTHER_CARD_WALLET)
    ];
    expect(decidePayeeAmong(candidates, identified(LAC))).toEqual({
      payee: {
        status: "new",
        name: LAC.name,
        by: "address",
        node: null,
        approvedAt: null,
        localName: null,
        formerName: null,
        homonym: false
      },
      automatic: false,
      automaticLocked: false,
      // Maybe the tapped card's merchant: the point of sale is not told it is a new one.
      cause: "unconfirmed",
      approveOnConfirm: false
    });
    // An impostor bearing its name: pointed out, whichever card was tapped.
    const impostor = identified({ id: "sattleme99@breez.tips", name: "Lakeside bakery" });
    expect(decidePayeeAmong(candidates, impostor)).toMatchObject({
      payee: { status: "new", homonym: true },
      cause: "newPayee"
    });
    // Also under the holder's own name for it.
    expect(
      decidePayeeAmong(candidates, identified({ id: "sattleme98@breez.tips", name: "MY BAKERY" }))
        .payee.homonym
    ).toBe(true);
  });

  it("decides on a merchant identified by its node as on one by its address", async () => {
    // A private node: no alias.
    const node = { id: NODE, name: null };
    const byNode: Checked = {
      status: "identified",
      payee: { by: "node", id: NODE, name: null, verifyAnswer: null }
    };
    // Unknown: a new merchant, approvable, named by nothing it declared.
    const list = await payees("approved");
    expect(decidePayee(list, byNode)).toEqual({
      payee: {
        status: "new",
        name: null,
        by: "node",
        node: NODE,
        approvedAt: null,
        localName: null,
        formerName: null,
        homonym: false
      },
      automatic: false,
      automaticLocked: false,
      cause: "newPayee",
      approveOnConfirm: true
    });
    // Approved: paid without asking, the account open or closed, its holder's name for it shown.
    await approveCardPayee(WALLET, CARD_WALLET, node, NOW + 1);
    await renameCardPayee(WALLET, CARD_WALLET, NODE, "Market stall", NOW + 2);
    const approved = await loadCardPayees(WALLET, CARD_WALLET);
    expect(approved.approved.map(({ id, by }) => ({ id, by }))).toEqual([
      { id: LAC.id, by: "address" },
      { id: NODE, by: "node" }
    ]);
    expect(decidePayee(approved, byNode)).toMatchObject({
      payee: { status: "approved", by: "node", node: NODE, localName: "Market stall" },
      automatic: true,
      automaticLocked: true
    });
    // Another node, or an address bearing the holder's name for the node: neither is it.
    const other: Checked = {
      status: "identified",
      payee: { by: "node", id: `02${NODE.slice(2)}`, name: null, verifyAnswer: null }
    };
    expect(decidePayee(approved, other)).toMatchObject({
      payee: { status: "new", homonym: false },
      automatic: false
    });
    expect(
      decidePayee(approved, identified({ id: "stand@breez.tips", name: "Market stall" }))
    ).toMatchObject({ payee: { status: "new", by: "address", homonym: true }, automatic: false });
    // Among candidate cards: approved only by all of them.
    const candidates = [approved, await loadCardPayees(WALLET, OTHER_CARD_WALLET)];
    expect(decidePayeeAmong(candidates, byNode)).toMatchObject({
      payee: { status: "new", by: "node", node: NODE },
      cause: "unconfirmed",
      approveOnConfirm: false
    });
  });

  it("names a node by its alias: its word, kept when not read, a homonym pointed out", async () => {
    const named = (name: string | null): Checked => ({
      status: "identified",
      payee: { by: "node", id: NODE, name, verifyAnswer: null }
    });
    await approveCardPayee(WALLET, CARD_WALLET, { id: NODE, name: "LNBank" }, NOW);
    let list = await loadCardPayees(WALLET, CARD_WALLET);
    expect(list.approved).toMatchObject([{ id: NODE, approvedName: "LNBank", lastName: "LNBank" }]);
    expect(decidePayee(list, named("LNBank"))).toMatchObject({
      payee: { status: "approved", name: "LNBank", formerName: null, node: NODE },
      automatic: true
    });
    // Another alias since: still approved, its former one said.
    expect(decidePayee(list, named("LN Bank Frankfurt")).payee).toMatchObject({
      name: "LN Bank Frankfurt",
      formerName: "LNBank"
    });
    // Not read this time: still approved by its key, its last alias kept.
    expect(decidePayee(list, named(null))).toMatchObject({
      payee: { status: "approved", name: null, formerName: null },
      automatic: true
    });
    await noteCardPayee(WALLET, CARD_WALLET, { id: NODE, name: null }, NOW + 1000);
    list = await loadCardPayees(WALLET, CARD_WALLET);
    expect(list.approved[0]).toMatchObject({ lastName: "LNBank", lastSeenAt: NOW + 1000 });
    // Anyone may announce it: another node, or an address, bearing it is pointed out.
    const impostor: Checked = {
      status: "identified",
      payee: { by: "node", id: `02${NODE.slice(2)}`, name: "lnbank", verifyAnswer: null }
    };
    expect(decidePayee(list, impostor)).toMatchObject({
      payee: { status: "new", homonym: true },
      automatic: false
    });
    expect(
      decidePayee(list, identified({ id: "lnbank@breez.tips", name: "LNBANK" })).payee.homonym
    ).toBe(true);
  });

  it('"Always confirm": every payment asked, nobody approved by it', async () => {
    const list = await payees("confirm");
    expect(decidePayee(list, identified(LAC))).toMatchObject({
      payee: { status: "approved" },
      automatic: false,
      cause: "unconfirmed",
      approveOnConfirm: false
    });
    expect(decidePayee(list, identified({ id: "n@breez.tips", name: "N" }))).toMatchObject({
      payee: { status: "new" },
      automatic: false,
      cause: "newPayee",
      approveOnConfirm: false
    });
    expect(decidePayee(list, UNIDENTIFIED)).toMatchObject({
      automatic: false,
      cause: "unidentifiedPayee"
    });
  });
});
