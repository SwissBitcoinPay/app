import { p256 } from "@noble/curves/nist.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import * as SecureStore from "expo-secure-store";

import { DEFAULT_CARD_RELAY_HOST } from "@/config/card";
import { wipeDevice } from "@/features/settings/device-wipe";
import { bytesToBase64Url } from "@/lib/base64";
import { encodeWalletSecret } from "@/lib/breez/secret";
import { CARD_DEVICE_KEY, forgetDeviceKey, loadDeviceKey } from "@/lib/card/device-key";
import { tapEntries, tapHash } from "@/lib/card/hashes";
import { cardIdOf, cardKeysOf, channelSecretOf, deriveCardRoot } from "@/lib/card/keys";
import { Ntag424 } from "@/lib/card/ntag424";
import { programCard } from "@/lib/card/program";
import {
  RelayError,
  deleteChannel,
  fetchChannel,
  fetchPendingPackets,
  fetchRelayInfo,
  isExpoPushToken,
  patchHashes,
  postHashes,
  putChannel
} from "@/lib/card/relay-client";
import { sunMac } from "@/lib/card/sun";
import { checkCardTap } from "@/lib/card/tap";
import { openWakePacket, parseWakePacket } from "@/lib/card/wake-packet";

import {
  addRelay,
  openSealedText,
  openSealedToken,
  posTap,
  sealPacket
} from "../../jest/card-relay";
import { FakeNtag424 } from "../../jest/ntag424";

const MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const root = deriveCardRoot(encodeWalletSecret({ mnemonic: MNEMONIC }));
const HOST = DEFAULT_CARD_RELAY_HOST;
const PUSH_TOKEN = "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]";

/**
 * A wake packet made by Node's WebCrypto, as the relay makes them (sattleme/relay's `ecies`, with
 * the info string of contract v2), to the device key `d`: the app must open the relay's packets,
 * not only its own fake's.
 */
const WEBCRYPTO_VECTOR = {
  d: "c9afa9d845ba75166b5c215767b1d6934e50c3db36e89b127b8a622b120f6721",
  publicKey:
    "BGD-1LolWp0xyWHrdMY1bWjASbiSO2H6bOZpYi5g8p-2eQP-EAi4vJmkGunpVii8ZPLxsgwtfp9Rd6PClNRGIpk",
  packet: {
    epk: "BLC7GhUnfi2YOGr4PPJNd2kYFUpe3IRcuOrK1UKMSqaH056CUAh6iZB-76q0bu8P1V3Li6oQ-4dJNLDXJraWwJw",
    iv: "AAECAwQFBgcICQoL",
    ct:
      "9ghBvAT8kUlrjme2MTjZuJ4FPtMUziAHXGoiswBUyLQ5jJdV1MdfrhvhzuINMiQGeqWydzDT32phvlfHbPjkACD5RD0z" +
      "itFhsb3MsQFZaVtBvoi2UB4PGnE17G2HFnOspOX6_6YkyK8xZGMil2_iYUTb2hOWcoQQmUL2jyEJn5i96LWtisDA6aq0" +
      "2D2prZP2X0etcymbjC6SW9nMRjsElYPxtt93rujo1gS6Vjgi00mds3N-8RnWTeyX4wVL_8dc_Q"
  },
  wake: {
    p: "4E2E289D945A66BB13377A728884E867",
    c: "E19CCB1FED8892CE",
    session: "00112233445566778899aabbccddeeff",
    wsToken: "dG9rZW4tb2YtdGhlLXdlYnNvY2tldA",
    relay: "relay.sattle.me"
  }
};

