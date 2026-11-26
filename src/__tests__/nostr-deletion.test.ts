import { DELETION_CHUNK, deletionRequests, eventAddress, isDeletionOf } from "@/lib/nostr/deletion";
import { isValidEvent, signEvent, type NostrEvent } from "@/lib/nostr/event";
import { randomNostrKeys } from "@/lib/nostr/keys";
import { publishToRelays, queryRelays } from "@/lib/nostr/pool";
import { RECORD_KIND, sealRecord } from "@/lib/nostr/record";

import type * as RelaysFake from "../../jest/nostr-relays";

const relays = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");

const RELAY = "wss://relay.bakery.example";
const NOW = 1790000000;

const author = randomNostrKeys();
const other = randomNostrKeys();

function record(keys = author, address = "d1", createdAt = NOW - 60): NostrEvent {
  return sealRecord({
    type: "test",
    value: { address },
    signer: keys.secretKey,
    encryptionKey: new Uint8Array(32).fill(7),
    address,
    createdAt
  });
}

const call = (authKey = author.secretKey) => ({
  relays: [RELAY],
  channel: "account" as const,
  timeoutMs: 1000,
  authKey
});

async function held(): Promise<NostrEvent[]> {
  const answers = await queryRelays({}, call());
  return (answers.get(RELAY) ?? []) as NostrEvent[];
}

beforeEach(() => relays.resetRelays());

describe("deletion requests (NIP-09)", () => {
  it("name each event of their author by id and address, with its kind, signed by it", () => {
    const events = [record(author, "d1"), record(author, "d2")];
    const [request, ...rest] = deletionRequests(author.secretKey, events, NOW);
    expect(rest).toEqual([]);
    expect(isValidEvent(request)).toBe(true);
    expect(request).toMatchObject({
      kind: 5,
      pubkey: author.publicKey,
      content: "",
      created_at: NOW
    });
    expect(request!.tags).toEqual([
      ["e", events[0]!.id],
      ["e", events[1]!.id],
      ["a", `${RECORD_KIND}:${author.publicKey}:d1`],
      ["a", `${RECORD_KIND}:${author.publicKey}:d2`],
      ["k", String(RECORD_KIND)]
    ]);
  });

  it("leave out another author's events and earlier deletion requests", () => {
    const earlier = deletionRequests(author.secretKey, [record(author, "d1")], NOW - 10);
    const requests = deletionRequests(author.secretKey, [record(other, "d1"), ...earlier], NOW, [
      eventAddress(RECORD_KIND, other.publicKey, "d9")
    ]);
    expect(requests).toEqual([]);
  });

  it("name the events by their ids only when asked: another version at their address is kept", async () => {
    const first = record(author, "d1", NOW - 60);
    await publishToRelays(first, call());
    const [request, ...rest] = deletionRequests(author.secretKey, [first], NOW, [], {
      byIdOnly: true
    });
    expect(rest).toEqual([]);
    expect(request!.tags).toEqual([
      ["e", first.id],
      ["k", String(RECORD_KIND)]
    ]);
    await publishToRelays(request!, call());
    expect((await held()).map(({ id }) => id)).toEqual([request!.id]);
    // Signed again there meanwhile (another device), dated before the request: taken, and kept.
    const again = record(author, "d1", NOW - 30);
    await expect(publishToRelays(again, call())).resolves.toEqual([RELAY]);
    expect((await held()).map(({ id }) => id).sort()).toEqual([again.id, request!.id].sort());
  });

  it("name the addresses given, read or not", () => {
    const address = eventAddress(RECORD_KIND, author.publicKey, "channel");
    const [request] = deletionRequests(author.secretKey, [], NOW, [address]);
    expect(request!.tags).toEqual([
      ["a", address],
      ["k", String(RECORD_KIND)]
    ]);
    expect(isDeletionOf(request, author.publicKey, address)).toBe(true);
  });

  it("go in several requests past DELETION_CHUNK events, within strfry's limits", () => {
    const events = Array.from({ length: DELETION_CHUNK + 1 }, (_, i) => record(author, `d${i}`));
    const requests = deletionRequests(author.secretKey, events, NOW);
    expect(requests).toHaveLength(2);
    const named = requests.flatMap((request) => request.tags.filter(([name]) => name !== "k"));
    expect(named).toHaveLength(2 * events.length);
    for (const request of requests) {
      expect(request.tags.length).toBeLessThanOrEqual(2000);
      expect(JSON.stringify(request).length).toBeLessThan(65_536);
    }
  });

  it("are dated as the newest event when it is later, up to 10 minutes ahead", () => {
    expect(
      deletionRequests(author.secretKey, [record(author, "d", NOW + 120)], NOW)[0]
    ).toMatchObject({
      created_at: NOW + 120
    });
    expect(
      deletionRequests(author.secretKey, [record(author, "d", NOW + 3600)], NOW)[0]
    ).toMatchObject({ created_at: NOW + 600 });
  });

  it("are told from another author's, another address's and a forged one", () => {
    const address = eventAddress(RECORD_KIND, author.publicKey, "channel");
    const [request] = deletionRequests(author.secretKey, [], NOW, [address]);
    expect(isDeletionOf(request, other.publicKey, address)).toBe(false);
    expect(isDeletionOf(request, author.publicKey, `${address}x`)).toBe(false);
    expect(isDeletionOf({ ...request, created_at: NOW + 1 }, author.publicKey, address)).toBe(
      false
    );
    expect(isDeletionOf(null, author.publicKey, address)).toBe(false);
  });
});

