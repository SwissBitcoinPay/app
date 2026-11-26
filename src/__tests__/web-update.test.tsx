import "@/i18n";

import { act, fireEvent, render, screen } from "@testing-library/react-native";

import { WebUpdateNotice } from "@/features/navigation/WebUpdateNotice";
import { NotificationsProvider } from "@/features/notifications/NotificationsProvider";
import { readLog } from "@/lib/log/log";
import { appScriptName, appScriptsOf, isOtherVersion } from "@/lib/web-update/app-scripts";
import {
  CHECK_EVERY_MS,
  followWebUpdate,
  resetWebUpdate,
  webUpdateReady
} from "@/lib/web-update/watch.web";
import { motion } from "@/theme";

// The web app's watch, not the apps' (which never sees a new version).
jest.mock("@/lib/web-update/watch", () => jest.requireActual("@/lib/web-update/watch.web"));

/*
 * A new deployment of the web app while a page of it is open: the page
 * served now is read every half hour while the tab shows, its scripts compared with the running
 * page's, and "New version available" stays until "Update" reloads the page. Jest
 * has no DOM: the page's pieces the code reads are faked here (its scripts, its visibility, the
 * browser's connection, its location), and the host by `fetch`.
 */

const ORIGIN = "https://web.example";
const EVENT = "Checking for a new version of the web app failed";

const RUNTIME = "__expo-metro-runtime-ed4c1cfa6193d76fc294130e42bd1916.js";
const COMMON = "__common-fe9791336676360840c14d2bc32aaead.js";
const INDEX = "index-a1f8509907090a158b9a072623aa766e.js";
const RUNNING = [RUNTIME, COMMON, INDEX];
const NEXT = [RUNTIME, "__common-1f6946c41b0894d035c1964ef9229be6.js", "index-70e7218d.js"];

/** A page as `expo export` writes it (the staging web app's, its head shortened). */
function page(scripts: string[]): string {
  return [
    "<!DOCTYPE html>",
    '<html lang="en">',
    '  <head><meta charset="utf-8" /><title>sattle.me</title>',
    '  <link rel="icon" href="/favicon.ico"/></head>',
    "  <body>",
    "    <noscript>You need to enable JavaScript to run this app.</noscript>",
    '    <div id="root"></div>',
    "  " +
      scripts.map((name) => `<script src="/_expo/static/js/web/${name}" defer></script>`).join(""),
    "</body>",
    "</html>"
  ].join("\n");
}

type Answer = { status?: number; url?: string; body?: string } | "never";

const browser = {
  visibility: "visible" as DocumentVisibilityState,
  onLine: true,
  scripts: [] as { src: string }[],
  listeners: new Map<string, () => void>()
};
const reload = jest.fn();
let answers: Answer[] = [];
const fetchMock = jest.fn(async (_url: string, init: RequestInit): Promise<Response> => {
  const answer = answers.shift() ?? { body: page(RUNNING) };
  if (answer === "never")
    return new Promise((_resolve, reject) =>
      init.signal?.addEventListener("abort", () =>
        reject(Object.assign(new Error("This operation was aborted"), { name: "AbortError" }))
      )
    );
  const { status = 200, url = `${ORIGIN}/`, body = "" } = answer;
  return {
    ok: status >= 200 && status < 300,
    status,
    url,
    text: async () => body
  } as Response;
});

const saved = (["document", "navigator", "location", "fetch"] as const).map(
  (name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const
);

beforeAll(() => {
  Object.defineProperty(globalThis, "document", {
    value: {
      get scripts() {
        return browser.scripts;
      },
      get visibilityState() {
        return browser.visibility;
      },
      addEventListener: (type: string, listener: () => void) =>
        browser.listeners.set(type, listener),
      removeEventListener: (type: string, listener: () => void) => {
        if (browser.listeners.get(type) === listener) browser.listeners.delete(type);
      }
    },
    configurable: true
  });
  Object.defineProperty(globalThis, "navigator", {
    value: {
      get onLine() {
        return browser.onLine;
      }
    },
    configurable: true
  });
  Object.defineProperty(globalThis, "location", {
    value: { href: `${ORIGIN}/pos`, origin: ORIGIN, reload },
    configurable: true
  });
  Object.defineProperty(globalThis, "fetch", { value: fetchMock, configurable: true });
});

afterAll(() => {
  for (const [name, descriptor] of saved) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete (globalThis as Record<string, unknown>)[name];
  }
});

