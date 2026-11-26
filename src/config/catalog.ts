/*
 * The business's catalogue of articles ("Items"): what an article may hold. No categories nor VAT.
 */

/** Longest name of an article, as the list and cards show it on one line. */
export const ARTICLE_NAME_MAX_LENGTH = 60;

/** Longest description: a few lines ("Ingredients, size, allergens"). */
export const ARTICLE_DESCRIPTION_MAX_LENGTH = 280;

/**
 * Most articles a catalogue keeps: one record each on the relays, all read when "Items"
 * opens (one author, read page by page).
 */
export const MAX_ARTICLES = 500;

/**
 * Open Food Facts (the scan of a barcode fills the name and the photo of a
 * packaged product, never its price). A third party: it receives the device's IP address and the
 * barcode scanned. Free, no key; its API asks every app for a User-Agent `AppName/Version
 * (ContactEmail)`.
 */
export const OPEN_FOOD_FACTS_ORIGIN = "https://world.openfoodfacts.org";

const EMAIL = /^[^\s@()]+@[^\s@()]+\.[^\s@()]+$/;

/**
 * The address Open Food Facts can reach the app's makers at, in the User-Agent of its requests:
 * `EXPO_PUBLIC_OPEN_FOOD_FACTS_EMAIL`, from `.env.local` or the EAS environments. Public: inlined
 * into the bundle, and sent with every
 * scan. Null when unset or not an address: the User-Agent then names the source repository.
 */
export function getOpenFoodFactsEmail(): string | null {
  // Dot notation on purpose: Expo only inlines statically referenced EXPO_PUBLIC_* variables.
  const email = process.env.EXPO_PUBLIC_OPEN_FOOD_FACTS_EMAIL?.trim();
  return email && EMAIL.test(email) ? email : null;
}
