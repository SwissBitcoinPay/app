import { MERCHANT_MAP_ORIGIN, MERCHANT_MAP_URL } from "@/config/merchant-map";
import { mapNavigation, mapWindowOpens } from "@/features/card/merchant-map";

describe("the merchant map's navigation", () => {
  it("shows BTC Map's merchants that take contactless Lightning, on its own origin", () => {
    expect(MERCHANT_MAP_URL).toBe("https://btcmap.org/map?&nfc");
    expect(MERCHANT_MAP_URL.startsWith(`${MERCHANT_MAP_ORIGIN}/`)).toBe(true);
    expect(mapNavigation(MERCHANT_MAP_URL, true)).toBe("load");
  });

  it("loads BTC Map's own pages in place, whatever their path, query or fragment", () => {
    for (const url of [
      "https://btcmap.org",
      "https://btcmap.org/",
      "https://btcmap.org/merchant/node:123",
      "https://btcmap.org?nfc",
      "https://btcmap.org#map=15/46.2/6.1",
      "HTTPS://BTCMAP.ORG/map"
    ]) {
      expect(mapNavigation(url, true)).toBe("load");
    }
  });

  it("never takes another host for BTC Map's", () => {
    for (const url of [
      // A user name before the host: the host is evil.example.
      "https://btcmap.org@evil.example/",
      "https://btcmap.org.evil.example/",
      "https://evilbtcmap.org/",
      "https://api.btcmap.org/v4/places",
      // Another port, or no TLS.
      "https://btcmap.org:8443/",
      "http://btcmap.org/"
    ]) {
      expect(mapNavigation(url, true)).toBe("external");
    }
  });

  it("opens a merchant's site, mail, phone or place outside the app", () => {
    for (const url of [
      "https://www.openstreetmap.org/node/123",
      "http://cafe.example/",
      "mailto:hello@cafe.example",
      "tel:+41221234567",
      "geo:46.2,6.1"
    ]) {
      expect(mapNavigation(url, true)).toBe("external");
      expect(mapWindowOpens(url)).toBe(true);
    }
  });

  it("ignores any other scheme: never another app nor a page of the device", () => {
    for (const url of [
      "intent://scan/#Intent;scheme=zxing;end",
      "lightning:lnbc1",
      "bitcoin:bc1qexample",
      "javascript:alert(1)",
      "data:text/html,<p>hi</p>",
      "file:///etc/hosts",
      "market://details?id=x",
      "sattleme://cards",
      "not a url",
      ""
    ]) {
      expect(mapNavigation(url, true)).toBe("ignore");
      expect(mapWindowOpens(url)).toBe(false);
    }
  });

  it("lets a frame inside BTC Map's page load https pages only, never leave the app", () => {
    expect(mapNavigation("https://www.youtube-nocookie.com/embed/x", false)).toBe("load");
    expect(mapNavigation("about:blank", false)).toBe("load");
    expect(mapNavigation("http://cafe.example/", false)).toBe("ignore");
    expect(mapNavigation("tel:+41221234567", false)).toBe("ignore");
    expect(mapNavigation("intent://scan/#Intent;end", false)).toBe("ignore");
  });

  it("loads the blank pages a page makes for itself", () => {
    expect(mapNavigation("about:blank", true)).toBe("load");
    expect(mapNavigation("about:srcdoc", true)).toBe("load");
  });
});
