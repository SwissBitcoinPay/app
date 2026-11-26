import { bytesToHex } from "@noble/hashes/utils.js";

import { encodeWalletSecret } from "@/lib/breez/secret";
import {
  CARD_COLORS,
  CARD_STATE_VERSION,
  addsToCardState,
  cardRecordAddress,
  cardStateEvent,
  cardStateValue,
  cardStatesOf,
  defaultCardColor,
  deriveCardRecordKeys,
  erasedThrough,
  isCardShown,
  mergeCardStates,
  parseCardState,
  type CardIssuer,
  type CardLook,
  type CardState
} from "@/lib/card/card-record";
import { deriveCardRoot } from "@/lib/card/keys";
import { signEvent } from "@/lib/nostr/event";
import { nip44Encrypt } from "@/lib/nostr/nip44";
import { NewerRecordError, sealRecord } from "@/lib/nostr/record";

const MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const root = deriveCardRoot(encodeWalletSecret({ mnemonic: MNEMONIC }));
const otherRoot = deriveCardRoot(encodeWalletSecret({ mnemonic: `${MNEMONIC} zoo` }));
const keys = deriveCardRecordKeys(root);
/** cardIdOf(root, 04996c6a926980): card-keys.test.ts. */
const CARD_ID = "30c19d9bfae333c1cb42a5ce6e20debb";

const STATE: CardState = {
  cardId: CARD_ID,
  uid: "04996c6a926980",
  keyVersion: 1,
  status: "active",
  relayHost: "relay.sattle.me",
  lastCounter: 5,
  depositedThrough: 1005,
  maxPaymentSats: 20_000n,
  maxDaySats: 50_000n,
  maxPaymentsPerHour: 5,
  suspended: false,
  name: "Erin's card",
  look: null,
  issuer: null,
  settingsAt: 1_789_999_000_000,
  walletGeneration: 1,
  updatedAt: 1_790_000_000
};

describe("the cards' record keys", () => {
  it("keep the released derivations (vectors, computed once with Node's HKDF)", () => {
    expect(bytesToHex(keys.nostr.secretKey)).toBe(
      "077a38801bbc201daf760716ecb83d1e63f1892ec97fb21ec3372564d83168b4"
    );
    expect(bytesToHex(keys.encryptionKey)).toBe(
      "1a28df849ca838190b8c30989dd8af46b4b4bf3650daaa4f42ed9156b1f7186c"
    );
    expect(bytesToHex(keys.addressKey)).toBe(
      "96b33479a577ef023bada7f74aeaa723ad8f2a94fa0d02c9f209c85f87c8bf60"
    );
    expect(cardRecordAddress(keys, CARD_ID)).toBe(
      "d4c9b17e2a7ec2b26da4ffbd866c49c05c5d9ae174108803093dec409e2363e9"
    );
  });

  it("are another wallet's for another wallet, and differ from every card key", () => {
    const other = deriveCardRecordKeys(otherRoot);
    expect(other.nostr.publicKey).not.toBe(keys.nostr.publicKey);
    expect(cardRecordAddress(other, CARD_ID)).not.toBe(cardRecordAddress(keys, CARD_ID));
  });
});

