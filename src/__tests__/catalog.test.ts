import { schnorr } from "@noble/curves/secp256k1.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

import { getOpenFoodFactsEmail } from "@/config/catalog";
import { DEFAULT_RELAYS } from "@/config/relays";
import {
  articleAddress,
  articleEvent,
  fetchArticles,
  newArticleId,
  parseArticle,
  parseCatalogEntry,
  publishArticle,
  withCatalogEntry,
  type Article
} from "@/lib/catalog/article";
import {
  lookUpProduct,
  openFoodFactsUserAgent,
  parseProduct,
  productBarcode
} from "@/lib/catalog/open-food-facts";
import { encodeWalletSecret } from "@/lib/breez/secret";
import { publishToRelays } from "@/lib/nostr/pool";
import { NewerRecordError, sealRecord } from "@/lib/nostr/record";
import { deriveCatalogKeys, deriveTeamKeys, wipeTeamKeys } from "@/lib/team/keys";
import { articleInitials } from "@/features/catalog/ArticlesScreen";
import { changesArticle, copyCatalog } from "@/features/catalog/catalog";
import { createImage, fetchImage, publishImage } from "@/lib/media/image";

import type * as RelaysFake from "../../jest/nostr-relays";

const relays = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");

/** BIP-39 test mnemonic (all-zero entropy), never a real wallet's. */
const MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const team = deriveTeamKeys(encodeWalletSecret({ mnemonic: MNEMONIC }));
const keys = deriveCatalogKeys(team);
const call = {
  relays: DEFAULT_RELAYS,
  channel: "account" as const,
  timeoutMs: 1000,
  authKey: keys.nostr.secretKey
};

beforeEach(() => relays.resetRelays());

function article(patch: Partial<Article> = {}): Article {
  const createdAt = patch.createdAt ?? 1_790_000_000;
  return {
    version: 1,
    id: newArticleId(),
    name: "Cappuccino",
    description: "Double espresso, frothed whole milk and cocoa.",
    price: { minor: 480, digits: 2, currency: "CHF" },
    image: null,
    barcode: null,
    createdAt,
    updatedAt: createdAt,
    ...patch
  };
}

describe("catalogue keys", () => {
  it("never change: every article of every business derives from them (salt, info strings)", () => {
    const derive = (info: string) =>
      hkdf(sha256, team.root, utf8ToBytes("sattle.me/team"), utf8ToBytes(info), 32);
    expect(keys.encryptionKey).toEqual(derive("catalog/encryption-key/v1"));
    expect(keys.addressKey).toEqual(derive("catalog/address-key/v1"));
    expect(keys.nostr.secretKey).toEqual(derive("catalog/author/v1"));
    expect(keys.nostr.publicKey).toBe(
      bytesToHex(schnorr.getPublicKey(derive("catalog/author/v1")))
    );
    // Its own author: a read by author lists the articles alone, not the team's channels.
    expect(keys.nostr.publicKey).not.toBe(team.publicKey);
  });

  it("are refused once the account closes", () => {
    const closing = deriveTeamKeys(encodeWalletSecret({ mnemonic: MNEMONIC }));
    wipeTeamKeys(closing);
    expect(() => deriveCatalogKeys(closing)).toThrow();
  });
});