describe("wake packets", () => {
  const secretKey = hexToBytes(WEBCRYPTO_VECTOR.d);

  it("opens a packet the relay's WebCrypto made", () => {
    expect(bytesToBase64Url(p256.getPublicKey(secretKey, false))).toBe(WEBCRYPTO_VECTOR.publicKey);
    const packet = parseWakePacket(WEBCRYPTO_VECTOR.packet);
    expect(packet).not.toBeNull();
    expect(openWakePacket(secretKey, packet!)).toEqual(WEBCRYPTO_VECTOR.wake);
  });

  it("opens nothing altered, nor sealed to another key", () => {
    const packet = parseWakePacket(WEBCRYPTO_VECTOR.packet)!;
    const altered = { ...packet, ct: packet.ct.slice() };
    altered.ct[5] ^= 1;
    expect(openWakePacket(secretKey, altered)).toBeNull();
    const otherIv = { ...packet, iv: new Uint8Array(12) };
    expect(openWakePacket(secretKey, otherIv)).toBeNull();
    const other = p256.utils.randomSecretKey();
    expect(openWakePacket(other, packet)).toBeNull();
  });

  it("refuses a packet out of shape", () => {
    const { epk, iv, ct } = WEBCRYPTO_VECTOR.packet;
    expect(parseWakePacket(null)).toBeNull();
    expect(parseWakePacket({ epk, iv })).toBeNull();
    expect(parseWakePacket({ epk, iv: `${iv}A`, ct })).toBeNull();
    expect(parseWakePacket({ epk: `${epk}A`, iv, ct })).toBeNull();
    // Not a point of the curve: x and y of zeros.
    expect(
      parseWakePacket({ epk: bytesToBase64Url(new Uint8Array([4, ...new Uint8Array(64)])), iv, ct })
    ).toBeNull();
    expect(parseWakePacket({ epk, iv, ct: "AAAA" })).toBeNull();
    expect(parseWakePacket({ epk, iv, ct: "A".repeat(4000) })).toBeNull();
  });

  it("refuses what a packet holds when it is out of shape", () => {
    const publicKey = WEBCRYPTO_VECTOR.publicKey;
    const seal = (value: unknown) =>
      openWakePacket(secretKey, parseWakePacket(sealPacket(publicKey, JSON.stringify(value)))!);
    const wake = WEBCRYPTO_VECTOR.wake;
    expect(seal(wake)).toEqual(wake);
    expect(seal({ ...wake, extra: 1 })).toEqual(wake);
    expect(seal({ ...wake, p: wake.p.slice(1) })).toBeNull();
    expect(seal({ ...wake, c: `${wake.c}0` })).toBeNull();
    expect(seal({ ...wake, session: wake.session.toUpperCase() })).toBeNull();
    expect(seal({ ...wake, wsToken: "short" })).toBeNull();
    expect(seal({ ...wake, wsToken: "a b".repeat(10) })).toBeNull();
    expect(seal({ ...wake, relay: "https://relay.sattle.me" })).toBeNull();
    expect(seal({ ...wake, relay: "Relay.Sattle.Me" })).toBeNull();
    expect(seal([wake])).toBeNull();
    expect(
      openWakePacket(secretKey, parseWakePacket(sealPacket(publicKey, "not json"))!)
    ).toBeNull();
  });
});

describe("the device key", () => {
  beforeEach(() => forgetDeviceKey());

  it("is made once, kept in the secure store, and the same after a restart", async () => {
    const first = await loadDeviceKey();
    expect(first.publicKey).toMatch(/^[A-Za-z0-9_-]{87}$/);
    expect(p256.utils.isValidSecretKey(first.secretKey)).toBe(true);
    const stored = await SecureStore.getItemAsync(CARD_DEVICE_KEY);
    expect(JSON.parse(stored!)).toEqual({ version: 1, secretKey: bytesToHex(first.secretKey) });

    forgetDeviceKey();
    expect(await loadDeviceKey()).toEqual(first);
  });

  it("is the same for calls at once", async () => {
    const [a, b] = await Promise.all([loadDeviceKey(), loadDeviceKey()]);
    expect(a).toBe(b);
  });

  it("is replaced when what is stored is unreadable", async () => {
    await SecureStore.setItemAsync(
      CARD_DEVICE_KEY,
      JSON.stringify({ version: 1, secretKey: "00" })
    );
    const key = await loadDeviceKey();
    expect(key.secretKey).toHaveLength(32);
    await SecureStore.setItemAsync(
      CARD_DEVICE_KEY,
      JSON.stringify({ version: 2, secretKey: bytesToHex(key.secretKey) })
    );
    forgetDeviceKey();
    expect((await loadDeviceKey()).publicKey).not.toBe(key.publicKey);
  });

  it('goes with "Log out"', async () => {
    const before = await loadDeviceKey();
    await wipeDevice();
    expect(await SecureStore.getItemAsync(CARD_DEVICE_KEY)).toBeNull();
    expect((await loadDeviceKey()).publicKey).not.toBe(before.publicKey);
  });
});