describe("a card's state", () => {
  it("goes through its record and back, the UID only inside", () => {
    const event = cardStateEvent(keys, STATE);
    expect(event.created_at).toBe(STATE.updatedAt);
    expect(event.tags).toEqual([["d", cardRecordAddress(keys, CARD_ID)]]);
    expect(JSON.stringify(event)).not.toContain(STATE.uid);
    expect(JSON.stringify(event)).not.toContain(CARD_ID);
    const read = cardStatesOf(keys, root, new Map([["wss://a", [event]]]));
    expect(read.states.get(CARD_ID)).toEqual(STATE);
    expect(read.answered).toBe(1);
  });

  it("is refused out of shape, or when its id is not its UID's for this wallet", () => {
    const value = cardStateValue(STATE);
    expect(parseCardState(value, root)).toEqual(STATE);
    expect(parseCardState(value, otherRoot)).toBeNull();
    expect(parseCardState(value, null)).toEqual(STATE);
    for (const patch of [
      { uid: "04996C6A926980" },
      { keyVersion: 0 },
      { status: "lost" },
      { relayHost: "https://relay.sattle.me" },
      { lastCounter: -1 },
      { lastCounter: 0x1000000 },
      { depositedThrough: 4 },
      { maxPaymentSats: 0 },
      { maxPaymentSats: 1.5 },
      { maxDaySats: 0 },
      { maxPaymentsPerHour: 1.5 },
      { maxPaymentsPerHour: 0 },
      { suspended: "no" },
      { name: undefined },
      { name: " Erin" },
      { name: "Erin\nCard" },
      { name: "Erin\u202e" },
      { name: "ü".repeat(41) },
      { updatedAt: -1 },
      { settingsAt: -1 },
      { settingsAt: 1.5 },
      { settingsAt: undefined },
      { version: 0 }
    ]) {
      expect(parseCardState({ ...value, ...patch }, root)).toBeNull();
    }
    expect(() => parseCardState({ ...value, version: CARD_STATE_VERSION + 1 }, root)).toThrow(
      NewerRecordError
    );
  });

  it('refuses a record of version 1 and the "disabled" status: no longer read', () => {
    const v1: Record<string, unknown> = { ...cardStateValue(STATE), version: 1 };
    expect(parseCardState(v1, root)).toBeNull();
    delete v1.settingsAt;
    expect(parseCardState(v1, root)).toBeNull();
    expect(cardStateValue(STATE)).toMatchObject({ version: 2, settingsAt: STATE.settingsAt });
    const deleted = cardStateValue({ ...STATE, status: "deleted" });
    for (const value of [
      cardStateValue(STATE),
      { ...cardStateValue(STATE), version: 3 },
      deleted
    ]) {
      expect(parseCardState(value, root)).not.toBeNull();
      expect(parseCardState({ ...value, status: "disabled" }, root)).toBeNull();
    }
  });

  it("writes a card being migrated at version 3 only: older apps still read every other", () => {
    const migrating: CardState = {
      ...STATE,
      status: "migrating",
      lastCounter: 0,
      depositedThrough: 0
    };
    expect(cardStateValue(migrating)).toMatchObject({ version: 3, status: "migrating" });
    expect(parseCardState(cardStateValue(migrating), root)).toEqual(migrating);
    for (const status of ["active", "reset"] as const) {
      expect(cardStateValue({ ...STATE, status })).toMatchObject({ version: 2 });
    }
    // Not a status of the versions before.
    expect(parseCardState({ ...cardStateValue(migrating), version: 2 }, root)).toBeNull();
    // Version 3 holds the other statuses too.
    expect(parseCardState({ ...cardStateValue(STATE), version: 3 }, root)).toEqual(STATE);
  });

  it("ends a migration with the card's programming or its reset, never the other way", () => {
    const migrating: CardState = {
      ...STATE,
      status: "migrating",
      lastCounter: 0,
      depositedThrough: 0,
      updatedAt: STATE.updatedAt + 50
    };
    // The active copy stands at the same version, however later the other was written.
    expect(mergeCardStates(migrating, STATE)).toEqual({ ...STATE, updatedAt: migrating.updatedAt });
    expect(mergeCardStates(STATE, migrating).status).toBe("active");
    expect(mergeCardStates(migrating, { ...STATE, status: "reset" }).status).toBe("reset");
    // At a later version, the migration is the programming to come.
    expect(mergeCardStates({ ...migrating, keyVersion: 2 }, STATE)).toMatchObject({
      status: "migrating",
      keyVersion: 2,
      lastCounter: 0
    });
  });

  it("keeps the newest programming, then a reset, then the highest counters of its keys", () => {
    const later = {
      ...STATE,
      lastCounter: 9,
      depositedThrough: 1009,
      updatedAt: STATE.updatedAt + 5
    };
    // The phone records a tap's counter: its write is the latest, its settings are not.
    const tap = { ...STATE, lastCounter: 3, updatedAt: STATE.updatedAt + 9 };
    expect(mergeCardStates(later, tap)).toEqual({ ...later, updatedAt: STATE.updatedAt + 9 });
    expect(mergeCardStates(tap, later)).toEqual(mergeCardStates(later, tap));
    const reset = { ...STATE, status: "reset" as const, updatedAt: STATE.updatedAt - 100 };
    expect(mergeCardStates(later, reset)).toEqual({
      ...later,
      status: "reset",
      updatedAt: later.updatedAt
    });
    expect(mergeCardStates(reset, later).status).toBe("reset");
    // A new programming: its own counters, not those of the keys it replaced.
    const next = { ...STATE, keyVersion: 2, lastCounter: 1, depositedThrough: 1, updatedAt: 1 };
    expect(mergeCardStates(reset, next)).toMatchObject({
      keyVersion: 2,
      status: "active",
      lastCounter: 1,
      depositedThrough: 1
    });
    expect(() => mergeCardStates(STATE, { ...STATE, cardId: "0".repeat(32) })).toThrow();
    expect(addsToCardState(later, tap)).toBe(false);
    expect(addsToCardState(tap, later)).toBe(true);
  });

  it("keeps the settings changed last, whoever wrote the record after", () => {
    // Suspended on the web app, and its ceiling lowered...
    const web = {
      ...STATE,
      suspended: true,
      maxPaymentSats: 5_000n,
      settingsAt: STATE.settingsAt + 60_000,
      updatedAt: STATE.updatedAt + 60
    };
    // ...while the phone, not told yet, recorded a tap later.
    const phone = { ...STATE, lastCounter: 6, updatedAt: STATE.updatedAt + 90 };
    const merged = mergeCardStates(phone, web);
    expect(merged).toEqual({
      ...web,
      lastCounter: 6,
      updatedAt: phone.updatedAt
    });
    expect(mergeCardStates(web, phone)).toEqual(merged);
    expect(addsToCardState(phone, web)).toBe(true);
    // Two changes at the same time: the cautious one, on every device.
    const renamed = { ...STATE, name: "Other", settingsAt: web.settingsAt };
    expect(mergeCardStates(renamed, web)).toEqual(mergeCardStates(web, renamed));
    expect(mergeCardStates(renamed, web).suspended).toBe(true);
    // Whatever the order of three copies.
    const reset = { ...STATE, status: "reset" as const, lastCounter: 7, updatedAt: 1 };
    const copies = [STATE, web, phone, renamed, reset];
    for (const a of copies) {
      for (const b of copies) {
        for (const c of copies) {
          expect(mergeCardStates(mergeCardStates(a, b), c)).toEqual(
            mergeCardStates(a, mergeCardStates(b, c))
          );
        }
      }
    }
  });

  it("merges every copy relays send, and ignores forged or foreign ones", () => {
    const newer = { ...STATE, lastCounter: 7, updatedAt: STATE.updatedAt + 1 };
    // Another key at the same address: never this wallet's card.
    const forged = sealRecord({
      type: "card-state",
      value: cardStateValue({ ...STATE, lastCounter: 0x10000 }),
      signer: new Uint8Array(32).fill(3),
      encryptionKey: keys.encryptionKey,
      address: cardRecordAddress(keys, CARD_ID),
      createdAt: STATE.updatedAt + 2
    });
    // Its own key, but at another card's address.
    const misplaced = sealRecord({
      type: "card-state",
      value: cardStateValue(STATE),
      signer: keys.nostr.secretKey,
      encryptionKey: keys.encryptionKey,
      address: "00".repeat(32),
      createdAt: STATE.updatedAt
    });
    // Dated otherwise than it says it was written.
    const misdated = sealRecord({
      type: "card-state",
      value: cardStateValue({ ...STATE, lastCounter: 50 }),
      signer: keys.nostr.secretKey,
      encryptionKey: keys.encryptionKey,
      address: cardRecordAddress(keys, CARD_ID),
      createdAt: STATE.updatedAt + 3
    });
    const read = cardStatesOf(
      keys,
      root,
      new Map([
        ["wss://a", [cardStateEvent(keys, STATE), forged, misplaced, misdated, { kind: 1 }]],
        ["wss://b", [cardStateEvent(keys, newer)]]
      ])
    );
    expect([...read.states.values()]).toEqual([newer]);
    expect(read.newer.size).toBe(0);
  });

  it("tells a record of a newer format, never reading it as its card", () => {
    const event = signEvent(
      {
        kind: 30078,
        created_at: STATE.updatedAt,
        tags: [["d", cardRecordAddress(keys, CARD_ID)]],
        content: nip44Encrypt(
          JSON.stringify({
            t: "card-state",
            v: { ...cardStateValue(STATE), version: CARD_STATE_VERSION + 1 }
          }),
          keys.encryptionKey
        )
      },
      keys.nostr.secretKey
    );
    const read = cardStatesOf(keys, root, new Map([["wss://a", [event]]]));
    expect(read.states.size).toBe(0);
    expect([...read.newer]).toEqual([cardRecordAddress(keys, CARD_ID)]);
  });
});

