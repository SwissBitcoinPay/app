import { DEFAULT_RELAYS } from "@/config/relays";
import {
  CARD_PUSH_TOKEN_TIMEOUT_MS,
  DEFAULT_CARD_DAY_SATS,
  DEFAULT_CARD_PAYMENTS_PER_HOUR,
  DEFAULT_CARD_PAYMENT_SATS,
  DEFAULT_CARD_RELAY_HOST
} from "@/config/card";
import { closeAccount } from "@/features/account/session";
import {
  PairingError,
  keptSettings,
  walletGenerationAfter,
  keyVersionFor,
  pairCard,
  type PairingStep
} from "@/features/card/pairing";
import { cardPushToken, type PushToken } from "@/features/card/push";
import * as statesModule from "@/features/card/states";
import { syncCardChannel } from "@/features/card/relay-sync";
import {
  knownCardStates,
  recordCardState,
  refreshCardStates,
  resetCardStates,
  withCardAccess
} from "@/features/card/states";
import { lastChannelSyncs, syncAccountCards } from "@/features/card/sync";
import {
  cardRecordAddress,
  cardStateEvent,
  deriveCardRecordKeys,
  type CardState
} from "@/lib/card/card-record";
import { loadStoredCardStates, saveStoredCardStates } from "@/lib/card/card-store";
import { loadPushMarks } from "@/lib/card/push-marks";
import { readLog } from "@/lib/log/log";
import { publishToRelays } from "@/lib/nostr/pool";
import { sealRecord } from "@/lib/nostr/record";
import { currentRelays } from "@/lib/relays/current";
import { forgetDeviceKey, loadDeviceKey } from "@/lib/card/device-key";
import { cardIdOf, cardKeysOf, channelSecretOf } from "@/lib/card/keys";
import { Ntag424 } from "@/lib/card/ntag424";
import { derivePayeeRecordKeys } from "@/lib/card/payee-records";
import { bookOf } from "@/lib/card/payee-book";
import { CARD_PAYEES_DIR_NAME, approveCardPayee, loadPayeeBooks } from "@/lib/card/payees";
import { programCard, resetCard } from "@/lib/card/program";
import { checkCardTap } from "@/lib/card/tap";
import { fetchPendingPackets } from "@/lib/card/relay-client";
import { openWakePacket } from "@/lib/card/wake-packet";

import { TEST_WALLET_ID, openTestAccount } from "../../jest/account";
import { addRelay, posTap, type FakeCardRelay } from "../../jest/card-relay";
import type * as FileSystemFake from "../../jest/expo-file-system";
import type * as NotificationsFake from "../../jest/expo-notifications";
import type * as NfcFake from "../../jest/nfc-manager";
import type * as RelaysFake from "../../jest/nostr-relays";
import { FakeNtag424 } from "../../jest/ntag424";

// eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories are synchronous
jest.mock("react-native-nfc-manager", () => require("../../jest/nfc-manager"));
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { extra: { eas: { projectId: "00000000-0000-4000-8000-000000000000" } } } }
}));

const nfc = jest.requireMock<typeof NfcFake>("react-native-nfc-manager");
const notifications = jest.requireMock<typeof NotificationsFake>("expo-notifications");
const nostr = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");
const fileSystem = jest.requireMock<typeof FileSystemFake>("expo-file-system");

const HOST = DEFAULT_CARD_RELAY_HOST;
const OPTIONS = {
  relayHost: HOST,
  channelName: "Card payments",
  messages: { alert: "Hold the card to the phone" }
};

/** The push token of the fake expo-notifications. */
const TOKEN = "ExponentPushToken[fake-token-0000000000]";

/** Whether the channel's hashes carry a sealed token: "sealed", "none", or both. */
function sealedTokens(channel: NonNullable<ReturnType<FakeCardRelay["channelOf"]>>): Set<string> {
  return new Set([...channel.hashes.values()].map(({ t }) => (t === null ? "none" : "sealed")));
}

let relay: FakeCardRelay;

beforeEach(async () => {
  nostr.resetRelays();
  nfc.resetNfcManager();
  resetCardStates();
  forgetDeviceKey();
  relay = addRelay(HOST);
  await openTestAccount({ usage: "card", signUp: "card" });
});

afterEach(() => closeAccount());

/** The reason a pairing failed for. */
async function failure(promise: Promise<unknown>): Promise<string> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e
  );
  expect(error).toBeInstanceOf(PairingError);
  return (error as PairingError).reason;
}

function untouched(card: FakeNtag424) {
  expect(card.received).toHaveLength(0);
  expect(card.keyVersions).toEqual([0, 0, 0, 0, 0]);
}

