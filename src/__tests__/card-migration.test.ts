import i18n from "@/i18n";

import { hexToBytes } from "@noble/hashes/utils.js";
import { act, renderHook, waitFor } from "@testing-library/react-native";

import { DEFAULT_CARD_RELAY_HOST, LEGACY_CARD_IMAGE_HOST } from "@/config/card";
import { closeAccount } from "@/features/account/session";
import {
  MigrationEndedError,
  drainLegacyCard,
  finishLegacyMigration,
  readLegacyBalance,
  reprogramLegacyCard
} from "@/features/card/migration";
import { LegacyCardError, PairingError, pairCard } from "@/features/card/pairing";
import {
  readAllCardIds,
  recordCardState,
  refreshCardStates,
  resetCardStates,
  withCardAccess
} from "@/features/card/states";
import { useCardPairing } from "@/features/card/useCardPairing";
import { cardStatesFilter, cardStatesOf, type CardState } from "@/lib/card/card-record";
import { CARD_STATES_KEY } from "@/lib/card/card-store";
import {
  LegacyWipeError,
  detectLegacyCard,
  wipeLegacyCard,
  type LegacyCard
} from "@/lib/card/legacy-card";
import { forgetDeviceKey } from "@/lib/card/device-key";
import { cardIdOf, channelSecretOf } from "@/lib/card/keys";
import { Ntag424 } from "@/lib/card/ntag424";
import { programCard } from "@/lib/card/program";
import { readLog } from "@/lib/log/log";
import { fetchImage } from "@/lib/media/image";
import { queryRelays } from "@/lib/nostr/pool";
import { currentRelays } from "@/lib/relays/current";

import { chargeReceiveFee, fakeCardWallet } from "../../jest/breez-sdk";
import { openTestAccount } from "../../jest/account";
import { addRelay } from "../../jest/card-relay";
import { binaries } from "../../jest/expo-file-system";
import { imageFake, resetImageFake } from "../../jest/image-manipulator";
import {
  addLegacyServer,
  holdCallback,
  imageRequests,
  serveLegacyImage,
  type FakeLegacyServer
} from "../../jest/legacy-card-server";
import type * as NfcFake from "../../jest/nfc-manager";
import type * as SecureStoreFake from "../../jest/expo-secure-store";
import type * as RelaysFake from "../../jest/nostr-relays";
import { FakeNtag424, legacyNtag424 } from "../../jest/ntag424";

/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock factories are synchronous */
jest.mock("react-native-nfc-manager", () => require("../../jest/nfc-manager"));
jest.mock("expo-image-manipulator", () => require("../../jest/image-manipulator"));
/* eslint-enable @typescript-eslint/no-require-imports */
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    expoConfig: {
      extra: { breezNetwork: "mainnet", eas: { projectId: "00000000-0000-4000-8000-000000000000" } }
    }
  }
}));

const nfc = jest.requireMock<typeof NfcFake>("react-native-nfc-manager");
const nostr = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");
const secureStore = jest.requireMock<typeof SecureStoreFake>("expo-secure-store");

const V2_HOST = "api.swiss-bitcoin-pay.ch";
const UID = "04aabbccddeeff";
const MASTER = "000102030405060708090a0b0c0d0e0f";
const META = "0f0e0d0c0b0a09080706050403020100";
const FILE = "a0a1a2a3a4a5a6a7a8a9aaabacadaeaf";

const OPTIONS = {
  channelName: "Card payments",
  messages: { alert: "Hold the card to the phone" }
};

let server: FakeLegacyServer;
let relay: ReturnType<typeof addRelay>;
/** The open account's card root, kept for the id derivations. */
let root: Uint8Array;
let formerApiKey: string | undefined;

/** A v2 card held to the phone, programmed with the v2 keys (env-independent). */
function v2Card(uid = UID): FakeNtag424 {
  return legacyNtag424({
    uid,
    host: V2_HOST,
    master: hexToBytes(MASTER),
    meta: hexToBytes(META),
    file: hexToBytes(FILE)
  });
}

/** A LegacyCard for `card`, as the detection would return it (its tap is not used past the drain). */
function legacyOf(uid = UID): LegacyCard {
  return {
    url: `lnurlw://${V2_HOST}/cards?p=${"ab".repeat(16)}&c=${"cd".repeat(8)}`,
    p: "AB".repeat(16),
    c: "CD".repeat(8),
    uid,
    cardId: cardIdOf(root, hexToBytes(uid))
  };
}

/** The commands that change a card (WriteData, ChangeFileSettings, ChangeKey, SetConfiguration). */
const CHANGING = [0x8d, 0x5f, 0xc4, 0x5c];

/**
 * A v2 card whose erase stopped once its `step`-th change was handled: 0 K1 blank, 1 K2 too, 2 K0
 * too (SDM still on), 3 SDM off, the v2 URL still in its file.
 */
async function halfWiped(step = 0, uid = UID): Promise<FakeNtag424> {
  const probe = v2Card(uid);
  await wipeLegacyCard(new Ntag424(probe.transceive), uid);
  const changes = probe.received.flatMap((apdu, i) => (CHANGING.includes(apdu[1]) ? [i] : []));
  const card = v2Card(uid);
  card.interruptAt(changes[step], true);
  await expect(wipeLegacyCard(new Ntag424(card.transceive), uid)).rejects.toMatchObject({
    code: "connection"
  });
  card.powerCycle();
  return card;
}

/** What a majority of the account's relays hold of the card (another device would read it). */
async function onRelays(cardId: string): Promise<CardState | undefined> {
  return withCardAccess(async (access) => {
    const answers = await queryRelays(cardStatesFilter(access.keys), {
      relays: currentRelays(),
      channel: "account",
      timeoutMs: 1000
    });
    return cardStatesOf(access.keys, access.root, answers).states.get(cardId);
  });
}

/** Another device of the account from here: nothing of this one's kept in memory nor storage. */
function anotherDevice(): void {
  resetCardStates();
  secureStore.items.delete(CARD_STATES_KEY);
}

/** Fewer than a majority of the account's relays answer from here. */
function relaysDown(): void {
  for (const url of currentRelays().slice(0, 3)) nostr.unreachable.add(url);
}

/** A majority of the account's relays answer reads, but take no event (a policy, a rate limit). */
function relaysReadOnly(): void {
  for (const url of currentRelays().slice(0, 3)) nostr.readOnly.add(url);
}

async function reason(promise: Promise<unknown>): Promise<string> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e
  );
  expect(error).toBeInstanceOf(PairingError);
  return (error as PairingError).reason;
}

beforeEach(async () => {
  nostr.resetRelays();
  nfc.resetNfcManager();
  resetImageFake();
  resetCardStates();
  forgetDeviceKey();
  formerApiKey = process.env.EXPO_PUBLIC_BREEZ_API_KEY;
  process.env.EXPO_PUBLIC_BREEZ_API_KEY = "test-api-key";
  relay = addRelay(DEFAULT_CARD_RELAY_HOST);
  server = addLegacyServer(V2_HOST);
  // The v2 keys live on the v2 server only (legacy-reset.ts): the fake one holds them.
  server.v2Keys = { master: hexToBytes(MASTER), meta: hexToBytes(META), file: hexToBytes(FILE) };
  await openTestAccount({ usage: "card", signUp: "card" });
  root = await withCardAccess(async (access) => Uint8Array.from(access.root));
});

afterEach(() => {
  closeAccount();
  if (formerApiKey === undefined) delete process.env.EXPO_PUBLIC_BREEZ_API_KEY;
  else process.env.EXPO_PUBLIC_BREEZ_API_KEY = formerApiKey;
});

