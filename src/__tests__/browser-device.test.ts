import { ANDROID_APP_URL, IOS_APP_URL } from "@/config/app-stores";
import { browserDevice } from "@/lib/browser-device";
import { browserDevice as webBrowserDevice, browserDeviceOf } from "@/lib/browser-device.web";

/*
 * Which device the web app's browser runs on (browser-device.web.ts), from user agents as the
 * browsers send them: only words and a store's link depend on it.
 */
describe("the web app's device", () => {
  it.each([
    {
      device: "an Android phone's Chrome",
      ua: "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
      touch: 5,
      is: "android"
    },
    {
      device: "an Android phone's Firefox",
      ua: "Mozilla/5.0 (Android 14; Mobile; rv:131.0) Gecko/131.0 Firefox/131.0",
      touch: 5,
      is: "android"
    },
    {
      device: "an Android tablet's Chrome",
      ua: "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
      touch: 10,
      is: "android"
    },
    {
      device: "an iPhone's Safari",
      ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
      touch: 5,
      is: "iphone"
    },
    {
      device: "an iPhone's Chrome",
      ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1",
      touch: 5,
      is: "iphone"
    },
    {
      device: "an iPad's Safari, as a Mac (iPadOS's default)",
      ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
      touch: 5,
      is: "ipad"
    },
    {
      device: "an iPad's Safari, as a tablet",
      ua: "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
      touch: 5,
      is: "ipad"
    },
    {
      device: "a Mac's Safari",
      ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
      touch: 0,
      is: "other"
    },
    {
      device: "a Windows computer's Chrome, touch screen included",
      ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
      touch: 10,
      is: "other"
    },
    {
      device: "a Linux computer's Firefox",
      ua: "Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0",
      touch: 0,
      is: "other"
    },
    { device: "a browser that says nothing", ua: "", touch: 0, is: "other" }
  ])("tells $device", ({ ua, touch, is }) => {
    expect(browserDeviceOf(ua, touch)).toBe(is);
  });

  it("reads this browser's user agent and touch points", () => {
    const before = Object.getOwnPropertyDescriptor(globalThis, "navigator");
    try {
      Object.defineProperty(globalThis, "navigator", {
        value: {
          userAgent:
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
          maxTouchPoints: 5
        },
        configurable: true
      });
      expect(webBrowserDevice()).toBe("ipad");
      // No touch points said: none.
      Object.defineProperty(globalThis, "navigator", {
        value: { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" },
        configurable: true
      });
      expect(webBrowserDevice()).toBe("other");
      // No user agent: another device.
      Object.defineProperty(globalThis, "navigator", { value: {}, configurable: true });
      expect(webBrowserDevice()).toBe("other");
      Object.defineProperty(globalThis, "navigator", { value: undefined, configurable: true });
      expect(webBrowserDevice()).toBe("other");
    } finally {
      if (before) Object.defineProperty(globalThis, "navigator", before);
      else delete (globalThis as { navigator?: unknown }).navigator;
    }
  });

  it("is no browser in the apps", () => {
    expect(browserDevice()).toBeNull();
  });
});

describe("the app's pages on the stores", () => {
  it("leads to the production app, on its store's own host", () => {
    const android = new URL(ANDROID_APP_URL);
    expect(android.protocol).toBe("https:");
    expect(android.host).toBe("play.google.com");
    expect(android.pathname).toBe("/store/apps/details");
    // The production variant's application id (app-config.test.ts), never staging's.
    expect(android.searchParams.get("id")).toBe("ch.swissbitcoinpay.checkout");
    expect([...android.searchParams.keys()]).toEqual(["id"]);

    const ios = new URL(IOS_APP_URL);
    expect(ios.protocol).toBe("https:");
    expect(ios.host).toBe("apps.apple.com");
    // The App Store ID of the bundle id the production app keeps.
    expect(ios.pathname).toBe("/app/id6444370155");
    expect(ios.search).toBe("");
  });
});