describe("pairing a blank card", () => {
  it("programs it, records it on the relays, and prepares its channel", async () => {
    const card = new FakeNtag424();
    nfc.holdCard(card);
    const steps: PairingStep[] = [];

    const paired = await pairCard({ ...OPTIONS, onStep: (step) => steps.push(step) });

    expect(steps).toEqual(["notifications", "relay", "card", "programming", "activating"]);
    const cardId = await withCardAccess(async ({ root }) => cardIdOf(root, card.uid));
    expect(paired.state).toMatchObject({
      cardId,
      uid: "04996c6a926980",
      keyVersion: 1,
      status: "active",
      relayHost: HOST,
      lastCounter: 1,
      depositedThrough: 1001,
      maxPaymentSats: 20_000n,
      maxDaySats: 50_000n,
      maxPaymentsPerHour: 5,
      suspended: false
    });
    expect(paired.activation).toEqual({ status: "ready", pending: 1000 });
    expect(card.keyVersions).toEqual([1, 1, 1, 1, 1]);
    // The relay has this phone's key, and the hashes of the card's next 1 000 taps, each with the
    // push token sealed for that tap: never the token in clear.
    const device = await loadDeviceKey();
    const secret = await withCardAccess(async ({ root }) => channelSecretOf(root, cardId, HOST));
    const channel = relay.channelOf(secret)!;
    expect(channel.pubkey).toBe(device.publicKey);
    expect(channel.hashes.size).toBe(1000);
    expect(JSON.stringify(relay.requests)).not.toContain("ExponentPushToken");
    expect(sealedTokens(channel)).toEqual(new Set(["sealed"]));
    // The next tap opens its token, and only its own.
    await posTap(card.tap());
    expect(relay.pushes.at(-1)?.to).toBe(TOKEN);
    // The Android channel of card payments, and the permission asked once.
    expect(notifications.notifications.requests).toBe(1);

    // Kept on the device and on the relays: another phone of the wallet finds it.
    expect((await loadStoredCardStates())?.walletId).toBe(TEST_WALLET_ID);
    resetCardStates();
    const read = await withCardAccess(refreshCardStates);
    expect(read).toEqual({ states: [paired.state], order: null, conclusive: true });
    // Never the UID in clear on a relay.
    const published = [...nostr.stored.values()].flat();
    expect(published.length).toBeGreaterThan(0);
    expect(JSON.stringify(published)).not.toContain("04996c6a926980");

    // A point of sale reading the card wakes this phone with a tap that verifies.
    const answer = await posTap(card.tap());
    expect(answer.status).toBe(200);
    const [packet] = await fetchPendingPackets(HOST, secret);
    const wake = openWakePacket(device.secretKey, packet)!;
    const check = await withCardAccess(async ({ root }) =>
      checkCardTap({ root, cardId, version: 1, lastCounter: 1 }, wake.p, wake.c)
    );
    expect(check).toMatchObject({ ok: true, counter: 2 });
  });

  it("checks notifications, the relay and the records before touching any card", async () => {
    const card = new FakeNtag424();
    nfc.holdCard(card);

    notifications.answerPermission("denied");
    expect(await failure(pairCard(OPTIONS))).toBe("notificationsDenied");
    untouched(card);
    notifications.resetNotifications();

    relay.unreachable = true;
    expect(await failure(pairCard(OPTIONS))).toBe("relayUnreachable");
    relay.unreachable = false;
    relay.protocol = 1;
    expect(await failure(pairCard(OPTIONS))).toBe("relayIncompatible");
    relay.protocol = 2;

    expect(await failure(pairCard({ ...OPTIONS, relayHost: `${"a".repeat(50)}.example` }))).toBe(
      "relayUnreachable"
    );

    // Fewer than a majority of the account's relays answer: the card's keys cannot be chosen.
    for (const url of DEFAULT_RELAYS.slice(0, 3)) nostr.unreachable.add(url);
    expect(await failure(pairCard(OPTIONS))).toBe("recordsUnreachable");
    untouched(card);
    nostr.unreachable.clear();

    await expect(pairCard(OPTIONS)).resolves.toMatchObject({ activation: { status: "ready" } });
  });

  it("opens no session once its holder left, even as the phone was about to wait for the card", async () => {
    const card = new FakeNtag424();
    nfc.holdCard(card);
    // Left right after the checks: past the pairing's own check, before the session opens.
    let left = false;
    await expect(
      pairCard({
        ...OPTIONS,
        onStep: (step) => {
          if (step === "card") left = true;
        },
        stopped: () => left
      })
    ).rejects.toMatchObject({ reason: "cancelled" });
    expect(nfc.calls.filter((call) => call.startsWith("requestTechnology"))).toHaveLength(0);
    untouched(card);
  });

  it("refuses a relay whose address does not fit in a card", async () => {
    const card = new FakeNtag424();
    nfc.holdCard(card);
    const host = `${"a".repeat(50)}.example`;
    addRelay(host);
    expect(await failure(pairCard({ ...OPTIONS, relayHost: host }))).toBe("relayTooLong");
    expect(card.keyVersions).toEqual([0, 0, 0, 0, 0]);
  });

  it("goes on after the card left the field, without a wrong key ever tried", async () => {
    const card = new FakeNtag424();
    nfc.holdCard(card);
    card.interruptAt(12);
    expect(await failure(pairCard(OPTIONS))).toBe("cardLost");

    const paired = await pairCard(OPTIONS);
    expect(paired.state.keyVersion).toBe(1);
    expect(card.failedAuthentications).toBe(0);
  });

  // One command in four each, the card gone before or after handling it (Random ID on halfway).
  it.each([0, 1, 2, 3])(
    "goes on with a first pairing however it was interrupted (from command %i, one in four)",
    async (first) => {
      const probe = new FakeNtag424("04a2ffffffffff");
      nfc.holdCard(probe);
      await pairCard(OPTIONS);
      const count = probe.received.length;
      expect(count).toBeGreaterThan(20);
      for (let at = first; at < count; at += 4) {
        const card = new FakeNtag424(`04a2${at.toString(16).padStart(10, "0")}`);
        nfc.holdCard(card);
        card.interruptAt(at, (at >> 2) % 2 === 1);
        expect(await failure(pairCard(OPTIONS))).toBe("cardLost");

        const { state } = await pairCard(OPTIONS);
        expect(state).toMatchObject({ status: "active", relayHost: HOST, keyVersion: 1 });
        expect(card.randomId).toBe(true);
        expect(card.failedAuthentications).toBe(0);
        expect((await posTap(card.tap())).status).toBe(200);
      }
    }
  );

  it("refuses another issuer's card, and recognizes this wallet's own as paired", async () => {
    const foreign = new FakeNtag424();
    foreign.keyVersions[1] = 7;
    nfc.holdCard(foreign);
    expect(await failure(pairCard(OPTIONS))).toBe("notBlank");
    expect(foreign.failedAuthentications).toBe(0);

    const mine = new FakeNtag424("04a39493cc8680");
    nfc.holdCard(mine);
    await pairCard(OPTIONS);
    // Its state lost on this phone and the relays, then read again: the card at version 1 is
    // recognized, and given back as paired rather than programmed again.
    const again = await pairCard(OPTIONS);
    expect(again.state.keyVersion).toBe(1);
    expect(mine.keyVersions).toEqual([1, 1, 1, 1, 1]);
  });

  it("programs a card reset with this wallet at the next version, its old taps never good again", async () => {
    const card = new FakeNtag424();
    nfc.holdCard(card);
    const first = await pairCard(OPTIONS);
    const oldTap = card.tap();
    // Random ID on: the phone no longer reads its UID at anticollision, it finds the card all the
    // same once blank (its blank key 0 tells the UID).
    card.powerCycle();
    expect(card.anticollisionUid()).toHaveLength(4);
    // Reset, its state recorded as such.
    await withCardAccess(async (access) => {
      await resetCard(new Ntag424(card.transceive), {
        root: access.root,
        cardId: first.state.cardId,
        version: 1
      });
      const { updatedAt: _u, ...rest } = first.state;
      await recordCardState(access, { ...rest, status: "reset" });
    });

    const second = await pairCard(OPTIONS);
    expect(second.state).toMatchObject({ keyVersion: 2, status: "active", lastCounter: 1 });
    expect(card.keyVersions).toEqual([2, 2, 2, 2, 2]);
    // The channel was made anew: only the new keys' hashes wait there.
    expect(second.activation).toEqual({ status: "ready", pending: 1000 });
    // A tap read before the reset is refused by the relay (its hash went with the old channel).
    expect((await posTap(oldTap)).status).toBe(404);
  });

  it("keeps its holder's settings over a reset, and none of a card deleted", async () => {
    const card = new FakeNtag424();
    nfc.holdCard(card);
    const first = await pairCard(OPTIONS);
    const settings = {
      name: "Everyday",
      maxPaymentSats: 5_000n,
      maxDaySats: 20_000n,
      maxPaymentsPerHour: 3,
      look: { kind: "color", color: "plum" } as const
    };
    /** The card reset in hand, its record `status` with the settings above. */
    async function resetAs(status: "reset" | "deleted", version: number) {
      await withCardAccess(async (access) => {
        await resetCard(new Ntag424(card.transceive), {
          root: access.root,
          cardId: first.state.cardId,
          version
        });
        const known = knownCardStates(TEST_WALLET_ID).find((s) => s.cardId === first.state.cardId)!;
        const { updatedAt: _u, ...rest } = known;
        await recordCardState(access, {
          ...rest,
          ...settings,
          status,
          settingsAt: rest.settingsAt + 1
        });
      });
    }

    await resetAs("reset", 1);
    const again = await pairCard(OPTIONS);
    expect(again.state).toMatchObject({ keyVersion: 2, status: "active", ...settings });

    // Deleted without the card, which was found again and reset: a new card, its data erased.
    await resetAs("deleted", 2);
    const anew = await pairCard(OPTIONS);
    expect(anew.state).toMatchObject({
      keyVersion: 3,
      status: "active",
      name: "",
      maxPaymentSats: DEFAULT_CARD_PAYMENT_SATS,
      maxDaySats: DEFAULT_CARD_DAY_SATS,
      maxPaymentsPerHour: DEFAULT_CARD_PAYMENTS_PER_HOUR,
      look: null,
      issuer: null
    });
    // On every device of the account.
    resetCardStates();
    const { states } = await withCardAccess(refreshCardStates);
    expect(states.find((s) => s.cardId === first.state.cardId)).toMatchObject({
      keyVersion: 3,
      name: "",
      look: null
    });
  });

  it("pairs the card even when its relay drops after programming, the activation pending", async () => {
    const card = new FakeNtag424();
    nfc.holdCard(card);
    // The relay answers its info, then nothing of the channel.
    const original = relay.handle.bind(relay);
    relay.handle = async (url, init) => {
      if (url.pathname.startsWith("/v1/channel")) throw new TypeError("Network request failed");
      return original(url, init);
    };
    const paired = await pairCard(OPTIONS);
    expect(paired.activation).toEqual({ status: "unreachable" });
    expect(paired.state.status).toBe("active");
    expect(card.keyVersions).toEqual([1, 1, 1, 1, 1]);

    // At the next app start, the relay back: the channel is made.
    relay.handle = original;
    const results = await syncAccountCards("Card payments");
    expect(results.get(paired.state.cardId)).toEqual({ status: "ready", pending: 1000 });
    // Kept with the programming it checked: "Cards" shows nothing of it once the card moves.
    expect(lastChannelSyncs().get(paired.state.cardId)).toEqual({
      relayHost: HOST,
      keyVersion: 1,
      result: { status: "ready", pending: 1000 }
    });
  });

  it("needs an open account, and NFC", async () => {
    closeAccount();
    nfc.holdCard(new FakeNtag424());
    expect(await failure(pairCard(OPTIONS))).toBe("noAccount");
  });
});