describe("recognizing a v2 card", () => {
  it("reads the tap of one of our v2 cards, and the card it identifies", async () => {
    const card = v2Card();
    const legacy = await detectLegacyCard(new Ntag424(card.transceive), root);
    expect(legacy).not.toBeNull();
    expect(legacy!.uid).toBe(UID);
    expect(legacy!.cardId).toBe(cardIdOf(root, hexToBytes(UID)));
    expect(legacy!.url).toContain(`${V2_HOST}/cards`);
    expect(/^[0-9A-F]{32}$/.test(legacy!.p)).toBe(true);
    expect(/^[0-9A-F]{16}$/.test(legacy!.c)).toBe(true);
  });

  it("does not recognize a blank card", async () => {
    const card = new FakeNtag424();
    expect(await detectLegacyCard(new Ntag424(card.transceive), root)).toBeNull();
  });

  it("does not recognize a card with other keys (wrong keys do not verify its tap)", async () => {
    const card = legacyNtag424({
      uid: UID,
      host: V2_HOST,
      master: hexToBytes(MASTER),
      meta: hexToBytes("ffffffffffffffffffffffffffffffff"),
      file: hexToBytes("eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee")
    });
    expect(await detectLegacyCard(new Ntag424(card.transceive), root)).toBeNull();
  });

  it("does not recognize a card whose tap names another host than the v2 service", async () => {
    // The v2 keys ship in the app: anyone can program a card that verifies, under any URL.
    const card = legacyNtag424({
      uid: UID,
      host: "evil.example",
      master: hexToBytes(MASTER),
      meta: hexToBytes(META),
      file: hexToBytes(FILE)
    });
    expect(await detectLegacyCard(new Ntag424(card.transceive), root)).toBeNull();
  });

  it("does not offer a v2 card the v2 master key cannot erase: nothing would drain", async () => {
    const card = legacyNtag424({
      uid: UID,
      host: V2_HOST,
      master: hexToBytes("99999999999999999999999999999999"),
      meta: hexToBytes(META),
      file: hexToBytes(FILE)
    });
    expect(await detectLegacyCard(new Ntag424(card.transceive), root)).toBeNull();
    // At the pairing: the usual "not blank", the card untouched, no request to the v2 service.
    nfc.holdCard(card);
    expect(await reason(pairCard({ ...OPTIONS, relayHost: DEFAULT_CARD_RELAY_HOST }))).toBe(
      "notBlank"
    );
    expect(card.keyVersions).toEqual([1, 1, 1, 0, 0]);
    expect(server.calls).toHaveLength(0);
  });

  it("does not offer a v2 card whose key slots are not as the erase expects them", async () => {
    // Keys at version 0: the erase could not tell which key opens the card.
    const card = v2Card();
    card.keyVersions[0] = 0;
    expect(await detectLegacyCard(new Ntag424(card.transceive), root)).toBeNull();
    // A key in slot 3, which the v2 programming never set and the erase does not clear.
    const other = v2Card();
    other.keyVersions[3] = 1;
    expect(await detectLegacyCard(new Ntag424(other.transceive), root)).toBeNull();
  });

  it("is thrown from the pairing, the tap captured, the card untouched", async () => {
    const card = v2Card();
    nfc.holdCard(card);
    const error = await pairCard({ ...OPTIONS, relayHost: DEFAULT_CARD_RELAY_HOST }).then(
      () => null,
      (e: unknown) => e
    );
    expect(error).toBeInstanceOf(LegacyCardError);
    expect((error as LegacyCardError).card).toMatchObject({
      uid: UID,
      cardId: cardIdOf(root, hexToBytes(UID))
    });
    // Nothing was written to the card: it is still a v2 card.
    expect(card.keyVersions).toEqual([1, 1, 1, 0, 0]);
  });

  it('the pairing shows "not blank" for a v2 card when the v2 server has no v2 keys', async () => {
    server.v2Keys = null;
    nfc.holdCard(v2Card());
    expect(await reason(pairCard({ ...OPTIONS, relayHost: DEFAULT_CARD_RELAY_HOST }))).toBe(
      "notBlank"
    );
  });
});

describe("erasing a v2 card", () => {
  it("blanks it, and a blank card can then be programmed with this wallet's keys", async () => {
    const card = v2Card();
    await wipeLegacyCard(new Ntag424(card.transceive), UID);
    expect(card.keyVersions).toEqual([0, 0, 0, 0, 0]);
    const programmed = await withCardAccess((access) =>
      programCard(new Ntag424(card.transceive), {
        root: access.root,
        relayHost: DEFAULT_CARD_RELAY_HOST,
        version: 1
      })
    );
    expect(programmed.version).toBe(1);
    expect(card.keyVersions).toEqual([1, 1, 1, 1, 1]);
  });

  it("refuses a master key the card does not hold, and leaves the card untouched", async () => {
    const card = v2Card();
    // The server's master key is not the card's (its K1 and K2 are): the card refuses its answer.
    server.v2Keys = { ...server.v2Keys!, master: hexToBytes("99999999999999999999999999999999") };
    const error = await wipeLegacyCard(new Ntag424(card.transceive), UID).then(
      () => null,
      (e: unknown) => e
    );
    expect(error).toBeInstanceOf(LegacyWipeError);
    expect((error as LegacyWipeError).code).toBe("masterKeyRefused");
    expect(card.keyVersions).toEqual([1, 1, 1, 0, 0]);
    // Still a v2 card afterwards: it can be recognized again, with the right key.
    server.v2Keys = { ...server.v2Keys!, master: hexToBytes(MASTER) };
    expect(await detectLegacyCard(new Ntag424(card.transceive), root)).not.toBeNull();
  });

  it("never tries the v2 master key on a card whose tap names another one", async () => {
    // Another issuer's card, its key 0 not the v2 one.
    const card = legacyNtag424({
      uid: "04ffffffffffff",
      host: V2_HOST,
      master: hexToBytes("99999999999999999999999999999999"),
      meta: hexToBytes(META),
      file: hexToBytes(FILE)
    });
    const error = await wipeLegacyCard(new Ntag424(card.transceive), UID).then(
      () => null,
      (e: unknown) => e
    );
    expect((error as LegacyWipeError).code).toBe("otherCard");
    expect(card.failedAuthentications).toBe(0);
  });

  it("refuses to wipe another card than the one asked for", async () => {
    const card = v2Card("0411223344556677".slice(0, 14));
    const error = await wipeLegacyCard(new Ntag424(card.transceive), UID).then(
      () => null,
      (e: unknown) => e
    );
    expect(error).toBeInstanceOf(LegacyWipeError);
    expect((error as LegacyWipeError).code).toBe("otherCard");
  });
});

describe("the first withdraw request", () => {
  it("reads the card's whole balance, the most its tap may withdraw, its tap kept", async () => {
    // As the v2 server answers any tap: 1 sat to the balance.
    server.balanceMsat = BigInt(50_000_000);
    const balance = await readLegacyBalance(legacyOf());
    expect(balance).toEqual({ sats: BigInt(50_000), drain: true, visual: null, number: null });
    const asked = new URL(server.calls[0].url);
    // Nothing added to the tap: the server answers it as any other.
    expect([...asked.searchParams.keys()]).toEqual(["p", "c"]);
    // As the card wrote it (legacyOf).
    expect(asked.searchParams.get("p")).toBe("ab".repeat(16));
    expect(asked.searchParams.get("c")).toBe("cd".repeat(8));
  });

  it("says a card with no balance needs no transfer", async () => {
    server.balanceMsat = BigInt(0);
    expect(await readLegacyBalance(legacyOf())).toEqual({
      sats: BigInt(0),
      drain: false,
      visual: null,
      number: null
    });
  });

  it("takes a tap's 0 to 0 for an empty card, its 24-hour cap used up too", async () => {
    // The server answers both alike; taken for empty (such a card's balance stays in the v2
    // server's custody, for its support).
    server.balanceMsat = BigInt(50_000_000);
    server.remaining24hMsat = BigInt(0);
    expect(await readLegacyBalance(legacyOf())).toEqual({
      sats: BigInt(0),
      drain: false,
      visual: null,
      number: null
    });
  });

  it("fails as a drain failure when the server does not answer", async () => {
    server.unreachable = true;
    expect(await reason(readLegacyBalance(legacyOf()))).toBe("migrationDrainFailed");
  });

  it("refuses an amount that is not a whole number of sats, rather than round it away", async () => {
    // Above a sat, and below one: either way the remainder would be lost when the card is erased.
    server.wholeSats = false;
    for (const msat of [50_000_500, 500]) {
      server.balanceMsat = BigInt(msat);
      expect(await reason(readLegacyBalance(legacyOf()))).toBe("migrationDrainFailed");
    }
  });
});