describe("the relays' fake, as strfry", () => {
  it("delete what a request names, then refuse it again, but take a newer version", async () => {
    const first = record(author, "d1", NOW - 60);
    const kept = record(author, "d2", NOW - 60);
    await publishToRelays(first, call());
    await publishToRelays(kept, call());
    const [request] = deletionRequests(author.secretKey, [first], NOW);
    await expect(publishToRelays(request!, call())).resolves.toEqual([RELAY]);
    expect((await held()).map((event) => event.id).sort()).toEqual([kept.id, request!.id].sort());
    // Neither the same event again, nor an older version of its address.
    await expect(publishToRelays(first, call())).resolves.toEqual([]);
    await expect(publishToRelays(record(author, "d1", NOW - 1), call())).resolves.toEqual([]);
    // A version dated after the request is a new record.
    await expect(publishToRelays(record(author, "d1", NOW + 1), call())).resolves.toEqual([RELAY]);
  });

  it("delete nothing of another author, and refuse a request naming another's address", async () => {
    const theirs = record(other, "d1");
    await publishToRelays(theirs, call(other.secretKey));
    const byId = signEvent(
      { kind: 5, created_at: NOW, tags: [["e", theirs.id]], content: "" },
      author.secretKey
    );
    await publishToRelays(byId, call());
    expect((await held()).map((event) => event.id)).toContain(theirs.id);
    const byAddress = signEvent(
      {
        kind: 5,
        created_at: NOW,
        tags: [["a", eventAddress(RECORD_KIND, other.publicKey, "d1")]],
        content: ""
      },
      author.secretKey
    );
    await expect(publishToRelays(byAddress, call())).resolves.toEqual([]);
  });

  it("keep every request, readable by the address it names", async () => {
    const address = eventAddress(RECORD_KIND, author.publicKey, "channel");
    const requests = [
      ...deletionRequests(author.secretKey, [], NOW, [address]),
      ...deletionRequests(author.secretKey, [record(author, "d1")], NOW)
    ];
    for (const request of requests) await publishToRelays(request, call());
    const answers = await queryRelays(
      { kinds: [5], authors: [author.publicKey], "#a": [address] },
      call()
    );
    expect((answers.get(RELAY) ?? []).map((event) => (event as NostrEvent).id)).toEqual([
      requests[0]!.id
    ]);
  });
});