beforeEach(() => {
  jest.useFakeTimers();
  resetWebUpdate();
  browser.visibility = "visible";
  browser.onLine = true;
  browser.scripts = [
    ...RUNNING.map((name) => ({ src: `${ORIGIN}/_expo/static/js/web/${name}` })),
    // A script that is not the app's (an extension's, inline ones): left out.
    { src: "" },
    { src: "https://example.com/widget.js" }
  ];
  browser.listeners.clear();
  answers = [];
});

afterEach(() => {
  resetWebUpdate();
  jest.useRealTimers();
});

/** In steps, each one's reads answered before the next. */
async function advance(ms: number) {
  for (let left = ms; left > 0; left -= 60_000) {
    await act(async () => {
      jest.advanceTimersByTime(Math.min(60_000, left));
    });
  }
}

function failures() {
  return readLog().entries.filter((entry) => entry.event === EVENT);
}

describe("the web app's own scripts", () => {
  it("are those the page's HTML loads, by name, in order", () => {
    expect(appScriptsOf(page(RUNNING))).toEqual(RUNNING);
    expect(
      appScriptsOf(
        [
          `<script type="module" src='${ORIGIN}/_expo/static/js/web/${INDEX}?v=2'></script>`,
          // A file that is no script, a script without source, a name elsewhere than in `src`.
          '<script src="/_expo/static/js/web/index.js.map.txt"></script>',
          "<script>console.log(1)</script>",
          `<script data-src="/_expo/static/js/web/${COMMON}"></script>`,
          `<link rel="preload" href="/_expo/static/js/web/${COMMON}" />`
        ].join("")
      )
    ).toEqual([INDEX]);
    expect(appScriptName("/_expo/static/js/web/../index.js")).toBeNull();
    expect(
      appScriptName("/node_modules/expo-router/entry.bundle?platform=web&dev=true")
    ).toBeNull();
  });

  it("tell another version by one script at least that the running page did not load", () => {
    const running = new Set(RUNNING);
    expect(isOtherVersion(RUNNING, running)).toBe(false);
    expect(isOtherVersion([RUNTIME, COMMON], running)).toBe(false);
    expect(isOtherVersion(NEXT, running)).toBe(true);
    // Nothing to compare: neither a page without the app's scripts, nor a running page without.
    expect(isOtherVersion([], running)).toBe(false);
    expect(isOtherVersion(NEXT, new Set())).toBe(false);
  });
});