describe("draining a v2 card", () => {
  it('records the card "migrating" on the relays first, then transfers its balance', async () => {
    server.balanceMsat = BigInt(50_000_000);
    const legacy = legacyOf();
    // What the card's wallet received: what "Balance transferred" says.
    expect(await drainLegacyCard(legacy)).toBe(BigInt(50_000));
    expect(fakeCardWallet(legacy.cardId).balanceSats).toBe(BigInt(50_000));
    expect(server.submitted).toHaveLength(1);
    expect(server.balanceMsat).toBe(BigInt(0));
    // In sight on every device of the account: its record, at the keys' version kept for it.
    expect(await onRelays(legacy.cardId)).toMatchObject({
      uid: UID,
      status: "migrating",
      keyVersion: 1,
      relayHost: DEFAULT_CARD_RELAY_HOST
    });
  });

  it("transfers nothing while no majority of the relays took the card's record", async () => {
    server.balanceMsat = BigInt(50_000_000);
    relaysDown();
    const legacy = legacyOf();
    expect(await reason(drainLegacyCard(legacy))).toBe("recordsUnreachable");
    // Not even asked: the v2 balance stays where it is.
    expect(server.calls).toHaveLength(0);
    expect(fakeCardWallet(legacy.cardId).balanceSats).toBe(BigInt(0));
  });

  it("transfers nothing while the card's record is read by a majority but taken by none", async () => {
    server.balanceMsat = BigInt(50_000_000);
    relaysReadOnly();
    const legacy = legacyOf();
    expect(await reason(drainLegacyCard(legacy))).toBe("recordsUnreachable");
    expect(server.calls).toHaveLength(0);
    expect(fakeCardWallet(legacy.cardId).balanceSats).toBe(BigInt(0));
  });

  it("empties the card's whole current balance, so nothing is left behind when it is erased", async () => {
    // The card now holds more than was announced to the holder at the confirmation.
    server.balanceMsat = BigInt(90_000_000);
    const legacy = legacyOf();
    // The sats received, not those announced.
    expect(await drainLegacyCard(legacy)).toBe(BigInt(90_000));
    expect(fakeCardWallet(legacy.cardId).balanceSats).toBe(BigInt(90_000));
  });

  it("says what the card's wallet received, as its receipt says it, not what was asked", async () => {
    server.balanceMsat = BigInt(50_000_000);
    // A wallet that pays to receive: its receipt says the sats it credited.
    chargeReceiveFee(BigInt(21));
    const legacy = legacyOf();
    expect(await drainLegacyCard(legacy)).toBe(BigInt(49_979));
    expect(fakeCardWallet(legacy.cardId).balanceSats).toBe(BigInt(49_979));
  });

  it("transfers nothing, and says so, when the balance was spent since it was read", async () => {
    server.balanceMsat = BigInt(0);
    const legacy = legacyOf();
    expect(await drainLegacyCard(legacy)).toBe(BigInt(0));
    expect(server.submitted).toHaveLength(0);
    expect(fakeCardWallet(legacy.cardId).balanceSats).toBe(BigInt(0));
  });

  it('does not claim "nothing moved" when the server refuses the invoice it was handed', async () => {
    // The callback answers an LNURL error (here "not enough funds"). The v2 server also answers one
    // when its node link breaks mid-payment, the payment settling afterwards: once the invoice was
    // handed over, an error does not prove that nothing moved.
    server.balanceMsat = BigInt(50_000_000);
    server.paysUpToMsat = BigInt(10_000_000);
    const legacy = legacyOf();
    expect(await reason(drainLegacyCard(legacy))).toBe("migrationReceiptPending");
    expect(fakeCardWallet(legacy.cardId).balanceSats).toBe(BigInt(0));
  });

  it("moves nothing when the server is unreachable", async () => {
    server.unreachable = true;
    const legacy = legacyOf();
    expect(await reason(drainLegacyCard(legacy))).toBe("migrationDrainFailed");
    expect(fakeCardWallet(legacy.cardId).balanceSats).toBe(BigInt(0));
  });

  it("refuses an amount that is not a whole number of sats before anything is handed over", async () => {
    server.wholeSats = false;
    server.balanceMsat = BigInt(50_000_500);
    const legacy = legacyOf();
    expect(await reason(drainLegacyCard(legacy))).toBe("migrationDrainFailed");
    expect(server.submitted).toHaveLength(0);
    expect(fakeCardWallet(legacy.cardId).balanceSats).toBe(BigInt(0));
  });

  it("stops before anything moves above the card's 24-hour cap, the card kept", async () => {
    // 50 000 sats, of which 20 000 may still be spent today: the server refuses the whole balance.
    server.balanceMsat = BigInt(50_000_000);
    server.remaining24hMsat = BigInt(20_000_000);
    const legacy = legacyOf();
    expect(await reason(drainLegacyCard(legacy))).toBe("migrationOverDailyLimit");
    expect(server.calls.map((call) => call.leg)).toEqual([1, 2]);
    expect(server.submitted).toHaveLength(0);
    expect(server.balanceMsat).toBe(BigInt(50_000_000));
    expect(fakeCardWallet(legacy.cardId).balanceSats).toBe(BigInt(0));
  });

  it("says nothing moved when the server's node finds no route, the card kept", async () => {
    // The v2 server answers "no_route" only once its node gave up for good, its reservation
    // released: never "may already be on their way" (a 90-sat card).
    server.balanceMsat = BigInt(90_000);
    server.noRoute = true;
    const legacy = legacyOf();
    expect(await reason(drainLegacyCard(legacy))).toBe("migrationDrainFailed");
    expect(server.calls.map((call) => call.leg)).toEqual([1, 2]);
    expect(server.submitted).toHaveLength(0);
    expect(server.balanceMsat).toBe(BigInt(90_000));
    expect(fakeCardWallet(legacy.cardId).balanceSats).toBe(BigInt(0));
  });

  it("moves nothing when the tap answers 0 to 0 at the transfer: its balance gone", async () => {
    server.balanceMsat = BigInt(50_000_000);
    server.remaining24hMsat = BigInt(0);
    const legacy = legacyOf();
    expect(await drainLegacyCard(legacy)).toBe(BigInt(0));
    expect(server.calls.map((call) => call.leg)).toEqual([1]);
    expect(server.submitted).toHaveLength(0);
  });
});

describe("re-encoding a v2 card", () => {
  it("erases it and programs it as an active v3 card, recorded with its channel", async () => {
    const card = v2Card();
    nfc.holdCard(card);
    const legacy = legacyOf();
    const paired = await reprogramLegacyCard(legacy, OPTIONS);
    expect(paired.state).toMatchObject({
      cardId: legacy.cardId,
      uid: UID,
      keyVersion: 1,
      status: "active",
      relayHost: DEFAULT_CARD_RELAY_HOST
    });
    // Programmed with this wallet's keys.
    expect(card.keyVersions).toEqual([1, 1, 1, 1, 1]);
    // Its migration over, on the relays too.
    expect(await onRelays(legacy.cardId)).toMatchObject({ status: "active", keyVersion: 1 });
    // A channel prepared on the relay for the card.
    const secret = channelSecretOf(root, legacy.cardId, DEFAULT_CARD_RELAY_HOST);
    expect(relay.channelOf(secret) ?? null).not.toBeNull();
  });

  it("checks the relay before the card is erased, as the pairing does", async () => {
    const card = v2Card();
    nfc.holdCard(card);
    relay.unreachable = true;
    expect(await reason(reprogramLegacyCard(legacyOf(), OPTIONS))).toBe("relayUnreachable");
    relay.unreachable = false;
    relay.protocol = 1;
    expect(await reason(reprogramLegacyCard(legacyOf(), OPTIONS))).toBe("relayIncompatible");
    relay.protocol = 2;
    // Still a v2 card: nothing was written to it, nor recorded.
    expect(card.keyVersions).toEqual([1, 1, 1, 0, 0]);
    expect(await onRelays(legacyOf().cardId)).toBeUndefined();
  });

  it("touches no card while no majority of the relays took the card's record", async () => {
    const card = v2Card();
    nfc.holdCard(card);
    relaysDown();
    expect(await reason(reprogramLegacyCard(legacyOf(), OPTIONS))).toBe("recordsUnreachable");
    expect(nfc.calls.filter((call) => call.startsWith("requestTechnology"))).toHaveLength(0);
    expect(card.keyVersions).toEqual([1, 1, 1, 0, 0]);
  });

  it("touches no card while the card's record is read by a majority but taken by none", async () => {
    const card = v2Card();
    nfc.holdCard(card);
    relaysReadOnly();
    expect(await reason(reprogramLegacyCard(legacyOf(), OPTIONS))).toBe("recordsUnreachable");
    expect(nfc.calls.filter((call) => call.startsWith("requestTechnology"))).toHaveLength(0);
    expect(card.keyVersions).toEqual([1, 1, 1, 0, 0]);
  });

  it("asks for no card when the holder left during the pairing's checks either", async () => {
    nfc.holdCard(new FakeNtag424(UID));
    expect(
      await reason(
        pairCard({ ...OPTIONS, relayHost: DEFAULT_CARD_RELAY_HOST, stopped: () => true })
      )
    ).toBe("cancelled");
    expect(nfc.calls.filter((call) => call.startsWith("requestTechnology"))).toHaveLength(0);
  });

  it("asks for no card, and records nothing, when the holder left during its checks", async () => {
    const card = v2Card();
    nfc.holdCard(card);
    expect(await reason(reprogramLegacyCard(legacyOf(), { ...OPTIONS, stopped: () => true }))).toBe(
      "cancelled"
    );
    expect(nfc.calls.filter((call) => call.startsWith("requestTechnology"))).toHaveLength(0);
    expect(card.keyVersions).toEqual([1, 1, 1, 0, 0]);
    expect(await onRelays(legacyOf().cardId)).toBeUndefined();
  });

  it("refuses to re-encode another card than the one migrated, its record kept", async () => {
    // A different physical card is presented at the re-encoding: the wipe refuses it (otherCard).
    nfc.holdCard(v2Card("04ffffffffffff"));
    const legacy = legacyOf(); // expects UID
    expect(await reason(reprogramLegacyCard(legacy, OPTIONS))).toBe("notThisCard");
    // The migration can go on from its record.
    expect(await onRelays(legacy.cardId)).toMatchObject({ status: "migrating" });
  });

  it("takes the next keys' version over a card this account had reset", async () => {
    const legacy = legacyOf();
    await withCardAccess((access) =>
      recordCardState(access, {
        cardId: legacy.cardId,
        uid: UID,
        keyVersion: 1,
        status: "reset",
        relayHost: DEFAULT_CARD_RELAY_HOST,
        lastCounter: 9,
        depositedThrough: 9,
        maxPaymentSats: BigInt(5_000),
        maxDaySats: BigInt(20_000),
        maxPaymentsPerHour: 3,
        suspended: false,
        name: "My card",
        look: null,
        issuer: null,
        settingsAt: 1,
        walletGeneration: 1
      })
    );
    const card = v2Card();
    nfc.holdCard(card);
    const paired = await reprogramLegacyCard(legacy, OPTIONS);
    // Its earlier taps never good again; its holder's settings kept.
    expect(paired.state).toMatchObject({
      status: "active",
      keyVersion: 2,
      maxPaymentSats: BigInt(5_000),
      name: "My card"
    });
    expect(card.keyVersions).toEqual([2, 2, 2, 2, 2]);
  });
});