describe("the relay client (contract v2)", () => {
  const secret = channelSecretOf(root, cardIdOf(root, hexToBytes("04996c6a926980")), HOST);
  const device = { publicKey: WEBCRYPTO_VECTOR.publicKey };
  const uid = hexToBytes("04996c6a926980");
  /** The entries of taps `first`… of the test card, sealed with PUSH_TOKEN (or none). */
  const entries = (first: number, count: number, token: string | null = PUSH_TOKEN) => {
    const keys = cardKeysOf(root, uid, 1);
    return tapEntries(keys.k2, uid, first, count, token);
  };

  it("reads the relay's protocol, and refuses any other than 2", async () => {
    const relay = addRelay(HOST);
    await expect(fetchRelayInfo(HOST)).resolves.toEqual({
      protocol: 2,
      version: "test",
      // No `/v1/listen` announced (card-socket.test.ts reads one that is).
      listen: null,
      handOver: false
    });
    // Wake kinds a relay announces are read by no app of today: never in what is kept.
    relay.wakes = ["alert", "data"];
    await expect(fetchRelayInfo(HOST)).resolves.toEqual({
      protocol: 2,
      version: "test",
      listen: null,
      handOver: false
    });
    // A session handed over (relay-session.ts): only `true` is one.
    relay.handOver = true;
    expect((await fetchRelayInfo(HOST)).handOver).toBe(true);
    relay.answerNext(200, { protocol: 2, version: "x", handOver: "yes" });
    expect((await fetchRelayInfo(HOST)).handOver).toBe(false);
    relay.protocol = 1;
    await expect(fetchRelayInfo(HOST)).rejects.toMatchObject({ code: "protocol" });
    relay.protocol = "2";
    await expect(fetchRelayInfo(HOST)).rejects.toMatchObject({ code: "protocol" });
    relay.answerNext(200, { protocol: 2, version: 7 });
    await expect(fetchRelayInfo(HOST)).rejects.toMatchObject({ code: "protocol" });
  });

  it("creates the channel, then replaces its key, never sending the push token", async () => {
    const relay = addRelay(HOST);
    await expect(putChannel(HOST, secret, device)).resolves.toBe("created");
    await postHashes(HOST, secret, entries(2, 5));
    const other = { publicKey: `${WEBCRYPTO_VECTOR.publicKey.slice(0, 86)}A` };
    await expect(putChannel(HOST, secret, other)).resolves.toBe("updated");
    // Its hashes and their sealed tokens stay.
    expect(relay.channelOf(secret)).toMatchObject({ pubkey: other.publicKey });
    expect(relay.channelOf(secret)?.hashes.size).toBe(5);
    expect(JSON.stringify(relay.requests)).not.toContain("PushToken");
    // The relay keeps the secret's hash, never the secret.
    expect([...relay.channels.keys()]).toEqual([bytesToHex(sha256(secret))]);
    await expect(fetchChannel(HOST, secret)).resolves.toEqual({ pending: 5, nextIdx: 5 });
  });

  it("refuses a public key, an entry or a push token out of shape before sending them", async () => {
    const relay = addRelay(HOST);
    await expect(putChannel(HOST, secret, { publicKey: "x" })).rejects.toThrow();
    await expect(postHashes(HOST, secret, [{ h: "not a hash" }])).rejects.toThrow();
    await expect(postHashes(HOST, secret, [{ h: "A".repeat(22), t: "short" }])).rejects.toThrow();
    await expect(patchHashes(HOST, secret, [])).rejects.toThrow();
    expect(() => entries(2, 1, "token")).toThrow();
    expect(relay.requests).toEqual([]);
    expect(isExpoPushToken(PUSH_TOKEN)).toBe(true);
    // What the relay takes (printable ASCII without brackets inside), Expo's older prefix too.
    expect(isExpoPushToken("ExponentPushToken[a+b/c=d.e:f~g]")).toBe(true);
    expect(isExpoPushToken("ExpoPushToken[xxxxxxxxxxxxxxxxxxxxxx]")).toBe(true);
    expect(isExpoPushToken(`ExponentPushToken[${"a".repeat(256)}]`)).toBe(true);
    expect(isExpoPushToken(`ExponentPushToken[${"a".repeat(257)}]`)).toBe(false);
    expect(isExpoPushToken("ExponentPushToken[]")).toBe(false);
    expect(isExpoPushToken("ExponentPushToken[a]b]")).toBe(false);
    expect(isExpoPushToken("ExponentPushToken[a b]")).toBe(false);
    expect(isExpoPushToken("ExponentPushToken[ü]")).toBe(false);
  });

  it("deposits entries in batches of 1,024 at most, up to the relay's cap", async () => {
    const relay = addRelay(HOST);
    await putChannel(HOST, secret, device);
    await expect(postHashes(HOST, secret, entries(2, 2000))).resolves.toEqual({
      pending: 2000,
      nextIdx: 2000
    });
    expect(relay.requests.filter((r) => r === "POST /v1/channel/hashes")).toHaveLength(2);
    await expect(postHashes(HOST, secret, entries(2002, 100))).rejects.toMatchObject({
      code: "refused",
      status: 409,
      // A relay of 2.2.0 writes no text: the status says it.
      reason: ""
    });
    await expect(postHashes(HOST, secret, [])).rejects.toThrow();
  });

  it("gives each entry its tap's hash and the bare push token sealed for that tap, or none", async () => {
    const keys = cardKeysOf(root, uid, 1);
    const [entry] = tapEntries(keys.k2, uid, 7, 1, PUSH_TOKEN);
    const c = sunMac(keys.k2, uid, 7);
    expect(entry.h).toBe(tapHash(c));
    // The bare token, as every relay of contract v2 opens it: nothing else sealed with it.
    expect(openSealedText(c, entry.t!)).toBe(PUSH_TOKEN);
    expect(openSealedToken(c, entry.t!)).toBe(PUSH_TOKEN);
    expect(tapEntries(keys.k2, uid, 7, 1, null)).toEqual([{ h: entry.h }]);
  });

  it("seals a new token into the entries still waiting, never adding one (PATCH)", async () => {
    const relay = addRelay(HOST);
    await putChannel(HOST, secret, device);
    await postHashes(HOST, secret, entries(2, 3));
    const fresh = "ExponentPushToken[zzzzzzzzzzzzzzzzzzzzzz]";
    // Taps 2 to 4 wait; 5 was never deposited.
    await expect(patchHashes(HOST, secret, entries(2, 4, fresh))).resolves.toEqual({
      pending: 3,
      nextIdx: 3,
      updated: 3
    });
    const channel = relay.channelOf(secret)!;
    expect(channel.hashes.size).toBe(3);
    const keys = cardKeysOf(root, uid, 1);
    const t = channel.hashes.get(tapHash(sunMac(keys.k2, uid, 3)))!.t!;
    expect(openSealedToken(sunMac(keys.k2, uid, 3), t)).toBe(fresh);
    // Without a token: the entries lose theirs.
    await patchHashes(HOST, secret, entries(2, 3, null));
    expect([...channel.hashes.values()].every(({ t: sealed }) => sealed === null)).toBe(true);
    relay.answerNext(200, { pending: 3, nextIdx: 3, updated: 9 });
    await expect(patchHashes(HOST, secret, entries(2, 3))).rejects.toMatchObject({
      code: "protocol"
    });
  });

  it("tells a deleted channel, and deletes one idempotently", async () => {
    addRelay(HOST);
    await expect(fetchChannel(HOST, secret)).resolves.toBeNull();
    await putChannel(HOST, secret, device);
    await deleteChannel(HOST, secret);
    await expect(fetchChannel(HOST, secret)).resolves.toBeNull();
    await expect(deleteChannel(HOST, secret)).resolves.toBeUndefined();
    await expect(postHashes(HOST, secret, [{ h: "A".repeat(22) }])).rejects.toMatchObject({
      code: "notFound"
    });
  });

  it("checks every answer, and tells a relay down from one that refuses", async () => {
    const relay = addRelay(HOST);
    await putChannel(HOST, secret, device);
    relay.answerNext(200, { pending: -1, nextIdx: 0 });
    await expect(fetchChannel(HOST, secret)).rejects.toMatchObject({ code: "protocol" });
    relay.answerNext(200, { pending: 5000, nextIdx: 5000 });
    await expect(fetchChannel(HOST, secret)).rejects.toMatchObject({ code: "protocol" });
    relay.answerNext(200, { pending: 3, nextIdx: 2 });
    await expect(fetchChannel(HOST, secret)).rejects.toMatchObject({ code: "protocol" });
    relay.answerNext(202, {});
    await expect(putChannel(HOST, secret, device)).rejects.toMatchObject({ code: "protocol" });
    relay.answerNext(503, { status: "ERROR", reason: "maintenance" });
    await expect(fetchChannel(HOST, secret)).rejects.toMatchObject({
      code: "unreachable",
      reason: "maintenance"
    });
    relay.answerNext(401, { status: "ERROR", reason: "secret" });
    await expect(fetchChannel(HOST, secret)).rejects.toMatchObject({ code: "unauthorized" });
    relay.unreachable = true;
    await expect(fetchChannel(HOST, secret)).rejects.toBeInstanceOf(RelayError);
    await expect(fetchRelayInfo(HOST)).rejects.toMatchObject({ code: "unreachable" });
    await expect(fetchRelayInfo("relay.example.org")).rejects.toMatchObject({
      code: "unreachable"
    });
  });

  it("gives up on a relay that does not answer in time", async () => {
    jest.useFakeTimers();
    try {
      const hanging: typeof fetch = (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("Aborted")));
        });
      const info = fetchRelayInfo(HOST, { fetchImpl: hanging, timeoutMs: 5000 });
      const outcome = expect(info).rejects.toMatchObject({ code: "unreachable" });
      await jest.advanceTimersByTimeAsync(5000);
      await outcome;
    } finally {
      jest.useRealTimers();
    }
  });

  it("only asks hosts that are canonical", async () => {
    await expect(fetchRelayInfo("https://relay.sattle.me")).rejects.toThrow(/canonical/);
  });
});