describe("this wallet's card that no record names", () => {
  /** The account's records of its cards lost: on every relay, and on this phone. */
  async function loseRecords() {
    nostr.resetRelays();
    await saveStoredCardStates({ walletId: TEST_WALLET_ID, states: [], unpublished: [] });
    resetCardStates();
  }

  /** A card paired, then programmed again at version 2 (on `relayHost`), its records lost. */
  async function lostCard(card: FakeNtag424, relayHost = HOST) {
    nfc.holdCard(card);
    const first = await pairCard(OPTIONS);
    card.powerCycle();
    await withCardAccess(async ({ root }) => {
      const ntag = new Ntag424(card.transceive);
      await resetCard(ntag, { root, cardId: first.state.cardId, version: 1 });
      await programCard(ntag, { root, relayHost, version: 2 });
    });
    await loseRecords();
    return first.state.cardId;
  }

  it('is taken back at the next version, never left "already in Cards" that Cards does not show', async () => {
    const card = new FakeNtag424();
    const cardId = await lostCard(card);
    expect(knownCardStates(TEST_WALLET_ID)).toEqual([]);

    const { state } = await pairCard(OPTIONS);
    expect(state).toMatchObject({ cardId, status: "active", keyVersion: 3, relayHost: HOST });
    expect(card.keyVersions).toEqual([3, 3, 3, 3, 3]);
    expect(card.failedAuthentications).toBe(0);
    expect((await posTap(card.tap())).status).toBe(200);
  });

  it("is taken back from another relay than the pairing's, never left as not blank", async () => {
    const card = new FakeNtag424();
    const cardId = await lostCard(card, "relay.example.org");

    const { state } = await pairCard(OPTIONS);
    expect(state).toMatchObject({ cardId, status: "active", keyVersion: 3, relayHost: HOST });
    expect(card.failedAuthentications).toBe(0);
    expect((await posTap(card.tap())).status).toBe(200);
  });

  /** The commands that changed the card from APDU `from` on. */
  function writesSince(card: FakeNtag424, from: number) {
    return card.received.slice(from).filter((apdu) => [0x8d, 0x5f, 0xc4, 0x5c].includes(apdu[1]));
  }

  /** A newer app's record of the card on the account's relays. */
  async function publishNewer(cardId: string) {
    const keys = await withCardAccess(async ({ root }) => deriveCardRecordKeys(root));
    await publishToRelays(
      sealRecord({
        type: "card-state",
        value: { version: 99, cardId },
        signer: keys.nostr.secretKey,
        encryptionKey: keys.encryptionKey,
        address: cardRecordAddress(keys, cardId),
        createdAt: Math.floor(Date.now() / 1000),
        block: 512
      }),
      {
        relays: currentRelays(),
        channel: "account",
        timeoutMs: 1000,
        authKey: keys.nostr.secretKey
      }
    );
  }

  it("is left as it is when a newer app wrote its record", async () => {
    const card = new FakeNtag424();
    const cardId = await lostCard(card);
    await publishNewer(cardId);
    const sent = card.received.length;

    expect(await failure(pairCard(OPTIONS))).toBe("newerApp");
    // Read only: nothing written to it.
    expect(writesSince(card, sent)).toEqual([]);
    expect(card.keyVersions).toEqual([2, 2, 2, 2, 2]);
  });

  it("is left as it is when a newer app's record shows only as its own record is written", async () => {
    const card = new FakeNtag424();
    const cardId = await lostCard(card);
    // Written by a newer app once the pairing read the records, before it writes the card's.
    const refresh = statesModule.refreshCardStates;
    jest.spyOn(statesModule, "refreshCardStates").mockImplementationOnce(async (...args) => {
      const read = await refresh(...args);
      await publishNewer(cardId);
      return read;
    });
    const sent = card.received.length;

    expect(await failure(pairCard(OPTIONS))).toBe("newerApp");
    expect(writesSince(card, sent)).toEqual([]);
    expect(card.keyVersions).toEqual([2, 2, 2, 2, 2]);
  });

  it("is left as it is while no majority of the relays takes its record", async () => {
    const card = new FakeNtag424();
    await lostCard(card);
    for (const url of currentRelays().slice(0, 3)) nostr.readOnly.add(url);
    const sent = card.received.length;

    expect(await failure(pairCard(OPTIONS))).toBe("recordsUnreachable");
    expect(writesSince(card, sent)).toEqual([]);
    expect(card.keyVersions).toEqual([2, 2, 2, 2, 2]);

    // The relays take it again: taken back.
    nostr.readOnly.clear();
    const { state } = await pairCard(OPTIONS);
    expect(state).toMatchObject({ status: "active", keyVersion: 3 });
    expect(card.failedAuthentications).toBe(0);
  });

  /** The APDUs of a whole taking back. */
  async function takingBackLength() {
    const probe = new FakeNtag424();
    await lostCard(probe);
    const from = probe.received.length;
    await pairCard(OPTIONS);
    return probe.received.length - from;
  }

  // One command in four each, the card gone before or after handling it.
  it.each([0, 1, 2, 3])(
    "is taken back however its taking back was interrupted (from command %i, one in four)",
    async (first) => {
      const count = await takingBackLength();
      expect(count).toBeGreaterThan(20);
      for (let at = first; at < count; at += 4) {
        // A card of its own each time: nothing of the one before mixes in.
        const card = new FakeNtag424(`04a3${at.toString(16).padStart(10, "0")}`);
        await lostCard(card);
        card.interruptAt(at, (at >> 2) % 2 === 1);
        expect(await failure(pairCard(OPTIONS))).toBe("cardLost");

        const { state } = await pairCard(OPTIONS);
        expect(state).toMatchObject({ status: "active", relayHost: HOST });
        expect(state.keyVersion).toBeGreaterThanOrEqual(3);
        expect(card.failedAuthentications).toBe(0);
        expect((await posTap(card.tap())).status).toBe(200);
      }
    }
  );
});