describe("a full migration keeps the drained balance", () => {
  it("drains, then re-encodes: the v3 card pays from the wallet the balance went to", async () => {
    server.balanceMsat = BigInt(40_000_000);
    const card = v2Card();
    const legacy = legacyOf();

    await drainLegacyCard(legacy);
    expect(fakeCardWallet(legacy.cardId).balanceSats).toBe(BigInt(40_000));

    nfc.holdCard(card);
    const paired = await reprogramLegacyCard(legacy, OPTIONS);
    // The re-encoded card keeps the id, hence the wallet that now holds the balance, and the keys'
    // version its migration kept for it.
    expect(paired.state).toMatchObject({ cardId: legacy.cardId, status: "active", keyVersion: 1 });
    expect(fakeCardWallet(paired.state.cardId).balanceSats).toBe(BigInt(40_000));

    resetCardStates();
    const read = await withCardAccess(refreshCardStates);
    expect(read.states.map((s) => s.cardId)).toContain(legacy.cardId);
  });
});

describe("a v2 card's visual", () => {
  const IMAGE = `https://${LEGACY_CARD_IMAGE_HOST}/api/records/v1/cdn_files/AZoZx2Qk/file/content`;
  /** What the v2 server answers a migration with, beside the balance. */
  const VISUAL = { front_image: IMAGE, card_id: "4821-0937-5530-1186", is_white: true };
  /** The first bytes of a PNG: what the CDN serves of a card's front. */
  const PNG = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13);

  beforeEach(() => {
    server.visual = VISUAL;
    serveLegacyImage(IMAGE, PNG);
  });

  it("is read from the server's answer to the migration's first request", async () => {
    expect((await readLegacyBalance(legacyOf())).visual).toEqual({
      imageUrl: IMAGE,
      number: "4821-0937-5530-1186",
      white: true
    });
    // Read only: nothing downloaded before the holder confirms.
    expect(imageRequests).toEqual([]);
  });

  it("gives the number printed on the card, with a visual or without one", async () => {
    // Its v2 history is read by it once the card migrated (legacy-history.ts).
    expect((await readLegacyBalance(legacyOf())).number).toBe("4821-0937-5530-1186");
    // A card without a design: its number all the same.
    server.visual = { front_image: null, card_id: "4821-0937-5530-1186", is_white: false };
    const bare = await readLegacyBalance(legacyOf());
    expect(bare.visual).toBeNull();
    expect(bare.number).toBe("4821-0937-5530-1186");
    // A number out of shape is none, never guessed.
    server.visual = { card_id: "4821 0937 5530 1186" };
    expect((await readLegacyBalance(legacyOf())).number).toBeNull();
  });

  it("is kept with the card's record, its image downloaded once and kept on the relays", async () => {
    server.balanceMsat = BigInt(40_000_000);
    const legacy = legacyOf();
    const { visual } = await readLegacyBalance(legacy);
    await drainLegacyCard(legacy, { visual });
    const migrating = await onRelays(legacy.cardId);
    expect(migrating).toMatchObject({
      status: "migrating",
      issuer: { number: "4821-0937-5530-1186", white: true }
    });
    // A JPEG of the card's shape, cut from the CDN's image (1012 x 638 px).
    expect(imageFake.rendered.at(-1)).toMatchObject({ width: 640, height: 404 });
    // On the account's relays, as any image of the account: every device shows it from there.
    expect((await fetchImage(migrating!.issuer!.image)).status).toBe("found");

    nfc.holdCard(v2Card());
    const paired = await reprogramLegacyCard(legacy, { ...OPTIONS, visual });
    expect(paired.state.issuer).toEqual(migrating!.issuer);
    expect(await onRelays(legacy.cardId)).toMatchObject({
      status: "active",
      issuer: migrating!.issuer
    });
    // Downloaded once, by the first record; never left on the phone.
    expect(imageRequests).toEqual([IMAGE]);
    expect([...binaries.keys()]).toEqual([]);
  });

  it("is kept by the re-encoding of a card that had nothing to transfer", async () => {
    const legacy = legacyOf();
    const { drain, visual } = await readLegacyBalance(legacy);
    expect(drain).toBe(false);
    nfc.holdCard(v2Card());
    const paired = await reprogramLegacyCard(legacy, { ...OPTIONS, visual });
    expect(paired.state).toMatchObject({
      status: "active",
      issuer: { number: "4821-0937-5530-1186", white: true }
    });
  });

  it("leaves the card its colour, its migration going on, when the CDN does not serve it", async () => {
    serveLegacyImage(IMAGE, new Uint8Array(0), 404);
    server.balanceMsat = BigInt(40_000_000);
    const legacy = legacyOf();
    const { visual } = await readLegacyBalance(legacy);
    await drainLegacyCard(legacy, { visual });
    expect(fakeCardWallet(legacy.cardId).balanceSats).toBe(BigInt(40_000));
    expect(await onRelays(legacy.cardId)).toMatchObject({ status: "migrating", issuer: null });
    expect([...binaries.keys()]).toEqual([]);
  });

  it("is tried again by the re-encoding when the transfer's record could not keep it", async () => {
    serveLegacyImage(IMAGE, PNG, 503);
    server.balanceMsat = BigInt(40_000_000);
    const legacy = legacyOf();
    const { visual } = await readLegacyBalance(legacy);
    await drainLegacyCard(legacy, { visual });
    serveLegacyImage(IMAGE, PNG);
    nfc.holdCard(v2Card());
    const paired = await reprogramLegacyCard(legacy, { ...OPTIONS, visual });
    expect(paired.state.issuer).toMatchObject({ number: "4821-0937-5530-1186", white: true });
    expect(imageRequests).toEqual([IMAGE, IMAGE]);
  });

  it("is none for an answer out of shape: another host, a number unlike a card's, no boolean", async () => {
    for (const visual of [
      { ...VISUAL, front_image: "https://cdn.example.com/front.png" },
      { ...VISUAL, front_image: `http://${LEGACY_CARD_IMAGE_HOST}/front.png` },
      { ...VISUAL, card_id: "4821093755301186" },
      { ...VISUAL, is_white: "true" },
      { front_image: IMAGE, card_id: "4821-0937-5530-1186" }
    ]) {
      server.visual = visual;
      expect((await readLegacyBalance(legacyOf())).visual).toBeNull();
    }
    expect(imageRequests).toEqual([]);
  });
});

describe("a transfer that cannot be confirmed received", () => {
  it('is not "nothing moved" when the callback\'s answer is lost after it paid', async () => {
    server.balanceMsat = BigInt(20_000_000);
    server.loseCallbackAnswer = true;
    const legacy = legacyOf();
    expect(await reason(drainLegacyCard(legacy, { receiveMs: 0 }))).toBe("migrationReceiptPending");
    // The sats did move, into a wallet the card's record keeps in sight.
    expect(fakeCardWallet(legacy.cardId).balanceSats).toBe(BigInt(20_000));
    expect(await onRelays(legacy.cardId)).toMatchObject({ status: "migrating" });
  });

  it('does not claim "nothing moved", and leaves the card untouched', async () => {
    server.balanceMsat = BigInt(20_000_000);
    server.dropPayment = true; // the callback accepts the invoice but never pays it
    const legacy = legacyOf();
    // A tiny patience: the wallet never receives, so the wait reaches its deadline at once.
    expect(await reason(drainLegacyCard(legacy, { receiveMs: 0 }))).toBe("migrationReceiptPending");
    // The withdraw WAS submitted (the sats may be on their way), so this is not "drain failed".
    expect(server.submitted).toHaveLength(1);
  });
});