describe("a point of sale's tap through the relay", () => {
  it("wakes the phone with the tap, which checks it, and refuses the same tap again", async () => {
    const relay = addRelay(HOST);
    const card = new FakeNtag424();
    const programmed = await programCard(new Ntag424(card.transceive), {
      root,
      relayHost: HOST,
      version: 1
    });
    const secret = channelSecretOf(root, programmed.cardId, HOST);
    forgetDeviceKey();
    const deviceKey = await loadDeviceKey();
    await putChannel(HOST, secret, { publicKey: deviceKey.publicKey });
    const keys = cardKeysOf(root, card.uid, 1);
    await postHashes(
      HOST,
      secret,
      tapEntries(keys.k2, card.uid, programmed.counter + 1, 1000, PUSH_TOKEN)
    );

    const url = card.tap();
    const answer = await posTap(url);
    expect(answer.status).toBe(200);
    const request = (await answer.json()) as Record<string, unknown>;
    expect(request).toMatchObject({ tag: "withdrawRequest", maxWithdrawable: 100_000_000 });
    expect(request.callback).toMatch(/^https:\/\/relay\.sattle\.me\/cb\/[0-9a-f]{32}$/);

    // The notification's packet, and the same from `/v1/channel/pending`.
    expect(relay.pushes).toHaveLength(1);
    expect(relay.pushes[0]).toMatchObject({ to: PUSH_TOKEN, kind: "alert" });
    const packets = await fetchPendingPackets(HOST, secret);
    expect(packets).toHaveLength(1);
    const wake = openWakePacket(deviceKey.secretKey, packets[0])!;
    expect(wake.relay).toBe(HOST);
    expect(relay.sessions.get(wake.session)?.wsToken).toBe(wake.wsToken);
    expect(
      checkCardTap(
        { root, cardId: programmed.cardId, version: 1, lastCounter: programmed.counter },
        wake.p,
        wake.c
      )
    ).toMatchObject({ ok: true, counter: programmed.counter + 1 });

    // Replayed: the relay dropped its hash.
    const again = await posTap(url);
    expect(again.status).toBe(404);
    expect(await again.json()).toEqual({ status: "ERROR", reason: "" });
    // Taps read elsewhere meanwhile: their hashes go with the next tap's.
    card.tap();
    card.tap();
    expect((await posTap(card.tap())).status).toBe(200);
    await expect(fetchChannel(HOST, secret)).resolves.toMatchObject({ pending: 996 });
  });

  it("gives a packet once, while its tap's session lasts (a minute)", async () => {
    jest.useFakeTimers({ now: Date.UTC(2026, 9, 14) });
    try {
      const relay = addRelay(HOST);
      const card = new FakeNtag424();
      const programmed = await programCard(new Ntag424(card.transceive), {
        root,
        relayHost: HOST,
        version: 1
      });
      const secret = channelSecretOf(root, programmed.cardId, HOST);
      await putChannel(HOST, secret, { publicKey: WEBCRYPTO_VECTOR.publicKey });
      const keys = cardKeysOf(root, card.uid, 1);
      await postHashes(
        HOST,
        secret,
        tapEntries(keys.k2, card.uid, programmed.counter + 1, 10, PUSH_TOKEN)
      );
      await posTap(card.tap());
      await jest.advanceTimersByTimeAsync(59_000);
      await expect(fetchPendingPackets(HOST, secret)).resolves.toHaveLength(1);
      await expect(fetchPendingPackets(HOST, secret)).resolves.toHaveLength(0);
      await posTap(card.tap());
      await jest.advanceTimersByTimeAsync(60_000);
      await expect(fetchPendingPackets(HOST, secret)).resolves.toHaveLength(0);
      expect(relay.pushes).toHaveLength(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it("leaves out packets out of shape", async () => {
    const relay = addRelay(HOST);
    const secret = new Uint8Array(32).fill(7);
    relay.answerNext(200, { packets: [WEBCRYPTO_VECTOR.packet, { epk: "x" }, 3] });
    await expect(fetchPendingPackets(HOST, secret)).resolves.toHaveLength(1);
    relay.answerNext(200, { packets: "none" });
    await expect(fetchPendingPackets(HOST, secret)).rejects.toMatchObject({ code: "protocol" });
  });
});
