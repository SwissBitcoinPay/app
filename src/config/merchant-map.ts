/**
 * "Where to pay with your card": the merchants around the world that take contactless
 * Lightning payments, a BoltCard's, on BTC Map's own map (btcmap.org, open source, its data from
 * OpenStreetMap), shown as it is in the app (WebView) and the web app (iframe). `nfc` is BTC Map's
 * filter on OpenStreetMap's `payment:lightning_contactless=yes` (in its map page's code: `nfc` →
 * `osm:payment:lightning_contactless`).
 *
 * A third party (AGENTS.md, "Wallet and payments"): btcmap.org, and the
 * services its page calls (its API, its tiles at tiles.openfreemap.org, its statistics at
 * umami.btcmap.org), receive the device's IP address while the map shows, and its position when
 * its holder asks for it on the map.
 */
export const MERCHANT_MAP_URL = "https://btcmap.org/map?&nfc";

/** The one origin the map's view navigates to by itself (merchant-map.ts in src/features/card/). */
export const MERCHANT_MAP_ORIGIN = "https://btcmap.org";
