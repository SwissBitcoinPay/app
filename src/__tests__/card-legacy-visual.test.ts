import { LEGACY_CARD_IMAGE_HOST } from "@/config/card";
import { legacyVisualOf } from "@/lib/card/legacy-visual";

const IMAGE = `https://${LEGACY_CARD_IMAGE_HOST}/api/records/v1/cdn_files/AZoZx2Qk-_v7/file/content`;
const VISUAL = { front_image: IMAGE, card_id: "4821-0937-5530-1186", is_white: false };

describe("a v2 card's visual, as its server gives it", () => {
  it("is read from the server's answer, beside the withdraw request's own fields", () => {
    expect(legacyVisualOf({ tag: "withdrawRequest", ...VISUAL })).toEqual({
      imageUrl: IMAGE,
      number: "4821-0937-5530-1186",
      white: false
    });
    expect(legacyVisualOf({ ...VISUAL, is_white: true })?.white).toBe(true);
    // The printed numbers the v2 server reserves: letters and digits, in any case.
    for (const number of ["abcd-1234-efgh-5678", "ABCD-EF12-gh34-IJ56", "0000-0000-0000-0000"]) {
      expect(legacyVisualOf({ ...VISUAL, card_id: number })?.number).toBe(number);
    }
  });

  it("takes the image as the v2 server names it: its id in base64url with its padding", () => {
    // The v2 server's image id: a 16-byte id, padded, which
    // its `/file/content` route requires.
    const image = `https://${LEGACY_CARD_IMAGE_HOST}/api/records/v1/cdn_files/AZoZx2Qkd7yXq1mN3pT8vw==/file/content`;
    expect(legacyVisualOf({ ...VISUAL, front_image: image })?.imageUrl).toBe(image);
  });

  it("is none from a server that gives none of it, or not all of it", () => {
    expect(legacyVisualOf({ tag: "withdrawRequest" })).toBeNull();
    expect(legacyVisualOf({ front_image: IMAGE, card_id: VISUAL.card_id })).toBeNull();
    expect(legacyVisualOf({ front_image: IMAGE, is_white: false })).toBeNull();
    expect(legacyVisualOf({ card_id: VISUAL.card_id, is_white: false })).toBeNull();
  });

  it("downloads only from the v2 CDN, over https, read the same by any client", () => {
    for (const front_image of [
      `http://${LEGACY_CARD_IMAGE_HOST}/front.png`,
      "https://cdn.example.com/front.png",
      `https://${LEGACY_CARD_IMAGE_HOST}.example.com/front.png`,
      `https://x${LEGACY_CARD_IMAGE_HOST}/front.png`,
      `https://${LEGACY_CARD_IMAGE_HOST.toUpperCase()}/front.png`,
      `https://${LEGACY_CARD_IMAGE_HOST}:443/front.png`,
      `https://${LEGACY_CARD_IMAGE_HOST}:8443/front.png`,
      `https://user@${LEGACY_CARD_IMAGE_HOST}/front.png`,
      `https://example.com\\@${LEGACY_CARD_IMAGE_HOST}/front.png`,
      `https://example.com#@${LEGACY_CARD_IMAGE_HOST}/front.png`,
      `https://${LEGACY_CARD_IMAGE_HOST}\\@example.com/front.png`,
      `https://${LEGACY_CARD_IMAGE_HOST}/front.png?size=large`,
      `https://${LEGACY_CARD_IMAGE_HOST}/front.png#top`,
      `https://${LEGACY_CARD_IMAGE_HOST}/front image.png`,
      `https://${LEGACY_CARD_IMAGE_HOST}/front.png\n`,
      `https://${LEGACY_CARD_IMAGE_HOST}`,
      `https://${LEGACY_CARD_IMAGE_HOST}/${"a".repeat(512)}`,
      `//${LEGACY_CARD_IMAGE_HOST}/front.png`,
      "front.png",
      42,
      null
    ]) {
      expect(legacyVisualOf({ ...VISUAL, front_image })).toBeNull();
    }
  });

  it("takes only a number shaped as the ones printed on the cards, and a boolean", () => {
    for (const card_id of [
      "4821093755301186",
      "4821-0937-5530-118",
      "4821-0937-5530-11867",
      "4821 0937 5530 1186",
      " 4821-0937-5530-1186",
      "4821-0937-5530-118ü",
      "4821-0937-5530-1186-0000",
      4821093755301186,
      null
    ]) {
      expect(legacyVisualOf({ ...VISUAL, card_id })).toBeNull();
    }
    for (const is_white of ["true", 1, 0, null]) {
      expect(legacyVisualOf({ ...VISUAL, is_white })).toBeNull();
    }
  });
});