describe("the channel at each app start", () => {
  it("deposits hashes again once fewer than 500 wait, from the last one deposited", async () => {
    const card = new FakeNtag424();
    nfc.holdCard(card);
    const paired = await pairCard(OPTIONS);
    // 600 taps read by points of sale, which the phone did not see.
    for (let i = 0; i < 600; i++) await posTap(card.tap());
    const results = await syncAccountCards("Card payments");
    expect(results.get(paired.state.cardId)).toEqual({ status: "ready", pending: 1000 });
    const [state] = knownCardStates(TEST_WALLET_ID);
    expect(state.depositedThrough).toBe(1601);
    expect((await posTap(card.tap())).status).toBe(200);
  });

  it("makes the channel again when the relay lost it, from the last tap seen", async () => {
    const card = new FakeNtag424();
    nfc.holdCard(card);
    const paired = await pairCard(OPTIONS);
    relay.channels.clear();
    const results = await syncAccountCards("Card payments");
    expect(results.get(paired.state.cardId)).toEqual({ status: "ready", pending: 1000 });
    expect((await posTap(card.tap())).status).toBe(200);
  });

  it("refills without a push token, but never claims the channel is ready", async () => {
    const card = new FakeNtag424();
    nfc.holdCard(card);
    const paired = await pairCard(OPTIONS);
    for (let i = 0; i < 600; i++) await posTap(card.tap());
    notifications.notifications.permission = "denied";
    const results = await syncAccountCards("Card payments");
    expect(results.get(paired.state.cardId)).toEqual({ status: "noPush", pending: 1000 });
  });

  it("tells a relay down, and keeps the card's state", async () => {
    const card = new FakeNtag424();
    nfc.holdCard(card);
    const paired = await pairCard(OPTIONS);
    relay.unreachable = true;
    await withCardAccess(async (access) => {
      const key = await loadDeviceKey();
      await expect(
        syncCardChannel(access, paired.state, {
          key,
          pushToken: "ExponentPushToken[x]"
        })
      ).resolves.toEqual({ status: "unreachable" });
    });
    expect(knownCardStates(TEST_WALLET_ID)).toEqual([paired.state]);
  });
});