describe("the generation of a card's wallet (version 4)", () => {
  /** The card deleted, then added again: its next keys, a new wallet. */
  const AGAIN: CardState = {
    ...STATE,
    keyVersion: 2,
    lastCounter: 1,
    depositedThrough: 1,
    walletGeneration: 2
  };

  it("is written at version 4, which holds it above the first: the apps before read the others", () => {
    expect(cardStateValue(STATE)).toMatchObject({ version: 2 });
    expect(cardStateValue(STATE)).not.toHaveProperty("walletGeneration");
    expect(cardStateValue({ ...STATE, status: "deleted" })).toMatchObject({
      version: 4,
      walletGeneration: 1
    });
    expect(cardStateValue(AGAIN)).toMatchObject({ version: 4, walletGeneration: 2 });
    expect(parseCardState(cardStateValue(AGAIN), root)).toEqual(AGAIN);
    const event = cardStateEvent(keys, AGAIN);
    expect(cardStatesOf(keys, root, new Map([["wss://a", [event]]])).states.get(CARD_ID)).toEqual(
      AGAIN
    );
    // Its look and issuer's visual go with it.
    const look: CardLook = { kind: "color", color: "fir" };
    expect(parseCardState(cardStateValue({ ...AGAIN, look }), root)).toEqual({ ...AGAIN, look });
    // The records of versions 2 and 3, still written, pay from the first.
    for (const version of [2, 3]) {
      const value = { ...cardStateValue(STATE), version, look: null, issuer: null };
      expect(parseCardState({ ...value, walletGeneration: 7 }, root)?.walletGeneration).toBe(1);
    }
  });

  it("is refused out of shape", () => {
    const value = cardStateValue(AGAIN);
    for (const walletGeneration of [
      undefined,
      null,
      0,
      -1,
      1.5,
      "2",
      Number.MAX_SAFE_INTEGER + 1
    ]) {
      expect(parseCardState({ ...value, walletGeneration }, root)).toBeNull();
    }
  });

  it("goes with the card's programming: its new keys bring the new wallet", () => {
    const deleted: CardState = { ...STATE, status: "deleted", name: "", settingsAt: 2 };
    expect(mergeCardStates(deleted, AGAIN)).toMatchObject({
      status: "active",
      keyVersion: 2,
      walletGeneration: 2
    });
    expect(mergeCardStates(AGAIN, deleted)).toEqual(mergeCardStates(deleted, AGAIN));
    expect(addsToCardState(deleted, AGAIN)).toBe(true);
    expect(addsToCardState(AGAIN, deleted)).toBe(false);
    // A damaged copy of the same programming, of another generation: the same pick everywhere.
    const odd = { ...AGAIN, walletGeneration: 3 };
    expect(mergeCardStates(AGAIN, odd).walletGeneration).toBe(3);
    const copies = [STATE, deleted, AGAIN, odd, { ...AGAIN, status: "deleted" as const }];
    for (const a of copies) {
      for (const b of copies) {
        expect(mergeCardStates(a, b)).toEqual(mergeCardStates(b, a));
        for (const c of copies) {
          expect(mergeCardStates(mergeCardStates(a, b), c)).toEqual(
            mergeCardStates(a, mergeCardStates(b, c))
          );
        }
      }
    }
  });
});

