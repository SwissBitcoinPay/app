import { LEGACY_CARD_IMAGE_HOST } from "@/config/card";
import { keepIssuerVisual } from "@/features/card/issuer-visual";
import { fetchImage } from "@/lib/media/image";
import { currentRelays } from "@/lib/relays/current";

import { binaries } from "../../jest/expo-file-system";
import { imageFake, resetImageFake } from "../../jest/image-manipulator";
import { imageRequests, serveLegacyImage } from "../../jest/legacy-card-server";
import type * as RelaysFake from "../../jest/nostr-relays";

// eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories are synchronous
jest.mock("expo-image-manipulator", () => require("../../jest/image-manipulator"));

const nostr = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");

const IMAGE = `https://${LEGACY_CARD_IMAGE_HOST}/api/records/v1/cdn_files/AZoZx2Qk/file/content`;
const VISUAL = { imageUrl: IMAGE, number: "4821-0937-5530-1186", white: false };
/** The first bytes of each format the platforms decode. */
const PNG = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13);
const JPEG = Uint8Array.of(0xff, 0xd8, 0xff, 0xe0, 0, 16);
const WEBP = Uint8Array.of(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50);

beforeEach(() => {
  nostr.resetRelays();
  resetImageFake();
});

describe("a v2 card's visual, kept at its migration", () => {
  it("is cut to the card's shape, sealed on the relays, and its download deleted", async () => {
    serveLegacyImage(IMAGE, PNG);
    imageFake.decoded = { width: 1200, height: 1200 };
    const issuer = await keepIssuerVisual(VISUAL, currentRelays());
    expect(issuer).toMatchObject({ number: "4821-0937-5530-1186", white: false });
    // The middle of a square image, of the card's shape (85.60 x 53.98 mm), 640 px wide.
    expect(imageFake.rendered.at(-1)).toMatchObject({
      crop: { originX: 0, originY: 222, width: 1200, height: 756 },
      width: 640,
      height: 403
    });
    expect((await fetchImage(issuer!.image)).status).toBe("found");
    expect(imageRequests).toEqual([IMAGE]);
    expect([...binaries.keys()]).toEqual([]);
    expect(imageFake.made.every((made) => made.released)).toBe(true);
  });

  it("takes a JPEG or a WebP as a PNG, told by its bytes", async () => {
    for (const bytes of [JPEG, WEBP]) {
      serveLegacyImage(IMAGE, bytes);
      expect(await keepIssuerVisual(VISUAL, currentRelays())).not.toBeNull();
    }
  });

  it("is none, leaving nothing on the phone, for what is not an image, or an answer refused", async () => {
    const html = new TextEncoder().encode("<!doctype html><title>Not found</title>");
    for (const [bytes, status] of [
      [html, 200],
      [new Uint8Array(0), 200],
      [PNG, 404],
      [PNG, 500]
    ] as const) {
      serveLegacyImage(IMAGE, bytes, status);
      expect(await keepIssuerVisual(VISUAL, currentRelays())).toBeNull();
    }
    expect(imageFake.rendered).toEqual([]);
    expect([...binaries.keys()]).toEqual([]);
  });

  it("is none for a file larger than any card's front, told or found", async () => {
    const large = new Uint8Array(5_000_001);
    large.set(PNG);
    serveLegacyImage(IMAGE, large);
    expect(await keepIssuerVisual(VISUAL, currentRelays())).toBeNull();
    // Announced larger than it is: refused before its body is read.
    jest
      .mocked(fetch)
      .mockResolvedValueOnce(
        new Response(PNG, { status: 200, headers: { "Content-Length": "6000000" } })
      );
    expect(await keepIssuerVisual(VISUAL, currentRelays())).toBeNull();
    expect(imageFake.rendered).toEqual([]);
  });

  it("is none when the image cannot be decoded, its download deleted all the same", async () => {
    serveLegacyImage(IMAGE, PNG);
    imageFake.unreadable = true;
    expect(await keepIssuerVisual(VISUAL, currentRelays())).toBeNull();
    expect([...binaries.keys()]).toEqual([]);
    expect(imageFake.made.every((made) => made.released)).toBe(true);
  });

  it("is none when no majority of the relays takes its image: never a visual nobody can show", async () => {
    serveLegacyImage(IMAGE, PNG);
    for (const url of currentRelays().slice(0, 3)) nostr.readOnly.add(url);
    expect(await keepIssuerVisual(VISUAL, currentRelays())).toBeNull();
  });

  it("is none when the CDN does not answer in time", async () => {
    jest.useFakeTimers();
    try {
      jest.mocked(fetch).mockImplementationOnce(
        (_input, init) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => reject(new Error("Aborted")));
          })
      );
      const kept = keepIssuerVisual(VISUAL, currentRelays());
      await jest.advanceTimersByTimeAsync(15_000);
      expect(await kept).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });
});