describe("the watch for a new version of the web app", () => {
  it("reads the page served every half hour while the tab shows, until it is another version", async () => {
    const heard = jest.fn();
    const release = followWebUpdate(heard);

    await advance(CHECK_EVERY_MS - 60_000);
    expect(fetchMock).not.toHaveBeenCalled();
    await advance(60_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(`${ORIGIN}/`);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ cache: "no-store" });
    // The same version: nothing to say.
    expect(webUpdateReady()).toBe(false);
    expect(heard).not.toHaveBeenCalled();

    answers = [{ body: page(NEXT) }];
    await advance(CHECK_EVERY_MS);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(webUpdateReady()).toBe(true);
    expect(heard).toHaveBeenCalledTimes(1);

    // Then no more reads: a reload is all that is left.
    expect(browser.listeners.size).toBe(0);
    await advance(3 * CHECK_EVERY_MS);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(failures()).toEqual([]);
    release();
  });

  it("reads nothing while the tab is hidden, and at once when it shows again past a period", async () => {
    const release = followWebUpdate(() => undefined);
    browser.visibility = "hidden";
    await advance(2 * CHECK_EVERY_MS);
    expect(fetchMock).not.toHaveBeenCalled();

    answers = [{ body: page(NEXT) }];
    browser.visibility = "visible";
    await act(async () => browser.listeners.get("visibilitychange")?.());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(webUpdateReady()).toBe(true);
    release();
  });

  it("waits for the browser to be online again", async () => {
    const release = followWebUpdate(() => undefined);
    browser.onLine = false;
    await advance(CHECK_EVERY_MS + 60_000);
    expect(fetchMock).not.toHaveBeenCalled();
    browser.onLine = true;
    await advance(60_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(failures()).toEqual([]);
    release();
  });

  it("never takes for the app's a page that is not: an HTTP error, another origin, no app script", async () => {
    const release = followWebUpdate(() => undefined);
    answers = [
      { status: 503, body: page(NEXT) },
      { url: "https://portal.example.com/login", body: page(NEXT) },
      // A captive portal's page, at the app's address.
      { body: "<html><body><form>Wi-Fi</form><script src='/portal.js'></script></body></html>" },
      "never"
    ];
    for (let i = 0; i < 3; i++) await advance(CHECK_EVERY_MS);
    // A read that never ends is given up.
    await advance(CHECK_EVERY_MS);
    await advance(60_000);

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(webUpdateReady()).toBe(false);
    expect(failures().map(({ error }) => [error?.kind, error?.code])).toEqual([
      ["WebUpdateCheckError", "503"],
      ["WebUpdateCheckError", "otherOrigin"],
      ["WebUpdateCheckError", "noAppScripts"],
      ["AbortError", null]
    ]);

    // Then the next period's read as usual.
    answers = [{ body: page(NEXT) }];
    await advance(CHECK_EVERY_MS);
    expect(webUpdateReady()).toBe(true);
    release();
  });

  it("reads nothing without scripts of the app in the running page (development)", async () => {
    browser.scripts = [{ src: "http://localhost:8081/node_modules/expo-router/entry.bundle" }];
    const release = followWebUpdate(() => undefined);
    await advance(2 * CHECK_EVERY_MS);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(browser.listeners.size).toBe(0);
    release();
  });

  it("reads only while something follows it, the period running on", async () => {
    let release = followWebUpdate(() => undefined);
    await advance(CHECK_EVERY_MS - 10 * 60_000);
    release();
    expect(browser.listeners.size).toBe(0);
    await advance(CHECK_EVERY_MS);
    expect(fetchMock).not.toHaveBeenCalled();

    // Followed again (the welcome screen, then the app's screens): the read is due at once.
    release = followWebUpdate(() => undefined);
    await advance(60_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    release();
  });
});

describe("New version available", () => {
  async function showApp() {
    await render(
      <NotificationsProvider>
        <WebUpdateNotice />
      </NotificationsProvider>
    );
  }

  /** Jest has no layout: the notification waits for its height before it comes in. */
  async function measure() {
    for (const card of screen.queryAllByTestId("notification"))
      await fireEvent(card, "layout", {
        nativeEvent: { layout: { x: 0, y: 0, width: 366, height: 68 } }
      });
    await advance(motion.notificationIn + 20);
  }

  it('stays until "Update" reloads the page', async () => {
    await showApp();
    await advance(CHECK_EVERY_MS);
    expect(screen.queryByTestId("notification")).toBeNull();

    answers = [{ body: page(NEXT) }];
    await advance(CHECK_EVERY_MS);
    await measure();
    expect(screen.getByText("New version available")).toBeTruthy();
    expect(screen.getByText("Updating reloads the page")).toBeTruthy();

    // Not a notification that leaves by itself.
    await advance(4 * CHECK_EVERY_MS);
    expect(screen.getByText("New version available")).toBeTruthy();
    expect(reload).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByText("Update"));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("shows at once on screens opened after it was found", async () => {
    answers = [{ body: page(NEXT) }];
    const release = followWebUpdate(() => undefined);
    await advance(CHECK_EVERY_MS);
    release();
    expect(webUpdateReady()).toBe(true);

    await showApp();
    await measure();
    expect(screen.getByText("New version available")).toBeTruthy();
  });
});