describe("an erase interrupted mid-wipe", () => {
  function cardIdForUid(): string {
    return cardIdOf(root, hexToBytes(UID));
  }

  it("resumes the wipe from wherever the card was left, the card telling it is the one", async () => {
    const probe = v2Card();
    await wipeLegacyCard(new Ntag424(probe.transceive), UID);
    const count = probe.received.length;
    for (let at = 0; at < count; at++) {
      for (const handled of [false, true]) {
        const card = v2Card();
        card.interruptAt(at, handled);
        await expect(wipeLegacyCard(new Ntag424(card.transceive), UID)).rejects.toBeTruthy();
        // Until every key is blank, SDM stays on: its tap tells which card it is.
        if (!card.keyVersions.every((v) => v === 0)) expect(card.ndefSettings.sdm).toBe(true);
        card.powerCycle();
        await wipeLegacyCard(new Ntag424(card.transceive), UID);
        expect(card.keyVersions).toEqual([0, 0, 0, 0, 0]);
        expect(card.failedAuthentications).toBe(0);
      }
    }
  });

  it("never tries a key on a half-wiped card whose tap names another one", async () => {
    for (const step of [0, 1, 2, 3]) {
      const card = await halfWiped(step, "04ffffffffffff");
      const from = card.received.length;
      const error = await wipeLegacyCard(new Ntag424(card.transceive), UID).then(
        () => null,
        (e: unknown) => e
      );
      expect(error).toMatchObject({ code: "otherCard" });
      expect(card.received.slice(from).some((apdu) => CHANGING.includes(apdu[1]))).toBe(false);
      expect(card.failedAuthentications).toBe(0);
    }
  });

  it("is recognized by the UID it tells against the account's record, from another device too", async () => {
    // Its migration recorded (here with no balance to move), then another device of the account.
    await drainLegacyCard(legacyOf());
    anotherDevice();
    for (const step of [0, 1, 2, 3]) {
      const card = await halfWiped(step);
      // No tap the v2 keys verify: not a v2 card as it was.
      expect(await detectLegacyCard(new Ntag424(card.transceive), root)).toBeNull();
      nfc.holdCard(card);
      const error = await pairCard({ ...OPTIONS, relayHost: DEFAULT_CARD_RELAY_HOST }).then(
        () => null,
        (e: unknown) => e
      );
      expect(error).toBeInstanceOf(LegacyCardError);
      expect((error as LegacyCardError).resume).toBe(true);
      expect((error as LegacyCardError).card).toMatchObject({ cardId: cardIdForUid(), uid: UID });
      expect(card.failedAuthentications).toBe(0);
    }
  });

  it("is never taken for an erase to resume while it is still a readable v2 card", async () => {
    // Recorded, then the transfer failed: the card holds its v2 balance, untouched. Its record
    // names it by its UID, but its tap still verifies: it is migrated afresh, its balance first.
    server.unreachable = true;
    expect(await reason(drainLegacyCard(legacyOf()))).toBe("migrationDrainFailed");
    expect(await onRelays(cardIdForUid())).toMatchObject({ status: "migrating" });
    server.unreachable = false;
    server.balanceMsat = BigInt(50_000_000);
    anotherDevice();
    const card = v2Card();
    nfc.holdCard(card);
    const error = await pairCard({ ...OPTIONS, relayHost: DEFAULT_CARD_RELAY_HOST }).then(
      () => null,
      (e: unknown) => e
    );
    expect(error).toBeInstanceOf(LegacyCardError);
    expect((error as LegacyCardError).resume).toBe(false);
    expect(card.keyVersions).toEqual([1, 1, 1, 0, 0]);
  });

  it('is "not blank" when the account records no migration of it, no key tried', async () => {
    const card = await halfWiped(3);
    const from = card.received.length;
    nfc.holdCard(card);
    expect(await reason(pairCard({ ...OPTIONS, relayHost: DEFAULT_CARD_RELAY_HOST }))).toBe(
      "notBlank"
    );
    expect(card.received.slice(from).some((apdu) => apdu[1] === 0x71)).toBe(false);
  });

  it("recovers: the half-wiped card is re-encoded, its drained balance kept", async () => {
    server.balanceMsat = BigInt(40_000_000);
    await drainLegacyCard(legacyOf());
    const card = await halfWiped(1);
    nfc.holdCard(card);

    const paired = await reprogramLegacyCard(legacyOf(), OPTIONS);
    expect(paired.state).toMatchObject({ cardId: cardIdForUid(), status: "active", keyVersion: 1 });
    expect(card.keyVersions).toEqual([1, 1, 1, 1, 1]);
    // The drained balance is still in the card's wallet.
    expect(fakeCardWallet(cardIdForUid()).balanceSats).toBe(BigInt(40_000));
    expect(await onRelays(cardIdForUid())).toMatchObject({ status: "active" });
  });

  it('is finished from its record alone ("Finish the migration"): one tap, its balance kept', async () => {
    server.balanceMsat = BigInt(40_000_000);
    await drainLegacyCard(legacyOf());
    anotherDevice();
    const card = await halfWiped(1);
    nfc.holdCard(card);
    const steps: string[] = [];
    const paired = await finishLegacyMigration(cardIdForUid(), {
      ...OPTIONS,
      onStep: (step) => steps.push(step)
    });
    expect(paired.state).toMatchObject({ cardId: cardIdForUid(), status: "active", keyVersion: 1 });
    expect(card.keyVersions).toEqual([1, 1, 1, 1, 1]);
    expect(steps).toEqual(["notifications", "relay", "card", "programming", "activating"]);
    // Nothing transferred again: its wallet keeps what the first attempt moved.
    expect(server.submitted).toHaveLength(1);
    expect(fakeCardWallet(cardIdForUid()).balanceSats).toBe(BigInt(40_000));
    expect(nfc.calls.filter((call) => call.startsWith("requestTechnology"))).toHaveLength(1);
    expect(await onRelays(cardIdForUid())).toMatchObject({ status: "active" });
  });

  it("refuses another card held before sending it anything, the migration still to finish", async () => {
    await drainLegacyCard(legacyOf());
    // Another v2 card, as it was, or half-wiped: Random ID, its UID told by its tap only.
    for (const other of [v2Card("04ffffffffffff"), await halfWiped(1, "04ffffffffffff")]) {
      const from = other.received.length;
      const versions = [...other.keyVersions];
      nfc.holdCard(other);
      expect(await reason(finishLegacyMigration(cardIdForUid(), OPTIONS))).toBe("notThisCard");
      // Read only: nothing written to it, no key it refused.
      expect(other.received.slice(from).some((apdu) => CHANGING.includes(apdu[1]))).toBe(false);
      expect(other.keyVersions).toEqual(versions);
      expect(other.failedAuthentications).toBe(0);
    }
    expect(await onRelays(cardIdForUid())).toMatchObject({ status: "migrating" });
  });

  it("is migrated already when another device finished it meanwhile: no card asked for", async () => {
    await withCardAccess((access) =>
      recordCardState(access, {
        cardId: cardIdForUid(),
        uid: UID,
        keyVersion: 1,
        status: "active",
        relayHost: DEFAULT_CARD_RELAY_HOST,
        lastCounter: 0,
        depositedThrough: 0,
        maxPaymentSats: BigInt(5_000),
        maxDaySats: BigInt(20_000),
        maxPaymentsPerHour: 3,
        suspended: false,
        name: "",
        look: null,
        issuer: null,
        settingsAt: 1,
        walletGeneration: 1
      })
    );
    anotherDevice();
    const error = await finishLegacyMigration(cardIdForUid(), OPTIONS).then(
      () => null,
      (e: unknown) => e
    );
    expect(error).toBeInstanceOf(MigrationEndedError);
    expect((error as MigrationEndedError).state).toMatchObject({
      cardId: cardIdForUid(),
      status: "active"
    });
    // Never recorded anew as migrating, nor any card asked for.
    expect(await onRelays(cardIdForUid())).toMatchObject({ status: "active", keyVersion: 1 });
    expect(nfc.calls.filter((call) => call.startsWith("requestTechnology"))).toHaveLength(0);
  });

  it('is "cardGone" for a card no longer on the account: nothing recorded, no card asked for', async () => {
    expect(await reason(finishLegacyMigration(cardIdForUid(), OPTIONS))).toBe("cardGone");
    expect(await onRelays(cardIdForUid())).toBeUndefined();
    expect(nfc.calls.filter((call) => call.startsWith("requestTechnology"))).toHaveLength(0);
  });

  it("asks for no card while no majority of the relays answered", async () => {
    await drainLegacyCard(legacyOf());
    relaysDown();
    expect(await reason(finishLegacyMigration(cardIdForUid(), OPTIONS))).toBe("recordsUnreachable");
    expect(nfc.calls.filter((call) => call.startsWith("requestTechnology"))).toHaveLength(0);
  });

  it("never erases a v2 card whose transfer did not happen: it still pays, its balance untouched", async () => {
    // Recorded, then the v2 server did not answer: nothing moved, the card a readable v2 card.
    server.unreachable = true;
    expect(await reason(drainLegacyCard(legacyOf()))).toBe("migrationDrainFailed");
    server.unreachable = false;
    server.balanceMsat = BigInt(50_000_000);
    const card = v2Card();
    nfc.holdCard(card);
    const error = await finishLegacyMigration(cardIdForUid(), OPTIONS).then(
      () => null,
      (e: unknown) => e
    );
    // Migrated afresh instead: its balance read again, then transferred, before any erase.
    expect(error).toBeInstanceOf(LegacyCardError);
    expect((error as LegacyCardError).resume).toBe(false);
    expect((error as LegacyCardError).card).toMatchObject({ cardId: cardIdForUid(), uid: UID });
    expect(card.keyVersions).toEqual([1, 1, 1, 0, 0]);
    expect(server.submitted).toHaveLength(0);
    expect(server.balanceMsat).toBe(BigInt(50_000_000));
    expect(await onRelays(cardIdForUid())).toMatchObject({ status: "migrating" });
  });

  /** The card blank (its erase ended), then its v3 programming left after its keys 1 and 2. */
  async function leftMidProgramming(): Promise<FakeNtag424> {
    const probe = new FakeNtag424(UID);
    await programCard(new Ntag424(probe.transceive), {
      root,
      relayHost: DEFAULT_CARD_RELAY_HOST,
      version: 1
    });
    // ChangeKey (C4h): its third, key 3, never reaches the card.
    const keyChanges = probe.received.flatMap((apdu, i) => (apdu[1] === 0xc4 ? [i] : []));
    const card = new FakeNtag424(UID);
    card.interruptAt(keyChanges[2]);
    await expect(
      programCard(new Ntag424(card.transceive), {
        root,
        relayHost: DEFAULT_CARD_RELAY_HOST,
        version: 1
      })
    ).rejects.toBeTruthy();
    expect(card.keyVersions).toEqual([0, 1, 1, 0, 0]);
    return card;
  }

  it("goes on with a programming left after the erase, as the pairing does", async () => {
    server.balanceMsat = BigInt(40_000_000);
    await drainLegacyCard(legacyOf());
    const card = await leftMidProgramming();
    nfc.holdCard(card);
    const paired = await finishLegacyMigration(cardIdForUid(), OPTIONS);
    expect(paired.state).toMatchObject({ cardId: cardIdForUid(), status: "active", keyVersion: 1 });
    expect(card.keyVersions).toEqual([1, 1, 1, 1, 1]);
    expect(fakeCardWallet(cardIdForUid()).balanceSats).toBe(BigInt(40_000));
  });

  it("activates a card programmed whose activation never came", async () => {
    await drainLegacyCard(legacyOf());
    // Erased and programmed (another device, or the app stopped), but never activated.
    const card = new FakeNtag424(UID);
    await programCard(new Ntag424(card.transceive), {
      root,
      relayHost: DEFAULT_CARD_RELAY_HOST,
      version: 1
    });
    nfc.holdCard(card);
    const sent = card.received.length;
    const paired = await finishLegacyMigration(cardIdForUid(), OPTIONS);
    expect(paired.state).toMatchObject({ status: "active", keyVersion: 1 });
    expect(card.keyVersions).toEqual([1, 1, 1, 1, 1]);
    // Read only: its programming had ended.
    expect(card.received.slice(sent).some((apdu) => apdu[1] === 0xc4)).toBe(false);
  });

  it("is ended by a pairing that finds the card blank (its erase had ended)", async () => {
    await drainLegacyCard(legacyOf());
    // The erase had ended (the card blank) but the card was lost before its programming.
    nfc.holdCard(new FakeNtag424(UID));
    const paired = await pairCard({ ...OPTIONS, relayHost: DEFAULT_CARD_RELAY_HOST });
    // At the version its migration kept for it.
    expect(paired.state).toMatchObject({ cardId: cardIdForUid(), status: "active", keyVersion: 1 });
  });
});

