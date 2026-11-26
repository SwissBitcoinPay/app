/*
 * "Install the app" on the web (src/features/install/install-offer.web.ts): the browser's install
 * prompt, kept from the bundle's start and used once; the stores' pages; the banner's choice.
 */
import { ANDROID_APP_URL, IOS_APP_URL } from "@/config/app-stores";
import { INSTALL_BANNER_DISMISSED_KEY } from "@/features/install/install-target";
import type { BrowserDevice } from "@/lib/browser-device";

let mockDevice: BrowserDevice | null = "other";
jest.mock("@/lib/browser-device", () => ({ browserDevice: () => mockDevice }));
jest.mock("@/components/ui/external-link", () => ({ openExternal: jest.fn() }));
jest.mock("@/lib/log/log", () => ({
  ...jest.requireActual<object>("@/lib/log/log"),
  logFailure: jest.fn()
}));

type WebModule = typeof import("@/features/install/install-offer.web");

const CHROME =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const SAFARI_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";

const GLOBALS = ["window", "navigator", "localStorage"] as const;
const saved = GLOBALS.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]);

afterEach(() => {
  for (const [name, descriptor] of saved) {
    if (descriptor) Object.defineProperty(globalThis, name as string, descriptor);
    else delete (globalThis as Record<string, unknown>)[name as string];
  }
  mockDevice = "other";
});

/** A storage like a browser's localStorage, or one that refuses (blocked, private mode). */
function storage(refuses = false) {
  const items = new Map<string, string>();
  const fail = () => {
    throw new Error("SecurityError");
  };
  return {
    items,
    getItem: (key: string) => (refuses ? fail() : (items.get(key) ?? null)),
    setItem: (key: string, value: string) => (refuses ? fail() : void items.set(key, value))
  };
}

/** The browser's install prompt event, as Chrome hands it over. */
function promptEvent(prompt: () => Promise<unknown> = () => Promise.resolve()) {
  return { preventDefault: jest.fn(), prompt: jest.fn(prompt) };
}

/**
 * Loads the web module afresh in a browser of `device` (its user agent, the web app installed or
 * not), as the bundle starts (followInstallPrompt), and gives a way to fire the browser's events.
 */
function load({
  device = "other",
  userAgent = CHROME,
  standalone = false,
  iosStandalone = false,
  store = storage()
}: {
  device?: BrowserDevice | null;
  userAgent?: string;
  standalone?: boolean;
  iosStandalone?: boolean;
  store?: ReturnType<typeof storage>;
} = {}) {
  mockDevice = device;
  const handlers = new Map<string, ((event: unknown) => void)[]>();
  const navigator = { userAgent, maxTouchPoints: 0, standalone: iosStandalone };
  const window = {
    navigator,
    addEventListener: (type: string, handler: (event: unknown) => void) =>
      handlers.set(type, [...(handlers.get(type) ?? []), handler]),
    matchMedia: (query: string) => ({
      matches: standalone && query === "(display-mode: standalone)"
    })
  };
  for (const [name, value] of [
    ["window", window],
    ["navigator", navigator],
    ["localStorage", store]
  ] as const) {
    Object.defineProperty(globalThis, name, { value, configurable: true });
  }
  let web!: WebModule;
  let openExternal!: jest.Mock;
  let logFailure!: jest.Mock;
  jest.isolateModules(() => {
    /* eslint-disable @typescript-eslint/no-require-imports -- loaded afresh, as the page loads */
    web = require("@/features/install/install-offer.web") as WebModule;
    openExternal = (require("@/components/ui/external-link") as { openExternal: jest.Mock })
      .openExternal;
    logFailure = (require("@/lib/log/log") as { logFailure: jest.Mock }).logFailure;
    /* eslint-enable @typescript-eslint/no-require-imports */
  });
  web.followInstallPrompt();
  const fire = (type: string, event: unknown = {}) => {
    for (const handler of handlers.get(type) ?? []) handler(event);
  };
  return { web, fire, handlers, openExternal, logFailure, store };
}