describe("the approved merchants at each app start", () => {
  const LAC = { id: "sattleme01@breez.tips", name: "Lakeside Bakery" };
  const PAYEES_URI = `file:///data/user/0/ch.swissbitcoinpay.checkout.staging/files/${CARD_PAYEES_DIR_NAME}/payees.json`;

  beforeEach(() => fileSystem.resetFileSystem());

  /** How many reads of the payees' records (their author) the relays were asked. */
  async function payeeReads(): Promise<number> {
    const author = await withCardAccess(
      async ({ root }) => derivePayeeRecordKeys(root).nostr.publicKey
    );
    return nostr.calls.filter(
      (call) => call.operation === "query" && call.filter?.authors?.includes(author)
    ).length;
  }

  it("are read and published beside the channels, for an account with cards only", async () => {
    await syncAccountCards("Card payments");
    expect(await payeeReads()).toBe(0);
    nfc.holdCard(new FakeNtag424());
    const { state } = await pairCard(OPTIONS);
    await approveCardPayee(TEST_WALLET_ID, state, LAC, Date.now());
    await syncAccountCards("Card payments");
    expect(await payeeReads()).toBeGreaterThan(0);
    expect(bookOf(await loadPayeeBooks(TEST_WALLET_ID), state).unpublished).toEqual(new Set());
  });

  it("never keep the channels from syncing when they fail", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    nfc.holdCard(new FakeNtag424());
    const paired = await pairCard(OPTIONS);
    // A newer app wrote this phone's book: it is refused, the card's channel syncs all the same.
    fileSystem.files.set(PAYEES_URI, JSON.stringify({ version: 4 }));
    const results = await syncAccountCards("Card payments");
    expect(results.get(paired.state.cardId)).toEqual({ status: "ready", pending: 1000 });
    expect(warn).toHaveBeenCalledWith("Syncing the approved merchants failed", expect.anything());
    warn.mockRestore();
  });
});