describe("one tap of a v2 card", () => {
  /** The APDUs of instruction `ins` the card received from `from` on. */
  function sent(card: FakeNtag424, ins: number, from: number) {
    return card.received.slice(from).filter((apdu) => apdu[1] === ins).length;
  }

  it("reads its keys' versions and its file once, as it was or half-wiped", async () => {
    await drainLegacyCard(legacyOf());
    anotherDevice();
    for (const card of [v2Card(), await halfWiped(1)]) {
      const from = card.received.length;
      nfc.holdCard(card);
      const error = await pairCard({ ...OPTIONS, relayHost: DEFAULT_CARD_RELAY_HOST }).then(
        () => null,
        (e: unknown) => e
      );
      expect(error).toBeInstanceOf(LegacyCardError);
      expect(sent(card, 0x64, from)).toBe(5);
      expect(sent(card, 0xad, from)).toBe(1);
      expect(card.failedAuthentications).toBe(0);
    }
  });

  it("reads it again once its erase changed it, before it is programmed", async () => {
    server.balanceMsat = BigInt(40_000_000);
    await drainLegacyCard(legacyOf());
    anotherDevice();
    const card = await halfWiped(1);
    const from = card.received.length;
    nfc.holdCard(card);
    const paired = await finishLegacyMigration(legacyOf().cardId, OPTIONS);
    expect(paired.state).toMatchObject({ status: "active", keyVersion: 1 });
    // Read before the erase, read back after it (the check that it is blank), programmed on that.
    expect(sent(card, 0x64, from)).toBe(10);
    expect(card.keyVersions).toEqual([1, 1, 1, 1, 1]);
  });
});

describe("a re-encoding interrupted at any command", () => {
  /** What "Try again" runs: the pairing, which finishes the migration or starts it afresh. */
  async function retryAsTheScreen() {
    try {
      return await pairCard({ ...OPTIONS, relayHost: DEFAULT_CARD_RELAY_HOST });
    } catch (error) {
      if (!(error instanceof LegacyCardError)) throw error;
      if (error.resume) return finishLegacyMigration(error.card.cardId, OPTIONS);
      await drainLegacyCard(error.card);
      return reprogramLegacyCard(error.card, OPTIONS);
    }
  }

  // One command in four each, the card gone before or after handling it (an erase, then a
  // programming that turns Random ID on halfway).
  it.each([0, 1, 2, 3])(
    'is migrated by "Try again" wherever it stopped (from command %i, one in four)',
    async (first) => {
      const probeUid = "04abffffffffff";
      await drainLegacyCard(legacyOf(probeUid));
      const probe = v2Card(probeUid);
      nfc.holdCard(probe);
      await reprogramLegacyCard(legacyOf(probeUid), OPTIONS);
      const count = probe.received.length;
      expect(count).toBeGreaterThan(20);

      for (let at = first; at < count; at += 4) {
        const uid = `04ab${at.toString(16).padStart(10, "0")}`;
        await drainLegacyCard(legacyOf(uid));
        const card = v2Card(uid);
        nfc.holdCard(card);
        card.interruptAt(at, (at >> 2) % 2 === 1);
        expect(await reason(reprogramLegacyCard(legacyOf(uid), OPTIONS))).toBe("cardLost");

        const paired = await retryAsTheScreen();
        expect(paired.state).toMatchObject({
          cardId: cardIdOf(root, hexToBytes(uid)),
          status: "active",
          keyVersion: 1
        });
        expect(card.keyVersions).toEqual([1, 1, 1, 1, 1]);
        expect(card.randomId).toBe(true);
        expect(card.failedAuthentications).toBe(0);
      }
    }
  );
});

describe("a card being migrated, on the account", () => {
  it('is among the cards "Delete account" checks the wallet of', async () => {
    await drainLegacyCard(legacyOf());
    anotherDevice();
    const read = await withCardAccess(readAllCardIds);
    expect(read.cardIds).toContain(legacyOf().cardId);
  });
});