describe("articles", () => {
  it("accept only a valid article, and flag a newer version", () => {
    const valid = article();
    expect(parseArticle(JSON.parse(JSON.stringify(valid)))).toEqual(valid);
    expect(parseArticle({ ...valid, name: " " })).toBeNull();
    expect(parseArticle({ ...valid, name: "x".repeat(61) })).toBeNull();
    expect(parseArticle({ ...valid, description: "x".repeat(281) })).toBeNull();
    // Prices are exact: integer minor units, never a float.
    expect(
      parseArticle({ ...valid, price: { minor: 4.8, digits: 2, currency: "CHF" } })
    ).toBeNull();
    expect(parseArticle({ ...valid, price: { minor: -1, digits: 2, currency: "CHF" } })).toBeNull();
    expect(
      parseArticle({ ...valid, price: { minor: 480, digits: 2, currency: "chf" } })
    ).toBeNull();
    expect(parseArticle({ ...valid, barcode: "76100971" })?.barcode).toBe("76100971");
    expect(parseArticle({ ...valid, barcode: "7610-097" })).toBeNull();
    expect(parseArticle({ ...valid, image: { key: "00", hash: "00" } })).toBeNull();
    expect(() => parseArticle({ ...valid, version: 2 })).toThrow(NewerRecordError);
    // Changed after it was added, never before.
    expect(parseArticle({ ...valid, updatedAt: valid.createdAt + 60 })?.updatedAt).toBe(
      valid.createdAt + 60
    );
    expect(parseArticle({ ...valid, updatedAt: valid.createdAt - 1 })).toBeNull();
    expect(parseArticle({ ...valid, updatedAt: undefined })).toBeNull();
  });

  it("apply an entry saved on this device as relays would keep it", () => {
    const older = article({ name: "Espresso", createdAt: 1_790_000_000 });
    const newer = article({ name: "Croissant", createdAt: 1_790_000_100 });
    const list = [newer, older];
    // Added: in its place, the newest first.
    const added = article({ name: "Tea", createdAt: 1_790_000_050 });
    expect(withCatalogEntry(list, added).map(({ name }) => name)).toEqual([
      "Croissant",
      "Tea",
      "Espresso"
    ]);
    // Changed: replaced where it was, unless what is there is as recent or more.
    const changed = { ...older, name: "Double espresso", updatedAt: older.updatedAt + 60 };
    expect(withCatalogEntry(list, changed)).toEqual([newer, changed]);
    expect(withCatalogEntry([newer, changed], older)).toEqual([newer, changed]);
    // Removed: gone, unless changed after the removal.
    const removal = {
      version: 1 as const,
      id: older.id,
      removed: true as const,
      updatedAt: older.updatedAt + 1
    };
    expect(withCatalogEntry(list, removal)).toEqual([newer]);
    expect(withCatalogEntry([newer, changed], removal)).toEqual([newer, changed]);
  });

  it("accept a removal at an article's address", () => {
    const removal = { version: 1, id: newArticleId(), removed: true, updatedAt: 1_790_000_100 };
    expect(parseCatalogEntry(removal)).toEqual(removal);
    expect(parseCatalogEntry({ ...removal, removed: false })).toBeNull();
    expect(parseCatalogEntry({ ...removal, updatedAt: -1 })).toBeNull();
    expect(parseCatalogEntry(article())).toEqual(expect.objectContaining({ name: "Cappuccino" }));
  });

  it("show the last version of an article, and none once it is removed", async () => {
    const added = article({ name: "Espresso" });
    const kept = article({ name: "Butter croissant" });
    await publishArticle(articleEvent(keys, added), call);
    await publishArticle(articleEvent(keys, kept), call);

    const changed: Article = {
      ...added,
      name: "Double espresso",
      price: { ...added.price, minor: 520 },
      updatedAt: added.updatedAt + 1
    };
    await publishArticle(articleEvent(keys, changed), call);
    // An older version published again (another device's stale copy): the relays keep the newest.
    await expect(publishArticle(articleEvent(keys, added), call)).rejects.toThrow();
    expect((await fetchArticles(keys, call)).articles).toContainEqual(changed);
    expect((await fetchArticles(keys, call)).articles).not.toContainEqual(added);

    await publishArticle(
      articleEvent(keys, {
        version: 1,
        id: added.id,
        removed: true,
        updatedAt: changed.updatedAt + 1
      }),
      call
    );
    expect((await fetchArticles(keys, call)).articles).toEqual([kept]);
  });

  it("are read back from the relays, the newest first", async () => {
    const older = article({ name: "Espresso", createdAt: 1_790_000_000 });
    const newer = article({ name: "Butter croissant", createdAt: 1_790_000_100 });
    await publishArticle(articleEvent(keys, older), call);
    await publishArticle(articleEvent(keys, newer), call);

    const read = await fetchArticles(keys, call);
    expect(read.answered).toBe(DEFAULT_RELAYS.length);
    expect(read.articles).toEqual([newer, older]);
    expect(read.newerUnreadable).toBe(false);
    // Opaque: the relays see neither a name nor the article's id.
    const event = relays.stored
      .get(DEFAULT_RELAYS[0]!)!
      .find((stored) => stored.tags[0]?.[1] === articleAddress(keys, older.id))!;
    expect(event.content).not.toContain("Espresso");
    expect(JSON.stringify(event.tags)).not.toContain(older.id);
  });

  it("ignore records at another article's address, and other authors", async () => {
    const kept = article();
    await publishArticle(articleEvent(keys, kept), call);
    // An article sealed at the address of another id: refused (its `d` tag is checked).
    const misplaced = article({ name: "Misplaced" });
    await publishToRelays(
      sealRecord({
        type: "catalog-article",
        value: misplaced,
        signer: keys.nostr.secretKey,
        encryptionKey: keys.encryptionKey,
        address: articleAddress(keys, kept.id.replace(/^./, kept.id[0] === "a" ? "b" : "a")),
        createdAt: misplaced.createdAt
      }),
      call
    );
    // Another business's catalogue: other keys.
    const other = deriveCatalogKeys(
      deriveTeamKeys(
        encodeWalletSecret({ mnemonic: "zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo wrong" })
      )
    );
    await publishArticle(articleEvent(other, article({ name: "Other" })), {
      ...call,
      authKey: other.nostr.secretKey
    });

    const read = await fetchArticles(keys, call);
    expect(read.articles.map(({ name }) => name)).toEqual([kept.name]);
  });

  it("flag a record of a newer format, and tell when no relay answered", async () => {
    const future = article();
    await publishToRelays(
      sealRecord({
        type: "catalog-article",
        value: { ...future, version: 2 },
        signer: keys.nostr.secretKey,
        encryptionKey: keys.encryptionKey,
        address: articleAddress(keys, future.id),
        createdAt: future.createdAt
      }),
      call
    );
    const read = await fetchArticles(keys, call);
    expect(read.articles).toEqual([]);
    expect(read.newerUnreadable).toBe(true);

    for (const relay of DEFAULT_RELAYS) relays.unreachable.add(relay);
    expect(await fetchArticles(keys, call)).toEqual({
      articles: [],
      answered: 0,
      newerUnreadable: false
    });
  });

  it("are not hidden by garbage a relay sends under a real record's id", async () => {
    const kept = article();
    const event = articleEvent(keys, kept);
    const others = DEFAULT_RELAYS.slice(0, -1);
    const honest = DEFAULT_RELAYS.at(-1)!;
    // Every relay but the last holds a forged copy (another content, same id), the last the real.
    for (const relay of others) relays.stored.set(relay, [{ ...event, content: "forged" }]);
    relays.stored.set(honest, [event]);

    const read = await fetchArticles(keys, call);
    expect(read.articles).toEqual([kept]);
  });

  it("leave out an article a newer app changed since, not its older copy", async () => {
    const shown = article();
    const [lagging, ...others] = DEFAULT_RELAYS;
    relays.stored.set(lagging!, [articleEvent(keys, shown)]);
    const changed = sealRecord({
      type: "catalog-article",
      value: { ...shown, version: 2, updatedAt: shown.updatedAt + 10 },
      signer: keys.nostr.secretKey,
      encryptionKey: keys.encryptionKey,
      address: articleAddress(keys, shown.id),
      createdAt: shown.updatedAt + 10
    });
    for (const relay of others) relays.stored.set(relay, [changed]);

    const read = await fetchArticles(keys, call);
    expect(read.articles).toEqual([]);
    expect(read.newerUnreadable).toBe(true);
  });

  it("follow a change of the account's relays, with their photos", async () => {
    const photo = new Uint8Array(500).fill(9);
    const image = createImage(photo, 1_790_000_000);
    await publishImage(image.event, image.ref, DEFAULT_RELAYS);
    const kept = article({ image: image.ref });
    await publishArticle(articleEvent(keys, kept), call);
    const own = "wss://relay.bakery.example";

    // The catalogue's reads on the relays left (one read is a few pages on each).
    const catalogReads = () =>
      relays.calls
        .filter(
          ({ operation, filter }) =>
            operation === "query" && filter?.authors?.includes(keys.nostr.publicKey)
        )
        .map(({ relay }) => relay)
        .sort();
    relays.calls.length = 0;
    await fetchArticles(keys, call);
    const once = catalogReads();
    relays.calls.length = 0;
    await copyCatalog(team, DEFAULT_RELAYS, [own]);
    // Read once, for the articles and their photos alike.
    expect(catalogReads()).toEqual(once);
    const moved = await fetchArticles(keys, { ...call, relays: [own] });
    expect(moved.articles).toEqual([kept]);
    expect(await fetchImage(image.ref, [own])).toMatchObject({ status: "found", bytes: photo });
  });

  it("show their initials without a photo", () => {
    // Apostrophes and hyphens split words too.
    expect(articleInitials("O'Neill lemonade")).toBe("ON");
    expect(articleInitials("Ham-cheese")).toBe("HC");
    expect(articleInitials("tea")).toBe("T");
  });

  it("are changed only by what saving them would change", () => {
    const saved = article({ barcode: "7610000000000" });
    const same = {
      name: saved.name,
      description: saved.description,
      priceMinor: saved.price.minor,
      photo: null,
      barcode: saved.barcode
    };
    expect(changesArticle(saved, same)).toBe(false);
    // Saved trimmed: spaces around the texts change nothing.
    expect(
      changesArticle(saved, {
        ...same,
        name: ` ${saved.name} `,
        description: `${saved.description}\n`
      })
    ).toBe(false);
    expect(changesArticle(saved, { ...same, name: "Cappuccino XL" })).toBe(true);
    expect(changesArticle(saved, { ...same, description: "" })).toBe(true);
    expect(changesArticle(saved, { ...same, priceMinor: 490 })).toBe(true);
    expect(changesArticle(saved, { ...same, photo: new Uint8Array([0xff, 0xd8]) })).toBe(true);
    expect(changesArticle(saved, { ...same, barcode: null })).toBe(true);
  });
});