describe("a card deleted elsewhere (the web app)", () => {
  /** The web app deletes the card: its record only, the card relay out of its reach. */
  async function deleteOnWeb(cardId: string) {
    const keys = await withCardAccess(async ({ root }) => deriveCardRecordKeys(root));
    const state = knownCardStates(TEST_WALLET_ID).find((card) => card.cardId === cardId)!;
    await publishToRelays(
      cardStateEvent(keys, { ...state, status: "deleted", updatedAt: state.updatedAt + 60 }),
      {
        relays: currentRelays(),
        channel: "account",
        timeoutMs: 1000,
        authKey: keys.nostr.secretKey
      }
    );
  }

  it("has its channel deleted at this phone's next sync, which made it", async () => {
    const card = new FakeNtag424();
    nfc.holdCard(card);
    const { state } = await pairCard(OPTIONS);
    const secret = await withCardAccess(async ({ root }) =>
      channelSecretOf(root, state.cardId, HOST)
    );
    expect(relay.channelOf(secret)).toBeTruthy();
    await deleteOnWeb(state.cardId);
    await syncAccountCards("Card payments");
    expect(relay.channelOf(secret)).toBeUndefined();
    expect((await loadPushMarks()).has(state.cardId)).toBe(false);
    // Its taps wake nothing any more.
    const pushes = relay.pushes.length;
    await posTap(card.tap());
    expect(relay.pushes).toHaveLength(pushes);
  });

  it("keeps trying while the card relay does not answer", async () => {
    nfc.holdCard(new FakeNtag424());
    const { state } = await pairCard(OPTIONS);
    await deleteOnWeb(state.cardId);
    relay.unreachable = true;
    await syncAccountCards("Card payments");
    expect((await loadPushMarks()).has(state.cardId)).toBe(true);
    relay.unreachable = false;
    await syncAccountCards("Card payments");
    expect((await loadPushMarks()).has(state.cardId)).toBe(false);
  });
});