describe("the browser's install prompt", () => {
  it("is offered on a computer once the browser offers it, and used once", async () => {
    const { web, fire } = load();
    const changes = jest.fn();
    web.subscribeInstallOffer(changes);
    expect(web.currentInstallOffer()).toBeNull();

    const event = promptEvent();
    fire("beforeinstallprompt", event);
    // The browser's own prompt held back: the app offers it where the owner chose.
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(changes).toHaveBeenCalledTimes(1);
    expect(web.currentInstallOffer()).toEqual({ target: "prompt", device: "other" });

    web.startInstall("prompt");
    expect(event.prompt).toHaveBeenCalledTimes(1);
    expect(web.currentInstallOffer()).toBeNull();
    // Used: a second press opens nothing.
    web.startInstall("prompt");
    expect(event.prompt).toHaveBeenCalledTimes(1);
    await Promise.resolve();
  });

  it("is listened for once, however often the bundle asks", () => {
    const { web, handlers } = load();
    web.followInstallPrompt();
    expect(handlers.get("beforeinstallprompt")).toHaveLength(1);
    expect(handlers.get("appinstalled")).toHaveLength(1);
  });

  it("ignores an event that is not one", () => {
    const { web, fire } = load();
    const event = { preventDefault: jest.fn() };
    fire("beforeinstallprompt", event);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(web.currentInstallOffer()).toBeNull();
  });

  it("offers nothing more once the web app is installed from this page", () => {
    const { web, fire } = load();
    fire("beforeinstallprompt", promptEvent());
    fire("appinstalled");
    expect(web.currentInstallOffer()).toBeNull();
  });

  it("notes a prompt that fails in the journal", async () => {
    const { web, fire, logFailure } = load();
    fire(
      "beforeinstallprompt",
      promptEvent(() => Promise.reject(new Error("InvalidStateError")))
    );
    web.startInstall("prompt");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(logFailure).toHaveBeenCalledWith("Opening the install prompt failed", expect.any(Error));
  });
});

describe("where a device installs", () => {
  // An iPad's too, to the App Store.
  it.each([
    ["iphone", "appStore", IOS_APP_URL],
    ["ipad", "appStore", IOS_APP_URL],
    ["android", "googlePlay", ANDROID_APP_URL]
  ] as const)("leads an %s to its store's page", (device, target, url) => {
    const { web, fire, openExternal } = load({ device });
    // Android's Chrome offers its prompt too: the store's app all the same.
    fire("beforeinstallprompt", promptEvent());
    expect(web.currentInstallOffer()).toEqual({ target, device });
    web.startInstall(target);
    expect(openExternal).toHaveBeenCalledWith(url);
  });

  it("shows Safari on a Mac the Dock's steps, opening nothing itself", () => {
    const { web, openExternal } = load({ userAgent: SAFARI_MAC });
    expect(web.currentInstallOffer()).toEqual({ target: "dock", device: "other" });
    web.startInstall("dock");
    expect(openExternal).not.toHaveBeenCalled();
  });

  it("offers nothing to the web app installed, a window or iOS's Home Screen", () => {
    for (const installed of [{ standalone: true }, { iosStandalone: true }]) {
      const { web, fire } = load({ device: "iphone", ...installed });
      fire("beforeinstallprompt", promptEvent());
      expect(web.currentInstallOffer()).toBeNull();
    }
  });
});

describe("the banner's dismissal", () => {
  it("is kept on this device", () => {
    const { web, store } = load();
    expect(web.readInstallBannerDismissed()).toBe(false);
    web.dismissInstallBanner();
    expect(store.items.get(INSTALL_BANNER_DISMISSED_KEY)).toBe("1");
    expect(web.readInstallBannerDismissed()).toBe(true);
  });

  // A browser that refuses its storage: the banner shows, and stays closed for this page only.
  it("never throws when the browser refuses its storage, and says so in the journal", () => {
    const { web, logFailure } = load({ store: storage(true) });
    expect(web.readInstallBannerDismissed()).toBe(false);
    expect(() => web.dismissInstallBanner()).not.toThrow();
    expect(logFailure.mock.calls.map(([message]) => message)).toEqual([
      "Reading the install banner's choice failed",
      "Saving the install banner's choice failed"
    ]);
  });
});