describe("Open Food Facts", () => {
  const userAgent = openFoodFactsUserAgent("3.0.0", null);

  it("names the makers' address when the build has one, else the source repository", () => {
    expect(openFoodFactsUserAgent("3.0.0", "apps@example.com")).toBe(
      "sattle.me/3.0.0 (apps@example.com)"
    );
    expect(userAgent).toBe("sattle.me/3.0.0 (+https://github.com/sattleme/app)");
  });

  it("reads the address from EXPO_PUBLIC_OPEN_FOOD_FACTS_EMAIL, an address only", () => {
    const before = process.env.EXPO_PUBLIC_OPEN_FOOD_FACTS_EMAIL;
    try {
      process.env.EXPO_PUBLIC_OPEN_FOOD_FACTS_EMAIL = " apps@example.com ";
      expect(getOpenFoodFactsEmail()).toBe("apps@example.com");
      process.env.EXPO_PUBLIC_OPEN_FOOD_FACTS_EMAIL = "apps (at) example";
      expect(getOpenFoodFactsEmail()).toBeNull();
      delete process.env.EXPO_PUBLIC_OPEN_FOOD_FACTS_EMAIL;
      expect(getOpenFoodFactsEmail()).toBeNull();
    } finally {
      if (before === undefined) delete process.env.EXPO_PUBLIC_OPEN_FOOD_FACTS_EMAIL;
      else process.env.EXPO_PUBLIC_OPEN_FOOD_FACTS_EMAIL = before;
    }
  });
  const response = (status: number, body: unknown = {}) =>
    ({ status, ok: status >= 200 && status < 300, json: async () => body }) as Response;

  const RIVELLA = "https://images.openfoodfacts.org/images/products/761/009/711/1072";

  it("reads only the barcodes of packaged products", () => {
    expect(productBarcode("7610097111072")).toBe("7610097111072");
    expect(productBarcode(" 76100971 ")).toBe("76100971");
    expect(productBarcode("012345678905")).toBe("012345678905");
    expect(productBarcode("https://example.com")).toBeNull();
    expect(productBarcode("1234567")).toBeNull();
  });

  it("asks API v3 for the name and the front photo, with the app's User-Agent", async () => {
    const fetcher = jest.fn(async () =>
      response(200, {
        status: "success",
        // As the live API answers (Rivella Rouge: main language German).
        product: {
          product_name: "  Rivella   Rouge 50 cl ",
          lang: "de",
          selected_images: {
            front: {
              display: {
                de: `${RIVELLA}/front_de.74.400.jpg`,
                fr: `${RIVELLA}/front_fr.39.400.jpg`
              },
              small: {
                de: `${RIVELLA}/front_de.74.200.jpg`,
                fr: `${RIVELLA}/front_fr.39.200.jpg`
              },
              thumb: {
                de: `${RIVELLA}/front_de.74.100.jpg`,
                fr: `${RIVELLA}/front_fr.39.100.jpg`
              }
            }
          }
        }
      })
    );
    const lookup = await lookUpProduct("7610097111072", {
      userAgent,
      language: "fr",
      fetcher: fetcher as unknown as typeof fetch
    });
    expect(lookup).toEqual({
      status: "found",
      product: {
        barcode: "7610097111072",
        name: "Rivella Rouge 50 cl",
        photoUrl: `${RIVELLA}/front_fr.39.400.jpg`
      }
    });
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      "https://world.openfoodfacts.org/api/v3/product/7610097111072?fields=product_name,lang,selected_images&lc=fr"
    );
    expect((init.headers as Record<string, string>)["User-Agent"]).toBe(
      "sattle.me/3.0.0 (+https://github.com/sattleme/app)"
    );
  });

  it("tells an unknown product from an outage", async () => {
    const ask = (fetcher: () => Promise<Response>) =>
      lookUpProduct("7610097111072", {
        userAgent,
        language: "fr",
        fetcher: fetcher as unknown as typeof fetch
      });
    expect(await ask(async () => response(404))).toEqual({ status: "notFound" });
    // Known, but with nothing to fill in.
    expect(await ask(async () => response(200, { product: {} }))).toEqual({ status: "notFound" });
    expect(await ask(async () => response(503))).toEqual({ status: "unreachable" });
    expect(await ask(async () => response(200, { status: "failure" }))).toEqual({
      status: "unreachable"
    });
    expect(
      await ask(async () => {
        throw new TypeError("Network request failed");
      })
    ).toEqual({ status: "unreachable" });
  });

  it("takes the front photo in the user's language, else the product's, else any", () => {
    const nutella = "https://images.openfoodfacts.org/images/products/301/762/401/0701";
    // As the live API answers (Nutella: no French front photo, main language German).
    const body = (lang?: string) => ({
      product: {
        product_name: "Nutella",
        lang,
        selected_images: {
          front: {
            display: {
              en: `${nutella}/front_en.100.400.jpg`,
              de: `${nutella}/front_de.98.400.jpg`
            },
            small: { en: `${nutella}/front_en.100.200.jpg`, de: `${nutella}/front_de.98.200.jpg` }
          },
          ingredients: { display: { fr: `${nutella}/ingredients_fr.60.400.jpg` } }
        }
      }
    });
    const photo = (value: unknown, language: string) =>
      parseProduct("3017624010701", value, language)?.photoUrl;
    expect(photo(body("de"), "en")).toBe(`${nutella}/front_en.100.400.jpg`);
    expect(photo(body("de"), "fr")).toBe(`${nutella}/front_de.98.400.jpg`);
    expect(photo(body(), "fr")).toBe(`${nutella}/front_en.100.400.jpg`);
    // Only a smaller size.
    expect(
      photo(
        {
          product: { lang: "fr", selected_images: { front: { small: { fr: `${nutella}/s.jpg` } } } }
        },
        "fr"
      )
    ).toBe(`${nutella}/s.jpg`);
    // An entry that is not an HTTPS URL never hides a usable one, of another language or size.
    expect(
      photo(
        {
          product: {
            lang: "de",
            selected_images: {
              front: {
                display: { fr: "http://x/f.jpg", de: null, en: `${nutella}/en.jpg` },
                small: { fr: `${nutella}/fr-small.jpg` }
              }
            }
          }
        },
        "fr"
      )
    ).toBe(`${nutella}/en.jpg`);
    expect(
      photo(
        {
          product: {
            selected_images: {
              front: { display: { fr: 42 }, small: { fr: `${nutella}/fr-small.jpg` } }
            }
          }
        },
        "fr"
      )
    ).toBe(`${nutella}/fr-small.jpg`);
    // No front photo: never another image of the product.
    expect(
      photo(
        { product: { selected_images: { ingredients: { display: { fr: "https://x/i.jpg" } } } } },
        "fr"
      )
    ).toBeNull();
  });

  it("never takes a photo that is not on HTTPS, and cuts a long name", () => {
    expect(
      parseProduct(
        "76100971",
        {
          product: {
            product_name: "x".repeat(80),
            selected_images: { front: { display: { fr: "http://example.com/a.jpg" } } }
          }
        },
        "fr"
      )
    ).toEqual({ barcode: "76100971", name: "x".repeat(60), photoUrl: null });
  });
});