describe("a phone without a push token (an iPhone whose token did not come)", () => {
  it("pairs its card all the same, paid in open-app mode, then notified once a token comes", async () => {
    const card = new FakeNtag424();
    nfc.holdCard(card);
    notifications.notifications.token = null;
    const paired = await pairCard(OPTIONS);
    expect(paired.activation).toEqual({ status: "noPush", pending: 1000 });
    const secret = await withCardAccess(async ({ root }) =>
      channelSecretOf(root, paired.state.cardId, HOST)
    );
    expect(sealedTokens(relay.channelOf(secret)!)).toEqual(new Set(["none"]));

    // A tap notifies nothing: its wake packet waits on the relay for the app, shown.
    const pushes = relay.pushes.length;
    expect((await posTap(card.tap())).status).toBe(200);
    expect(relay.pushes).toHaveLength(pushes);
    expect(await fetchPendingPackets(HOST, secret)).toHaveLength(1);

    // An app start that gets a token gives it to every hash still waiting.
    notifications.notifications.token = TOKEN;
    const results = await syncAccountCards("Card payments");
    expect(results.get(paired.state.cardId)).toMatchObject({ status: "ready" });
    expect(sealedTokens(relay.channelOf(secret)!)).toEqual(new Set(["sealed"]));
    await posTap(card.tap());
    expect(relay.pushes.at(-1)?.to).toBe(TOKEN);
  });

  it("gives up on a token that never comes after CARD_PUSH_TOKEN_TIMEOUT_MS, which is logged", async () => {
    notifications.notifications.tokenHangs = true;
    jest.useFakeTimers();
    try {
      let result: PushToken | undefined;
      void cardPushToken("Card payments", { ask: true }).then((token) => {
        result = token;
      });
      await jest.advanceTimersByTimeAsync(CARD_PUSH_TOKEN_TIMEOUT_MS - 1);
      expect(result).toBeUndefined();
      await jest.advanceTimersByTimeAsync(1);
      expect(result).toEqual({ status: "unavailable" });
    } finally {
      jest.useRealTimers();
    }
    expect(readLog().entries.map(({ event }) => event)).toContain(
      "The push token did not come in time"
    );
  });

  it("gets no token in a build without its EAS project id, which is logged", async () => {
    const { eas } = jest.requireMock<{
      default: { expoConfig: { extra: { eas: { projectId?: string } } } };
    }>("expo-constants").default.expoConfig.extra;
    const projectId = eas.projectId;
    delete eas.projectId;
    try {
      await expect(cardPushToken("Card payments", { ask: true })).resolves.toEqual({
        status: "unavailable"
      });
    } finally {
      eas.projectId = projectId;
    }
    expect(readLog().entries.map(({ event }) => event)).toContain(
      "No EAS project id for the push token"
    );
  });
});

describe("the push token sealed in the channel's hashes", () => {
  it("is sealed again into every hash still waiting when the phone's token changes", async () => {
    const card = new FakeNtag424();
    nfc.holdCard(card);
    const paired = await pairCard(OPTIONS);
    for (let i = 0; i < 3; i++) await posTap(card.tap());
    expect(relay.pushes.at(-1)?.to).toBe(TOKEN);

    notifications.notifications.token = "ExponentPushToken[new-token-1111111111]";
    const patches = () => relay.requests.filter((r) => r === "PATCH /v1/channel/hashes").length;
    await syncAccountCards("Card payments");
    // 997 hashes still waiting (the relay dropped the 3 taps): one batch.
    expect(patches()).toBe(1);
    await posTap(card.tap());
    expect(relay.pushes.at(-1)?.to).toBe("ExponentPushToken[new-token-1111111111]");

    // The same token at the next start: nothing sent again.
    await syncAccountCards("Card payments");
    expect(patches()).toBe(1);
    expect(paired.state.cardId).toBeTruthy();
  });

  it("is taken out of every hash once notifications are off: no tap is notified", async () => {
    const card = new FakeNtag424();
    nfc.holdCard(card);
    await pairCard(OPTIONS);
    notifications.notifications.permission = "denied";
    await syncAccountCards("Card payments");
    const secret = await withCardAccess(async ({ root }) =>
      channelSecretOf(root, knownCardStates(TEST_WALLET_ID)[0].cardId, HOST)
    );
    expect(sealedTokens(relay.channelOf(secret)!)).toEqual(new Set(["none"]));
    const pushes = relay.pushes.length;
    expect((await posTap(card.tap())).status).toBe(200);
    expect(relay.pushes).toHaveLength(pushes);
  });

  it("turns the notifications on again after Expo's DeviceNotRegistered, at the next new token", async () => {
    const card = new FakeNtag424();
    nfc.holdCard(card);
    await pairCard(OPTIONS);
    const secret = await withCardAccess(async ({ root }) =>
      channelSecretOf(root, knownCardStates(TEST_WALLET_ID)[0].cardId, HOST)
    );
    relay.unregisterDevice(secret);
    const pushes = relay.pushes.length;
    await posTap(card.tap());
    expect(relay.pushes).toHaveLength(pushes);
    notifications.notifications.token = "ExponentPushToken[new-token-2222222222]";
    await syncAccountCards("Card payments");
    await posTap(card.tap());
    expect(relay.pushes.at(-1)?.to).toBe("ExponentPushToken[new-token-2222222222]");
  });
});