describe("the pairing screen's migration", () => {
  it("stops before asking for the card again when the holder cancels during the transfer", async () => {
    server.balanceMsat = BigInt(30_000_000);
    const card = v2Card();
    nfc.holdCard(card);
    const { result } = await renderHook(() => useCardPairing({ enabled: true, another: true }));
    // Nothing asked of the phone before "Start".
    expect(result.current.view).toEqual({ phase: "guide" });
    await act(async () => result.current.start());
    await waitFor(() => expect(result.current.view.phase).toBe("legacy"), { timeout: 8000 });

    // The transfer asked of the v2 server, its answer held.
    const release = holdCallback(server);
    await act(async () => result.current.confirmMigration());
    await waitFor(() => expect(server.calls.filter((call) => call.leg === 2)).toHaveLength(1), {
      timeout: 8000
    });
    // Back to the guide at once: the transfer, once asked, goes on.
    await act(async () => {
      expect(result.current.cancel()).toBe(true);
    });
    expect(result.current.view).toEqual({ phase: "guide" });
    release();

    // The balance moved to the card's wallet, but no second NFC session was opened: the card
    // is still a v2 card, which a later pairing re-encodes; its record keeps its wallet in sight.
    await waitFor(
      () => expect(fakeCardWallet(legacyOf().cardId).balanceSats).toBe(BigInt(30_000)),
      { timeout: 8000 }
    );
    expect(result.current.view).toEqual({ phase: "guide" });
    expect(nfc.calls.filter((call) => call.startsWith("requestTechnology"))).toHaveLength(1);
    expect(card.keyVersions).toEqual([1, 1, 1, 0, 0]);
    expect(await onRelays(legacyOf().cardId)).toMatchObject({ status: "migrating" });
  });

  it("journals a transfer left that its server then refused: support sees it", async () => {
    server.balanceMsat = BigInt(30_000_000);
    nfc.holdCard(v2Card());
    const { result } = await renderHook(() => useCardPairing({ enabled: true, another: true }));
    await act(async () => result.current.start());
    await waitFor(() => expect(result.current.view.phase).toBe("legacy"), { timeout: 8000 });
    const release = holdCallback(server);
    await act(async () => result.current.confirmMigration());
    await waitFor(() => expect(server.calls.filter((call) => call.leg === 2)).toHaveLength(1), {
      timeout: 8000
    });
    await act(async () => {
      expect(result.current.cancel()).toBe(true);
    });
    // Refused once its invoice was handed over: the sats may still come, nothing says so on the
    // screen, which shows its guide.
    server.paysUpToMsat = BigInt(0);
    release();
    await waitFor(
      () =>
        expect(
          readLog().entries.filter((entry) => entry.event === "Card migration failed")
        ).toMatchObject([{ error: { kind: "PairingError" } }]),
      { timeout: 8000 }
    );
    expect(result.current.view).toEqual({ phase: "guide" });
  });

  it("starts again once the transfer left has stopped: its steps to come meanwhile", async () => {
    server.balanceMsat = BigInt(30_000_000);
    const card = v2Card();
    nfc.holdCard(card);
    const { result } = await renderHook(() => useCardPairing({ enabled: true, another: true }));
    await act(async () => result.current.start());
    await waitFor(() => expect(result.current.view.phase).toBe("legacy"), { timeout: 8000 });
    const release = holdCallback(server);
    await act(async () => result.current.confirmMigration());
    await waitFor(() => expect(server.calls.filter((call) => call.leg === 2)).toHaveLength(1), {
      timeout: 8000
    });
    await act(async () => {
      expect(result.current.cancel()).toBe(true);
    });

    // "Start" again while the transfer is still on its way: nothing said to be running,
    // nothing asked of the phone.
    await act(async () => result.current.start());
    expect(result.current.view).toEqual({ phase: "running", step: null });
    expect(nfc.calls.filter((call) => call.startsWith("requestTechnology"))).toHaveLength(1);

    // The transfer done, this attempt begins: the card, its balance moved, re-encoded.
    release();
    await waitFor(() => expect(result.current.view.phase).toBe("paired"), { timeout: 8000 });
    expect(card.keyVersions).toEqual([1, 1, 1, 1, 1]);
    expect(server.submitted).toHaveLength(1);
    expect(fakeCardWallet(legacyOf().cardId).balanceSats).toBe(BigInt(30_000));
  });

  it('"Finish the migration": its steps at once, from the card\'s record, the card held once', async () => {
    server.balanceMsat = BigInt(30_000_000);
    await drainLegacyCard(legacyOf());
    const card = await halfWiped();
    nfc.waitForCard();
    const cardId = legacyOf().cardId;
    const { result } = await renderHook(() =>
      useCardPairing({ enabled: true, another: true, finish: cardId })
    );
    // No guide: recognized, its migration goes on from where it was left, the card asked for.
    await waitFor(() => expect(nfc.awaitingCard()).toBe(true), { timeout: 8000 });
    expect(result.current.view).toEqual({
      phase: "migrating",
      step: "card",
      migration: { cardId, amountSats: 0n, receivedSats: null, resume: true, visual: null }
    });
    nfc.holdCard(card);
    await waitFor(() => expect(result.current.view.phase).toBe("paired"), { timeout: 8000 });
    expect(result.current.view).toMatchObject({
      phase: "paired",
      card: { cardId, status: "active" },
      migrated: { cardId, resume: true }
    });
    expect(card.keyVersions).toEqual([1, 1, 1, 1, 1]);
    expect(nfc.calls.filter((call) => call.startsWith("requestTechnology"))).toHaveLength(1);
    expect(server.submitted).toHaveLength(1);
  });

  it('"Finish the migration" of a card whose transfer failed: its balance read, then migrated', async () => {
    server.unreachable = true;
    expect(await reason(drainLegacyCard(legacyOf()))).toBe("migrationDrainFailed");
    server.unreachable = false;
    server.balanceMsat = BigInt(50_000_000);
    const card = v2Card();
    nfc.holdCard(card);
    const cardId = legacyOf().cardId;
    const { result } = await renderHook(() =>
      useCardPairing({ enabled: true, another: true, finish: cardId })
    );
    // Not erased: what it holds on the v2 server, asked of the holder as for any v2 card.
    await waitFor(
      () =>
        expect(result.current.view).toMatchObject({ phase: "legacy", amountSats: BigInt(50_000) }),
      { timeout: 8000 }
    );
    expect(card.keyVersions).toEqual([1, 1, 1, 0, 0]);
    await act(async () => result.current.confirmMigration());
    await waitFor(() => expect(result.current.view.phase).toBe("paired"), { timeout: 8000 });
    expect(result.current.view).toMatchObject({
      migrated: { cardId, amountSats: BigInt(50_000), receivedSats: BigInt(50_000), resume: false }
    });
    expect(card.keyVersions).toEqual([1, 1, 1, 1, 1]);
    expect(fakeCardWallet(cardId).balanceSats).toBe(BigInt(50_000));
    expect(server.balanceMsat).toBe(BigInt(0));
  });

  it('"Finish the migration" of a card finished on another device meanwhile: migrated', async () => {
    // The migration finished elsewhere: its record active.
    await drainLegacyCard(legacyOf());
    const elsewhere = await halfWiped();
    nfc.holdCard(elsewhere);
    await finishLegacyMigration(legacyOf().cardId, OPTIONS);
    anotherDevice();
    nfc.resetNfcManager();

    const cardId = legacyOf().cardId;
    const { result } = await renderHook(() =>
      useCardPairing({ enabled: true, another: true, finish: cardId })
    );
    await waitFor(() => expect(result.current.view.phase).toBe("paired"), { timeout: 8000 });
    expect(result.current.view).toMatchObject({
      phase: "paired",
      card: { cardId, status: "active" },
      activation: null,
      migrated: { cardId, resume: true }
    });
    expect(nfc.calls.filter((call) => call.startsWith("requestTechnology"))).toHaveLength(0);
  });

  it("finishes a migration whose transfer was done, without transferring again", async () => {
    // A first attempt drained the card, then the holder left before its re-encoding.
    server.balanceMsat = BigInt(30_000_000);
    await drainLegacyCard(legacyOf());
    const card = v2Card();
    nfc.holdCard(card);
    const { result } = await renderHook(() => useCardPairing({ enabled: true, another: true }));
    await act(async () => result.current.start());
    // Nothing left on the card: re-encoded at once, without asking.
    await waitFor(() => expect(result.current.view.phase).toBe("paired"), { timeout: 8000 });
    expect(server.submitted).toHaveLength(1);
    expect(card.keyVersions).toEqual([1, 1, 1, 1, 1]);
    expect(fakeCardWallet(legacyOf().cardId).balanceSats).toBe(BigInt(30_000));
  });
});

// Node's types are not loaded: only what the sources' check needs.
declare const __dirname: string;
/** The app's sources (src/). */
const SOURCES = `${__dirname}/..`;

