import { MERCHANT_MAP_ORIGIN } from "@/config/merchant-map";

/**
 * What the merchant map's view (MerchantMap.tsx) does with a page its map asks to open: `load` it
 * in
 * place, open it `external`ly (the system's browser, mail, phone or maps app), or `ignore` it.
 */
export type MapNavigation = "load" | "external" | "ignore";

/**
 * What the map's links open outside the app, as its pages' code reads: a merchant's website, its
 * mail and phone, its place in the maps app (`geo:`). Nothing else, the page being a third party's:
 * no `intent:` nor any other app's scheme, nor its `lightning:` invoices (BTC Map's own donations,
 * not what the map is for).
 */
const EXTERNAL_SCHEMES: ReadonlySet<string> = new Set(["https", "http", "mailto", "tel", "geo"]);

/**
 * The scheme of a URL, and its authority when it has one (`scheme://authority`), in lower case.
 * The authority ends where a URL's parser ends it for http(s): at `/`, `\`, `?` or `#`. Null: no
 * scheme.
 */
function partsOf(url: string): { scheme: string; authority: string | null } | null {
  const match = /^([a-z][a-z0-9+.-]*):(\/\/([^/\\?#]*))?/i.exec(url);
  if (!match) return null;
  return {
    scheme: match[1]!.toLowerCase(),
    authority: match[3] === undefined ? null : match[3].toLowerCase()
  };
}

/**
 * The map's view loads BTC Map's own pages only (MERCHANT_MAP_ORIGIN, exactly: no other port, no
 * user name before its host), and the blank pages a page makes. A frame inside a page may load
 * any https page (it cannot reach the app, nor navigate the view). Any other page the map's page
 * opens leaves the app when it has an EXTERNAL_SCHEMES scheme, and is ignored otherwise.
 * `topFrame`: whether the view's own page navigates (always true on Android, where
 * react-native-webview 14 cannot tell a frame's navigation apart).
 */
export function mapNavigation(url: string, topFrame: boolean): MapNavigation {
  if (url === "about:blank" || url === "about:srcdoc") return "load";
  const parts = partsOf(url);
  if (parts === null) return "ignore";
  if (parts.authority !== null && `${parts.scheme}://${parts.authority}` === MERCHANT_MAP_ORIGIN) {
    return "load";
  }
  if (!topFrame) return parts.scheme === "https" ? "load" : "ignore";
  return EXTERNAL_SCHEMES.has(parts.scheme) ? "external" : "ignore";
}

/** What opens outside the app when the map opens a new window (`target="_blank"`, `window.open`). */
export function mapWindowOpens(url: string): boolean {
  const parts = partsOf(url);
  return parts !== null && EXTERNAL_SCHEMES.has(parts.scheme);
}
