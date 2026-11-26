import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";

import { DEFAULT_RELAYS } from "@/config/relays";
import { loadImage, resetImages } from "@/features/media/images";
import {
  MAX_IMAGE_BYTES,
  copyImageTo,
  createImage,
  fetchImage,
  publishImage,
  type ImageRef
} from "@/lib/media/image";
import { signEvent } from "@/lib/nostr/event";
import { RECORD_KIND } from "@/lib/nostr/record";

import type * as RelaysFake from "../../jest/nostr-relays";

const relays = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");

const NOW = 1790000000;

/** Bytes standing for a JPEG: the layer stores them as they are. */
function bytes(length: number, fill = 7): Uint8Array {
  return new Uint8Array(length).fill(fill);
}

beforeEach(() => {
  relays.resetRelays();
  resetImages();
});

describe("images on Nostr", () => {
  it("are read back by whoever holds the reference, the bytes of its hash only", async () => {
    const image = bytes(1000);
    const { ref, event } = createImage(image, NOW);
    expect(ref.hash).toBe(bytesToHex(sha256(image)));
    // Once a majority took it, the others in the background.
    await expect(publishImage(event, ref)).resolves.toEqual(DEFAULT_RELAYS.slice(0, 3));
    await new Promise((resolve) => setTimeout(resolve, 0));
    const found = await fetchImage(ref);
    expect(found).toMatchObject({ status: "found", holders: [...DEFAULT_RELAYS] });
    expect(found.status === "found" && found.bytes).toEqual(image);
    // The event names nothing: an opaque address, a key of this image only, no readable content.
    expect(JSON.stringify(event)).not.toContain(ref.key);
    expect(event.kind).toBe(RECORD_KIND);
  });

  it("refuse other bytes at the image's address, even signed by its author", async () => {
    const { ref, event } = createImage(bytes(1000), NOW);
    // Anyone holding a reference can sign as its author: the bytes must still have its hash.
    const other = createImage(bytes(1000, 9), NOW);
    const forged: ImageRef = { key: ref.key, hash: other.ref.hash };
    await publishImage(event, ref);
    await expect(fetchImage(forged)).resolves.toEqual({ status: "notFound" });
  });

  it("tell an image no relay holds from relays out of reach", async () => {
    const { ref } = createImage(bytes(10), NOW);
    await expect(fetchImage(ref)).resolves.toEqual({ status: "notFound" });
    for (const relay of DEFAULT_RELAYS) relays.unreachable.add(relay);
    await expect(fetchImage(ref)).resolves.toEqual({ status: "unreachable" });
  });

  it("stay within the 64 KB of an event at their largest", () => {
    const { event } = createImage(bytes(MAX_IMAGE_BYTES, 255), NOW);
    expect(new TextEncoder().encode(JSON.stringify(event)).length).toBeLessThan(60_000);
    expect(() => createImage(bytes(MAX_IMAGE_BYTES + 1), NOW)).toThrow();
    expect(() => createImage(bytes(0), NOW)).toThrow();
  });

  it("are copied to new relays from the ones they were on", async () => {
    const { ref, event } = createImage(bytes(500), NOW);
    const before = DEFAULT_RELAYS.slice(0, 2);
    const after = ["wss://relay.bakery.example"];
    await publishImage(event, ref, before);
    await expect(fetchImage(ref, after)).resolves.toEqual({ status: "notFound" });
    await expect(copyImageTo(ref, after, before)).resolves.toBe(true);
    const found = await fetchImage(ref, after);
    expect(found.status).toBe("found");
    // Nothing to copy: false, never a rejection.
    await expect(copyImageTo(createImage(bytes(5), NOW).ref, after, before)).resolves.toBe(false);
  });

  it("are downloaded once for a copy, from the first relay that holds them", async () => {
    const { ref, event } = createImage(bytes(500), NOW);
    const before = DEFAULT_RELAYS.slice(0, 3);
    const after = ["wss://relay.bakery.example", "wss://relay.cafe.example"];
    await publishImage(event, ref, before);
    relays.calls.length = 0;
    await expect(copyImageTo(ref, after, before)).resolves.toBe(true);
    const queried = relays.calls.filter(({ operation }) => operation === "query");
    // The new relays answer without it, the first old one gives it: the others are never asked.
    expect(queried.map(({ relay }) => relay)).toEqual([...after, before[0]]);
    const published = relays.calls.filter(({ operation }) => operation === "publish");
    expect(published.map(({ relay }) => relay).sort()).toEqual([...after].sort());
    for (const relay of after) {
      await expect(fetchImage(ref, [relay])).resolves.toMatchObject({ status: "found" });
    }
  });

  it("ask last, for the next copies, a relay that did not answer", async () => {
    const [dead, alive] = DEFAULT_RELAYS;
    const after = ["wss://relay.bakery.example"];
    const first = createImage(bytes(50), NOW);
    const second = createImage(bytes(60), NOW);
    await publishImage(first.event, first.ref, [alive]);
    await publishImage(second.event, second.ref, [alive]);
    relays.unreachable.add(dead);
    await expect(copyImageTo(first.ref, after, [dead, alive])).resolves.toBe(true);
    relays.calls.length = 0;
    await expect(copyImageTo(second.ref, after, [dead, alive])).resolves.toBe(true);
    expect(
      relays.calls.filter(({ operation }) => operation === "query").map(({ relay }) => relay)
    ).toEqual([...after, alive]);
    // Once it answers again (asked last, for an image no relay holds), it takes its place back.
    relays.unreachable.delete(dead);
    const missing = createImage(bytes(70), NOW).ref;
    await expect(copyImageTo(missing, after, [dead, alive])).resolves.toBe(false);
    relays.calls.length = 0;
    await expect(copyImageTo(missing, after, [dead, alive])).resolves.toBe(false);
    expect(
      relays.calls.filter(({ operation }) => operation === "query").map(({ relay }) => relay)
    ).toEqual([...after, dead, alive]);
  });

  it("ignore an event of another kind at the image's address", async () => {
    const { ref, event } = createImage(bytes(100), NOW);
    const other = signEvent({ ...event, kind: 1, content: "x" }, new Uint8Array(32).fill(3));
    relays.stored.set(DEFAULT_RELAYS[0], [other]);
    await expect(fetchImage(ref, [DEFAULT_RELAYS[0]])).resolves.toEqual({ status: "notFound" });
  });

  it("are read once per launch, then from memory, as data URIs", async () => {
    const { ref, event } = createImage(bytes(30), NOW);
    await publishImage(event, ref);
    const uri = await loadImage(ref);
    expect(uri).toMatch(/^data:image\/jpeg;base64,/);
    relays.resetRelays();
    await expect(loadImage(ref)).resolves.toBe(uri);
  });
});