describe("the v2 server holds the v2 keys, the app none", () => {
  it("reads no v2 key anywhere: no EXPO_PUBLIC_LEGACY_CARD_* variable is left in the app", () => {
    // Node's types are not loaded (tsconfig `types` only lists jest): only what this test needs.
    const fs = jest.requireActual<{
      readFileSync(file: string, encoding: "utf8"): string;
      readdirSync(dir: string): string[];
      statSync(path: string): { isDirectory(): boolean };
    }>("fs");
    const { join } = jest.requireActual<{ join(...segments: string[]): string }>("path");
    const root = join(SOURCES, "..");
    const found: string[] = [];
    const walk = (dir: string) => {
      for (const name of fs.readdirSync(dir)) {
        const path = join(dir, name);
        if (fs.statSync(path).isDirectory()) {
          if (name !== "__tests__") walk(path);
        } else if (
          /\.(ts|tsx)$/.test(name) &&
          fs.readFileSync(path, "utf8").includes("LEGACY_CARD_M")
        ) {
          found.push(path);
        }
      }
    };
    walk(SOURCES);
    for (const file of ["app.config.ts", ".env.example"]) {
      if (fs.readFileSync(join(root, file), "utf8").includes("EXPO_PUBLIC_LEGACY_CARD")) {
        found.push(file);
      }
    }
    expect(found).toEqual([]);
  });

  it("recognizes a card through the server: its tap first, then its master key, nothing changed", async () => {
    const card = v2Card();
    const legacy = await detectLegacyCard(new Ntag424(card.transceive), root);
    expect(legacy).toMatchObject({ uid: UID, closed: false });
    expect(server.resetCalls.map((call) => call.step)).toEqual([
      "start",
      "challenge",
      "open",
      "finish"
    ]);
    // The tap read from the card, then nothing but bytes relayed; no UID claimed by the app.
    expect(server.resetCalls[0].body).toEqual({ p: legacy!.p, c: legacy!.c });
    expect(server.resetCalls[3].body.action).toBe("identify");
    expect(card.keyVersions).toEqual([1, 1, 1, 0, 0]);
    expect(card.failedAuthentications).toBe(0);
    expect(server.closed.size).toBe(0);
  });

  it('does not offer a card the server does not know (no v2 card bears it): "not blank"', async () => {
    server.unknown.add(UID.toUpperCase());
    nfc.holdCard(v2Card());
    expect(await reason(pairCard({ ...OPTIONS, relayHost: DEFAULT_CARD_RELAY_HOST }))).toBe(
      "notBlank"
    );
    // Refused at the tap: no key tried on the card.
    expect(server.resetCalls.map((call) => call.step)).toEqual(["start"]);
  });

  it("says a locked or banned v2 card does not migrate, before anything moves", async () => {
    server.disabled.add(UID.toUpperCase());
    server.balanceMsat = BigInt(40_000_000);
    const card = v2Card();
    nfc.holdCard(card);
    expect(await reason(pairCard({ ...OPTIONS, relayHost: DEFAULT_CARD_RELAY_HOST }))).toBe(
      "migrationCardDisabled"
    );
    expect(server.calls).toEqual([]);
    expect(card.keyVersions).toEqual([1, 1, 1, 0, 0]);
  });

  it("says the server did not answer, the card untouched, when it is unreachable", async () => {
    server.resetDown = true;
    const card = v2Card();
    nfc.holdCard(card);
    expect(await reason(pairCard({ ...OPTIONS, relayHost: DEFAULT_CARD_RELAY_HOST }))).toBe(
      "migrationServerUnreachable"
    );
    expect(card.keyVersions).toEqual([1, 1, 1, 0, 0]);
  });

  it("erases only the card it expects: the server is told its UID, and refuses another card's tap", async () => {
    const card = v2Card();
    await wipeLegacyCard(new Ntag424(card.transceive), UID);
    expect(server.resetCalls[0].body).toMatchObject({ uid: UID });
    expect(server.resetCalls[3].body.action).toBe("wipe");
    expect(server.closed.has(UID.toUpperCase())).toBe(true);

    const other = v2Card("04112233445566");
    const error = await wipeLegacyCard(new Ntag424(other.transceive), UID).then(
      () => null,
      (e: unknown) => e
    );
    expect(error).toMatchObject({ code: "otherCard" });
    // Refused at its tap: not closed, no key tried.
    expect(server.closed.has("04112233445566")).toBe(false);
    expect(other.failedAuthentications).toBe(0);
    expect(other.keyVersions).toEqual([1, 1, 1, 0, 0]);
  });

  it("is not erased while its v2 balance is not empty (a recharge after the transfer): to transfer again", async () => {
    // Recharged between the transfer and the erase: the server refuses to close it.
    server.balanceMsat = BigInt(5_000_000);
    const card = v2Card();
    nfc.holdCard(card);
    expect(await reason(reprogramLegacyCard(legacyOf(), OPTIONS))).toBe("migrationDrainFailed");
    expect(card.keyVersions).toEqual([1, 1, 1, 0, 0]);
    expect(server.closed.size).toBe(0);
  });

  it("says the server failed, never that nothing changed, when the wipe fails after closing the v2 card", async () => {
    // The server closed the v2 card, then could not finish (a top-up it could not cancel): its
    // answer is a failure, the card closed all the same. The message must hold in that case too.
    server.wipeFailsAfterClose = true;
    const card = v2Card();
    nfc.holdCard(card);
    expect(await reason(reprogramLegacyCard(legacyOf(), OPTIONS))).toBe(
      "migrationServerUnreachable"
    );
    expect(server.closed.has(UID.toUpperCase())).toBe(true);
    expect(card.keyVersions).toEqual([1, 1, 1, 0, 0]);
    expect(i18n.getFixedT("en")("card.failure.migrationServerUnreachable")).not.toMatch(
      /changed|Nothing was/
    );

    // Tried again once the server answers: the migration goes on where it stopped.
    server.wipeFailsAfterClose = false;
    nfc.holdCard(card);
    const paired = await finishLegacyMigration(legacyOf().cardId, OPTIONS);
    expect(paired.state).toMatchObject({ status: "active", uid: UID });
    expect(card.keyVersions).toEqual([1, 1, 1, 1, 1]);
  });

  it("sends nothing to the card when the server's commands do not blank its keys in order", async () => {
    // K2 left out: the card would keep a v2 key, K0 blank, and refuse the blank master key.
    server.wipeKeys = [1, 0];
    const card = v2Card();
    nfc.holdCard(card);
    expect(await reason(reprogramLegacyCard(legacyOf(), OPTIONS))).toBe(
      "migrationServerUnreachable"
    );
    expect(card.keyVersions).toEqual([1, 1, 1, 0, 0]);
    expect(card.failedAuthentications).toBe(0);

    // The server's answer right again: the migration goes on, the card closed already.
    server.wipeKeys = null;
    nfc.holdCard(card);
    const paired = await finishLegacyMigration(legacyOf().cardId, OPTIONS);
    expect(paired.state).toMatchObject({ status: "active", uid: UID });
    expect(card.keyVersions).toEqual([1, 1, 1, 1, 1]);
  });

  it('says a payment is still in flight, never "not transferred", when the server will not close it yet', async () => {
    // The transfer done, the v2 server still settling its withdrawal: it will not close the card.
    server.balanceMsat = BigInt(40_000_000);
    await drainLegacyCard(legacyOf());
    server.paymentInFlight = true;
    const card = v2Card();
    nfc.holdCard(card);
    expect(await reason(reprogramLegacyCard(legacyOf(), OPTIONS))).toBe("migrationPaymentPending");
    expect(server.closed.size).toBe(0);
    expect(card.keyVersions).toEqual([1, 1, 1, 0, 0]);

    // Settled on the server's side: tried again, the card is erased and re-encoded, nothing
    // transferred twice.
    server.paymentInFlight = false;
    const calls = server.calls.length;
    nfc.holdCard(card);
    const paired = await reprogramLegacyCard(legacyOf(), OPTIONS);
    expect(paired.state).toMatchObject({ status: "active", uid: UID });
    expect(card.keyVersions).toEqual([1, 1, 1, 1, 1]);
    expect(server.calls.slice(calls).filter((call) => call.leg === 2)).toEqual([]);
  });

  it("transfers nothing from a card already closed for its migration, and erases it", async () => {
    // Its erase began elsewhere, then stopped before any key changed: closed, its keys intact.
    server.closed.add(UID.toUpperCase());
    const card = v2Card();
    const legacy = await detectLegacyCard(new Ntag424(card.transceive), root);
    expect(legacy).toMatchObject({ uid: UID, closed: true });
    expect(await readLegacyBalance(legacy!)).toEqual({
      sats: BigInt(0),
      drain: false,
      visual: null,
      number: null
    });
    // A closed card answers no withdrawal: not even asked.
    expect(server.calls).toEqual([]);
    nfc.holdCard(card);
    const paired = await reprogramLegacyCard(legacy!, OPTIONS);
    expect(paired.state).toMatchObject({ status: "active", uid: UID });
    expect(card.keyVersions).toEqual([1, 1, 1, 1, 1]);
  });

  it("finishes the migration of a card closed but not erased, without transferring again", async () => {
    server.balanceMsat = BigInt(40_000_000);
    await drainLegacyCard(legacyOf());
    // The erase closed the v2 card, then the card left before any key changed.
    server.closed.add(UID.toUpperCase());
    anotherDevice();
    const card = v2Card();
    nfc.holdCard(card);
    const paired = await finishLegacyMigration(legacyOf().cardId, OPTIONS);
    expect(paired.state).toMatchObject({ status: "active", uid: UID });
    expect(card.keyVersions).toEqual([1, 1, 1, 1, 1]);
  });
});