describe("a card's look, its issuer's visual and its deletion (version 4)", () => {
  const IMAGE = { key: "11".repeat(32), hash: "22".repeat(32) };
  const ISSUER: CardIssuer = { image: IMAGE, number: "4821-0937-5530-1186", white: false };
  const PLUM: CardLook = { kind: "color", color: "plum" };
  const PHOTO: CardLook = { kind: "image", image: IMAGE, ink: "dark" };

  it("are written at version 4 only: a card with none of them is written as before", () => {
    expect(cardStateValue(STATE)).toMatchObject({ version: 2 });
    expect(cardStateValue(STATE)).not.toHaveProperty("look");
    expect(cardStateValue(STATE)).not.toHaveProperty("issuer");
    const states: CardState[] = [
      { ...STATE, look: PLUM },
      { ...STATE, look: PHOTO },
      { ...STATE, issuer: ISSUER },
      { ...STATE, status: "deleted" },
      { ...STATE, status: "migrating", lastCounter: 0, depositedThrough: 0, issuer: ISSUER }
    ];
    for (const state of states) {
      expect(cardStateValue(state)).toMatchObject({ version: 4 });
      expect(parseCardState(cardStateValue(state), root)).toEqual(state);
      const event = cardStateEvent(keys, state);
      expect(cardStatesOf(keys, root, new Map([["wss://a", [event]]])).states.get(CARD_ID)).toEqual(
        state
      );
    }
    // Version 4 holds a card without them too.
    const bare = {
      ...cardStateValue(STATE),
      version: 4,
      look: null,
      issuer: null,
      walletGeneration: 1
    };
    expect(parseCardState(bare, root)).toEqual(STATE);
    // A record of before has none, whatever it holds.
    expect(parseCardState({ ...cardStateValue(STATE), look: PLUM, issuer: ISSUER }, root)).toEqual(
      STATE
    );
  });

  it("are refused out of shape, and the deletion before version 4", () => {
    const value = cardStateValue({ ...STATE, look: PLUM, issuer: ISSUER });
    expect(parseCardState(value, root)).toEqual({ ...STATE, look: PLUM, issuer: ISSUER });
    for (const patch of [
      { look: undefined },
      { issuer: undefined },
      { look: "plum" },
      { look: [] },
      { look: { kind: "color" } },
      { look: { kind: "color", color: "red" } },
      { look: { kind: "pattern", color: "plum" } },
      { look: { kind: "image", image: IMAGE } },
      { look: { kind: "image", image: IMAGE, ink: "grey" } },
      { look: { kind: "image", image: { key: "11", hash: IMAGE.hash }, ink: "dark" } },
      { issuer: { ...ISSUER, number: "4821093755301186" } },
      { issuer: { ...ISSUER, number: "4821-0937-5530-118" } },
      { issuer: { ...ISSUER, number: "4821-0937-5530-1186 " } },
      { issuer: { ...ISSUER, white: "no" } },
      { issuer: { ...ISSUER, image: null } }
    ]) {
      expect(parseCardState({ ...value, ...patch }, root)).toBeNull();
    }
    const deleted = cardStateValue({ ...STATE, status: "deleted" });
    for (const version of [1, 2, 3]) {
      expect(parseCardState({ ...deleted, version }, root)).toBeNull();
    }
  });

  it("keeps the look and the issuer's visual changed last, as the card's other settings", () => {
    const plum = { ...STATE, look: PLUM, settingsAt: STATE.settingsAt + 1 };
    const photo = { ...STATE, look: PHOTO, settingsAt: STATE.settingsAt + 2 };
    expect(mergeCardStates(plum, photo).look).toEqual(PHOTO);
    expect(mergeCardStates(photo, plum).look).toEqual(PHOTO);
    expect(addsToCardState(plum, photo)).toBe(true);
    expect(addsToCardState(photo, plum)).toBe(false);
    // Two looks chosen at the same time: the same pick on every device.
    const fir = { ...plum, look: { kind: "color", color: "fir" } as CardLook };
    expect(mergeCardStates(plum, fir)).toEqual(mergeCardStates(fir, plum));
    // The visual its migration gave stands over the copies of before...
    const migrated = { ...STATE, issuer: ISSUER, settingsAt: STATE.settingsAt + 3 };
    expect(mergeCardStates(STATE, migrated).issuer).toEqual(ISSUER);
    expect(addsToCardState(STATE, migrated)).toBe(true);
    // ...and the card's deletion, later, erases it with its other settings.
    const deleted: CardState = {
      ...STATE,
      status: "deleted",
      name: "",
      issuer: null,
      settingsAt: STATE.settingsAt + 4
    };
    expect(mergeCardStates(migrated, deleted)).toMatchObject({
      status: "deleted",
      name: "",
      issuer: null
    });
    const copies = [STATE, plum, photo, fir, migrated, deleted];
    for (const a of copies) {
      for (const b of copies) {
        expect(mergeCardStates(a, b)).toEqual(mergeCardStates(b, a));
        for (const c of copies) {
          expect(mergeCardStates(mergeCardStates(a, b), c)).toEqual(
            mergeCardStates(a, mergeCardStates(b, c))
          );
        }
      }
    }
  });

  it("ends the card's programming with its deletion, which only its next wallet ends", () => {
    const deleted: CardState = { ...STATE, status: "deleted", updatedAt: STATE.updatedAt - 10 };
    // Over the card in service, however later written: never active again at those keys.
    const tap = {
      ...STATE,
      lastCounter: 9,
      depositedThrough: 1009,
      updatedAt: STATE.updatedAt + 9
    };
    expect(mergeCardStates(tap, deleted)).toMatchObject({ status: "deleted", lastCounter: 9 });
    expect(mergeCardStates({ ...STATE, status: "reset" }, deleted).status).toBe("deleted");
    expect(
      mergeCardStates(
        { ...STATE, status: "migrating", lastCounter: 0, depositedThrough: 0 },
        deleted
      ).status
    ).toBe("deleted");
    // Nor a reset at those keys (begun elsewhere, a relay change stopped): its data stay erased,
    // and its next programming takes the next wallet.
    expect(mergeCardStates(deleted, { ...STATE, status: "reset" }).status).toBe("deleted");
    expect(mergeCardStates({ ...STATE, status: "reset" }, deleted).status).toBe("deleted");
    // Nor new keys for the same wallet, however later: a phone that did not know of the deletion
    // programmed the card again. Its deleted wallet stays out of service,
    // the keys the card took last kept: a reset of the card found again starts from them.
    const next = { ...STATE, keyVersion: 2, lastCounter: 1, depositedThrough: 1 };
    for (const merged of [mergeCardStates(deleted, next), mergeCardStates(next, deleted)]) {
      expect(merged).toMatchObject({
        status: "deleted",
        keyVersion: 2,
        lastCounter: 1,
        depositedThrough: 1,
        walletGeneration: 1
      });
      expect(erasedThrough(merged)).toBe(1);
    }
    // The deletion, a tap at its keys seen elsewhere, then the programming: the same in any order,
    // its counters those of the keys the card took last.
    expect(mergeCardStates(mergeCardStates(deleted, tap), next)).toEqual(
      mergeCardStates(deleted, mergeCardStates(tap, next))
    );
    // The card found again: programmed with the next keys and the next wallet (pairing.ts).
    const again = { ...next, walletGeneration: 2 };
    for (const merged of [mergeCardStates(deleted, again), mergeCardStates(again, deleted)]) {
      expect(merged).toMatchObject({ status: "active", keyVersion: 2, walletGeneration: 2 });
      expect(erasedThrough(merged)).toBe(1);
    }
    // Deleted in turn: the later of the two deletions.
    expect(
      mergeCardStates(deleted, { ...again, status: "deleted" as const, updatedAt: 1 })
    ).toMatchObject({ status: "deleted", keyVersion: 2, walletGeneration: 2 });
    const copies = [STATE, deleted, tap, next, again, { ...next, status: "reset" as const }];
    for (const a of copies) {
      for (const b of copies) {
        expect(mergeCardStates(a, b)).toEqual(mergeCardStates(b, a));
        for (const c of copies) {
          expect(mergeCardStates(mergeCardStates(a, b), c)).toEqual(
            mergeCardStates(a, mergeCardStates(b, c))
          );
        }
      }
    }
  });

  it("never gives a card added again the settings of its deleted wallet, however later changed", () => {
    const deleted: CardState = { ...STATE, status: "deleted", name: "" };
    // A phone that did not know of the deletion changed the former card afterwards: named, its
    // limits raised, an image, the issuer's visual, paused.
    const former: CardState = {
      ...STATE,
      maxPaymentSats: 500_000n,
      maxDaySats: 1_000_000n,
      suspended: true,
      look: PHOTO,
      issuer: ISSUER,
      settingsAt: STATE.settingsAt + 4000
    };
    // The card found again: the next keys, the next wallet, its own settings (pairing.ts).
    const again: CardState = {
      ...STATE,
      keyVersion: 2,
      lastCounter: 0,
      depositedThrough: 0,
      name: "Card",
      settingsAt: STATE.settingsAt + 3000,
      walletGeneration: 2
    };
    for (const merged of [mergeCardStates(former, again), mergeCardStates(again, former)]) {
      expect(merged).toEqual(again);
    }
    expect(addsToCardState(again, former)).toBe(false);
    expect(addsToCardState(former, again)).toBe(true);
    // Its own settings changed later: the latest of its wallet's, in any order.
    const renamed: CardState = { ...again, name: "Everyday", settingsAt: STATE.settingsAt + 3500 };
    const copies = [deleted, former, again, renamed];
    for (const a of copies) {
      for (const b of copies) {
        expect(mergeCardStates(a, b)).toEqual(mergeCardStates(b, a));
        for (const c of copies) {
          expect(mergeCardStates(mergeCardStates(a, b), c)).toEqual(
            mergeCardStates(a, mergeCardStates(b, c))
          );
        }
      }
    }
    expect(
      [former, deleted, again].reduce((merged, copy) => mergeCardStates(merged, copy), renamed)
    ).toEqual(renamed);
  });

  it("never lends the counters of another wallet's copy at the same keys, in any order", () => {
    // Only a damaged copy names an earlier wallet at the keys of a later one (pairing.ts gives a
    // card added again the next keys): its counters are not those of the programming that stands.
    const later: CardState = {
      ...STATE,
      lastCounter: 1,
      depositedThrough: 10,
      walletGeneration: 3
    };
    const damaged: CardState = { ...STATE, lastCounter: 5, depositedThrough: 20 };
    const deleted: CardState = {
      ...STATE,
      keyVersion: 3,
      status: "deleted",
      lastCounter: 1,
      depositedThrough: 10,
      walletGeneration: 2
    };
    for (const merged of [mergeCardStates(later, damaged), mergeCardStates(damaged, later)]) {
      expect(merged).toMatchObject({ walletGeneration: 3, lastCounter: 1, depositedThrough: 10 });
    }
    const copies = [later, damaged, deleted];
    for (const a of copies) {
      for (const b of copies) {
        for (const c of copies) {
          expect(mergeCardStates(mergeCardStates(a, b), c)).toEqual(
            mergeCardStates(a, mergeCardStates(b, c))
          );
        }
      }
    }
  });

  it("draws each card's colour from its id: the same on every device, for good", () => {
    // Vectors: every card shows them (IRREVERSIBLE). The id of the test card of before the rename
    // to sattle.me (its salt): the colour depends on the id alone.
    expect(defaultCardColor("9d818bd8a3e5568e6b53cc6ccc0b905d")).toBe("ink");
    expect(defaultCardColor(`0000000a${"0".repeat(24)}`)).toBe("plum");
    expect(defaultCardColor(`ffffffff${"0".repeat(24)}`)).toBe("bitcoin");
    const drawn = new Set(
      Array.from({ length: 16 }, (_, index) =>
        defaultCardColor(`${index.toString(16).padStart(8, "0")}${"0".repeat(24)}`)
      )
    );
    expect([...drawn].sort()).toEqual([...CARD_COLORS].sort());
  });

  it('shows a card in "Cards" unless it was reset or deleted', () => {
    expect(isCardShown(STATE)).toBe(true);
    expect(isCardShown({ ...STATE, status: "migrating" })).toBe(true);
    for (const status of ["reset", "deleted"] as const) {
      expect(isCardShown({ ...STATE, status })).toBe(false);
    }
  });
});