describe("how the relay wakes this phone at a tap", () => {
  it("by an alert to the bare token, even where the relay announces other wakes", async () => {
    relay.wakes = ["alert", "data"];
    const infos = () => relay.requests.filter((r) => r === "GET /v1/info").length;
    const card = new FakeNtag424();
    nfc.holdCard(card);
    const { state } = await pairCard(OPTIONS);
    // The pairing's own check of the relay: nothing more asked of it for the push.
    expect(infos()).toBe(1);
    await syncAccountCards("Card payments");
    expect(infos()).toBe(1);
    expect((await loadPushMarks()).get(state.cardId)).toBe(TOKEN);
    // The fake relay pushes to a bare token only (jest/card-relay.ts, `openSealedToken`).
    await posTap(card.tap());
    expect(relay.pushes.at(-1)).toMatchObject({ to: TOKEN, kind: "alert" });
  });
});

describe("what a card programmed again keeps of its record", () => {
  const previous: CardState = {
    cardId: "0".repeat(32),
    uid: "04996c6a926980",
    keyVersion: 4,
    status: "reset",
    relayHost: HOST,
    lastCounter: 1,
    depositedThrough: 1,
    maxPaymentSats: 7_000n,
    maxDaySats: 21_000n,
    maxPaymentsPerHour: 4,
    suspended: true,
    name: "Everyday",
    look: { kind: "color", color: "fir" },
    issuer: {
      image: { key: "11".repeat(32), hash: "22".repeat(32) },
      number: "4821-0937-5530-1186",
      white: false
    },
    settingsAt: 1000,
    walletGeneration: 1,
    updatedAt: 1
  };

  it("is its holder's settings, its issuer's visual with them", () => {
    for (const status of ["active", "reset", "migrating"] as const) {
      expect(keptSettings({ ...previous, status })).toEqual({
        maxPaymentSats: 7_000n,
        maxDaySats: 21_000n,
        maxPaymentsPerHour: 4,
        name: "Everyday",
        look: previous.look,
        issuer: previous.issuer
      });
    }
  });

  it("is nothing of a card never seen, and of a card deleted its printed visual only", () => {
    const none = {
      maxPaymentSats: DEFAULT_CARD_PAYMENT_SATS,
      maxDaySats: DEFAULT_CARD_DAY_SATS,
      maxPaymentsPerHour: DEFAULT_CARD_PAYMENTS_PER_HOUR,
      name: "",
      look: null,
      issuer: null
    };
    expect(keptSettings(undefined)).toEqual(none);
    expect(keptSettings({ ...previous, status: "deleted" })).toEqual({
      ...none,
      issuer: previous.issuer
    });
    expect(keptSettings({ ...previous, status: "deleted", issuer: null })).toEqual(none);
  });

  it("pays from its record's wallet, a deleted card from a new one: none of its history", () => {
    expect(walletGenerationAfter(undefined)).toBe(1);
    for (const status of ["active", "reset", "migrating"] as const) {
      expect(walletGenerationAfter({ ...previous, status })).toBe(1);
      expect(walletGenerationAfter({ ...previous, status, walletGeneration: 3 })).toBe(3);
    }
    expect(walletGenerationAfter({ ...previous, status: "deleted" })).toBe(2);
    expect(walletGenerationAfter({ ...previous, status: "deleted", walletGeneration: 3 })).toBe(4);
  });
});

describe("the keys' version of a card", () => {
  const state = {
    cardId: "0".repeat(32),
    uid: "04996c6a926980",
    keyVersion: 4,
    relayHost: HOST,
    lastCounter: 1,
    depositedThrough: 1,
    maxPaymentSats: 100_000n,
    maxDaySats: 50_000n,
    maxPaymentsPerHour: 5,
    suspended: false,
    name: "",
    look: null,
    issuer: null,
    settingsAt: 1000,
    walletGeneration: 1,
    updatedAt: 1
  };

  it("is 1 for a card never seen, its own for its pairing interrupted, else the next", () => {
    expect(keyVersionFor(undefined, "blank")).toBe(1);
    expect(keyVersionFor(undefined, "tap")).toBe(1);
    expect(keyVersionFor({ ...state, status: "active" }, "tap")).toBe(4);
    // Active, but the card is blank: reset elsewhere, its record not told. Never the same keys.
    expect(keyVersionFor({ ...state, status: "active" }, "blank")).toBe(5);
    expect(keyVersionFor({ ...state, status: "reset" }, "blank")).toBe(5);
    expect(keyVersionFor({ ...state, status: "reset" }, "tap")).toBe(5);
    // Deleted without the card: its keys never serve again.
    expect(keyVersionFor({ ...state, status: "deleted" }, "tap")).toBe(5);
    expect(keyVersionFor({ ...state, status: "deleted" }, "blank")).toBe(5);
    expect(() => keyVersionFor({ ...state, keyVersion: 255, status: "reset" }, "blank")).toThrow();
  });

  it("keys a card programmed again apart from its earlier taps", async () => {
    await withCardAccess(async ({ root }) => {
      const uid = new Uint8Array([4, 0x99, 0x6c, 0x6a, 0x92, 0x69, 0x80]);
      expect(cardKeysOf(root, uid, 4).k2).not.toEqual(cardKeysOf(root, uid, 5).k2);
    });
  });
});
