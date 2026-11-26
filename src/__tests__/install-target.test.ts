/*
 * "Install the app" (src/features/install/install-target.ts): where it leads by device and
 * browser, and the names it keeps.
 */
import {
  INSTALL_BANNER_DISMISSED_KEY,
  WEB_APP_ICON_PATH,
  installOfferOf,
  isSafariWithDock,
  type InstallSituation
} from "@/features/install/install-target";

const script = jest.requireActual<{ ICON_FILE: string }>("../../scripts/web-manifest.js");

/** A browser on a computer that offers nothing: Firefox, say. */
const NOTHING: InstallSituation = {
  device: "other",
  standalone: false,
  promptReady: false,
  safariDock: false
};

// Real user agents (desktop Safari freezes macOS at 10_15_7).
const SAFARI_17 =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";
const SAFARI_26 =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15";
const SAFARI_16 =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.15";
const CHROME_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const EDGE_MAC = `${CHROME_MAC} Edg/131.0.0.0`;
const FIREFOX_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:133.0) Gecko/20100101 Firefox/133.0";
const SAFARI_WINDOWS_LIKE =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

describe('where "Install the app" leads', () => {
  // The store's app on a phone or a tablet, the iPad included.
  it.each([
    ["iphone", "appStore"],
    ["ipad", "appStore"],
    ["android", "googlePlay"]
  ] as const)("leads an %s to its store, whatever its browser offers", (device, target) => {
    for (const promptReady of [false, true]) {
      for (const safariDock of [false, true]) {
        expect(installOfferOf({ device, standalone: false, promptReady, safariDock })).toEqual({
          target,
          device
        });
      }
    }
  });

  it("leads a computer to its browser's prompt, else to Safari's Dock, else nowhere", () => {
    expect(installOfferOf({ ...NOTHING, promptReady: true })).toEqual({
      target: "prompt",
      device: "other"
    });
    expect(installOfferOf({ ...NOTHING, safariDock: true })).toEqual({
      target: "dock",
      device: "other"
    });
    expect(installOfferOf(NOTHING)).toBeNull();
  });

  // The web app installed, or the apps: they are the app already.
  it("offers nothing to the installed web app, nor in the apps", () => {
    for (const device of ["iphone", "ipad", "android", "other"] as const) {
      expect(
        installOfferOf({ device, standalone: true, promptReady: true, safariDock: true })
      ).toBeNull();
    }
    expect(installOfferOf({ ...NOTHING, device: null, promptReady: true })).toBeNull();
  });
});

describe('telling Safari on a Mac, which has "Add to Dock"', () => {
  it("takes Safari 17 and later on a Mac", () => {
    expect(isSafariWithDock(SAFARI_17, 0)).toBe(true);
    expect(isSafariWithDock(SAFARI_26, 0)).toBe(true);
  });

  it("leaves out an older Safari, an iPad claiming a Mac, and the other browsers", () => {
    expect(isSafariWithDock(SAFARI_16, 0)).toBe(false);
    // iPadOS's Safari asks for the desktop site by default: several touch points.
    expect(isSafariWithDock(SAFARI_17, 5)).toBe(false);
    for (const userAgent of [CHROME_MAC, EDGE_MAC, FIREFOX_MAC, SAFARI_WINDOWS_LIKE, ""]) {
      expect(isSafariWithDock(userAgent, 0)).toBe(false);
    }
  });
});

describe("what installed browsers depend on", () => {
  // Browsers keep the banner's "don't offer again" under it: never rename it.
  it("keeps the banner's choice under its name", () => {
    expect(INSTALL_BANNER_DISMISSED_KEY).toBe("install-banner-dismissed");
  });

  // The banner shows the icon the web export writes for the manifest: no other file.
  it("shows the icon the web export writes", () => {
    expect(WEB_APP_ICON_PATH).toBe(`/${script.ICON_FILE}`);
  });
});
