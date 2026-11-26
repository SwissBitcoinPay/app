import { ARTICLE_NAME_MAX_LENGTH, OPEN_FOOD_FACTS_ORIGIN } from "@/config/catalog";

/*
 * Open Food Facts ("Scan" of "New item", in the apps only): the
 * name and the front photo of a packaged product, by its barcode. Never its price: it has none.
 *
 * API v3, read without an account (its docs, docs/api/index.md and docs/api/ref/api-v3.yaml of
 * openfoodfacts/openfoodfacts-server; v2 is deprecated there):
 * `GET /api/v3/product/{code}?fields=…`, 404 for an unknown product, a custom User-Agent asked of
 * every app, 15 product reads a minute per IP address. The front photo is in
 * `selected_images.front`: `display` (400 px at most), `small` (200), `thumb` (100), each by
 * language code (`image_urls.yaml` of its docs; checked against the live API: there is no key
 * `best`). Its language as the docs'
 * `image_front_url`: the user's when there is one, else the product's main language (`lang`).
 *
 * A third party: it receives the device's IP address and the barcode scanned.
 */

/** Per request: the form waits for it, a spinner on the name and the photo. */
export const OPEN_FOOD_FACTS_TIMEOUT_MS = 10_000;

/** EAN-8, UPC-A (12), EAN-13 and GTIN-14: the barcodes of packaged products. */
const BARCODE = /^\d{8}$|^\d{12,14}$/;

/**
 * The User-Agent Open Food Facts asks for, `AppName/Version (ContactEmail)`: the app and where to
 * reach its makers (`email`, getOpenFoodFactsEmail), else its source repository.
 */
export function openFoodFactsUserAgent(version: string, email: string | null): string {
  return `sattle.me/${version} (${email ?? "+https://github.com/sattleme/app"})`;
}

/** A barcode the camera read, as a product's code: digits only (UPC-E is left out). */
export function productBarcode(data: string): string | null {
  const code = data.trim();
  return BARCODE.test(code) ? code : null;
}

/** What Open Food Facts gives for a barcode. */
export type ScannedProduct = {
  barcode: string;
  /** Trimmed, at most ARTICLE_NAME_MAX_LENGTH characters; empty when it has none. */
  name: string;
  /** HTTPS URL of its front photo, null without one. */
  photoUrl: string | null;
};

export type ProductLookup =
  | { status: "found"; product: ScannedProduct }
  /** Open Food Facts answered: no such product. */
  | { status: "notFound" }
  /** No answer, or one that could not be read (rate limit, outage, offline). */
  | { status: "unreachable" };

const isHttpsUrl = (url: unknown): url is string =>
  typeof url === "string" && url.startsWith("https://");

/**
 * The HTTPS URL of a front photo among `urls` (a size of `selected_images.front`, by language
 * code): in `language`, else in the product's main language, else in any. An entry that is not an
 * HTTPS URL is passed over, never taken in place of a usable one.
 */
function photoIn(urls: unknown, language: string, mainLanguage: unknown): string | undefined {
  if (urls === null || typeof urls !== "object") return undefined;
  const byLanguage = urls as Record<string, unknown>;
  return [
    byLanguage[language],
    typeof mainLanguage === "string" ? byLanguage[mainLanguage] : undefined,
    ...Object.values(byLanguage)
  ].find(isHttpsUrl);
}

/** The product of a v3 answer, its photo in `language` when it has one; null when it is not one. */
export function parseProduct(
  barcode: string,
  body: unknown,
  language: string
): ScannedProduct | null {
  const product = (body as { product?: unknown } | null)?.product;
  if (product === null || typeof product !== "object") return null;
  const p = product as Record<string, unknown>;
  const name =
    typeof p.product_name === "string"
      ? p.product_name.replace(/\s+/g, " ").trim().slice(0, ARTICLE_NAME_MAX_LENGTH).trim()
      : "";
  const front = (
    p.selected_images as { front?: { display?: unknown; small?: unknown } } | undefined
  )?.front;
  const photoUrl =
    photoIn(front?.display, language, p.lang) ?? photoIn(front?.small, language, p.lang) ?? null;
  return { barcode, name, photoUrl };
}

/** Looks a barcode up on Open Food Facts. Never rejects. */
export async function lookUpProduct(
  barcode: string,
  options: { userAgent: string; language: string; fetcher?: typeof fetch }
): Promise<ProductLookup> {
  const { userAgent, language, fetcher = fetch } = options;
  const url =
    `${OPEN_FOOD_FACTS_ORIGIN}/api/v3/product/${encodeURIComponent(barcode)}` +
    `?fields=product_name,lang,selected_images&lc=${encodeURIComponent(language)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OPEN_FOOD_FACTS_TIMEOUT_MS);
  try {
    const response = await fetcher(url, {
      headers: { Accept: "application/json", "User-Agent": userAgent },
      signal: controller.signal
    });
    if (response.status === 404) return { status: "notFound" };
    if (!response.ok) return { status: "unreachable" };
    const product = parseProduct(barcode, await response.json(), language);
    if (!product) return { status: "unreachable" };
    // Known, but with neither a name nor a photo: nothing to fill in.
    if (product.name === "" && product.photoUrl === null) return { status: "notFound" };
    return { status: "found", product };
  } catch {
    return { status: "unreachable" };
  } finally {
    clearTimeout(timer);
  }
}
