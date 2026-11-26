import "@/i18n";

import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Linking } from "react-native";
import type {
  ShouldStartLoadRequest,
  WebViewErrorEvent,
  WebViewHttpErrorEvent,
  WebViewNavigationEvent,
  WebViewOpenWindowEvent,
  WebViewRenderProcessGoneEvent,
  WebViewTerminatedEvent
} from "react-native-webview/lib/WebViewTypes";

import { MERCHANT_MAP_URL } from "@/config/merchant-map";
import { MerchantMap } from "@/features/card/MerchantMap";
import { MerchantMap as WebMerchantMap } from "@/features/card/MerchantMap.web";
import { readLog } from "@/lib/log/log";

import type * as WebViewFake from "../../jest/react-native-webview";

const { shownWebView, webViewMounts, webViewShown } =
  jest.requireMock<typeof WebViewFake>("react-native-webview");

/** A navigation the map's page asks for, as react-native-webview hands it over. */
function navigation(url: string, isTopFrame = true): ShouldStartLoadRequest {
  return {
    url,
    isTopFrame,
    navigationType: "click",
    title: "",
    loading: true,
    canGoBack: false,
    canGoForward: false,
    lockIdentifier: 0
  };
}

/** The page loaded. */
async function load() {
  await act(async () => {
    shownWebView().onLoad?.({ nativeEvent: { url: MERCHANT_MAP_URL } } as WebViewNavigationEvent);
  });
}

function failures(): string[] {
  return readLog().entries.map((entry) => entry.event);
}

describe("the merchant map", () => {
  let opened: jest.SpyInstance;

  beforeEach(() => {
    opened = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
  });

  afterEach(() => {
    opened.mockRestore();
  });

  it("shows BTC Map's page of the merchants that take a BoltCard, once loaded", async () => {
    await render(<MerchantMap testID="map" />);
    expect(shownWebView().source).toEqual({ uri: "https://btcmap.org/map?&nfc" });
    expect(screen.getByTestId("merchant-map-loading")).toHaveTextContent("Loading the map…");
    await load();
    expect(screen.queryByTestId("merchant-map-loading")).toBeNull();
    expect(screen.getByTestId("merchant-map-view")).toBeTruthy();
  });

  it("offers the browser too when the page is slow, its load going on", async () => {
    jest.useFakeTimers();
    try {
      await render(<MerchantMap />);
      await act(async () => {
        jest.advanceTimersByTime(14_999);
      });
      expect(screen.queryByTestId("merchant-map-slow-browser")).toBeNull();
      await act(async () => {
        jest.advanceTimersByTime(1);
      });
      await fireEvent.press(screen.getByTestId("merchant-map-slow-browser"));
      expect(opened).toHaveBeenCalledWith("https://btcmap.org/map?&nfc");
      // Nothing said it failed: the same view loads on, and shows once loaded.
      expect(screen.getByTestId("merchant-map-loading")).toHaveTextContent(/Loading the map…/);
      expect(webViewMounts()).toBe(1);
      await load();
      expect(screen.queryByTestId("merchant-map-loading")).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it("gives the third party's page no bridge, file, window nor third-party cookie", async () => {
    await render(<MerchantMap />);
    const props = shownWebView();
    expect(props.onMessage).toBeUndefined();
    expect(props.injectedJavaScript).toBeUndefined();
    expect(props.injectedJavaScriptBeforeContentLoaded).toBeUndefined();
    expect(props.javaScriptCanOpenWindowsAutomatically).toBe(false);
    expect(props.allowFileAccess).toBe(false);
    expect(props.thirdPartyCookiesEnabled).toBe(false);
    expect(props.allowsLinkPreview).toBe(false);
    expect(props.webviewDebuggingEnabled).toBeUndefined();
    // Every URL reaches its navigation's check, none opened by react-native-webview itself.
    expect(props.originWhitelist).toEqual(["*"]);
  });

  it("lets the page ask for the device's position (Android: its WebView's geolocation)", async () => {
    await render(<MerchantMap />);
    expect(shownWebView().geolocationEnabled).toBe(true);
  });

  it("navigates to BTC Map's pages only, and opens a merchant's links outside the app", async () => {
    await render(<MerchantMap />);
    const decide = shownWebView().onShouldStartLoadWithRequest!;
    expect(decide(navigation("https://btcmap.org/merchant/node:1"))).toBe(true);
    expect(opened).not.toHaveBeenCalled();

    expect(decide(navigation("https://cafe.example/menu"))).toBe(false);
    expect(opened).toHaveBeenLastCalledWith("https://cafe.example/menu");
    expect(decide(navigation("tel:+41221234567"))).toBe(false);
    expect(opened).toHaveBeenLastCalledWith("tel:+41221234567");

    opened.mockClear();
    expect(decide(navigation("intent://scan/#Intent;end"))).toBe(false);
    expect(decide(navigation("lightning:lnbc1"))).toBe(false);
    expect(decide(navigation("https://cafe.example/", false))).toBe(true);
    expect(decide(navigation("tel:+41221234567", false))).toBe(false);
    expect(opened).not.toHaveBeenCalled();
  });

  it("opens the page's new windows outside the app, never in the map's view", async () => {
    await render(<MerchantMap />);
    const open = (targetUrl: string) =>
      shownWebView().onOpenWindow!({ nativeEvent: { targetUrl } } as WebViewOpenWindowEvent);
    open("https://www.openstreetmap.org/node/1");
    expect(opened).toHaveBeenLastCalledWith("https://www.openstreetmap.org/node/1");
    opened.mockClear();
    open("intent://scan/#Intent;end");
    expect(opened).not.toHaveBeenCalled();
  });

  it("survives a device that cannot open a link", async () => {
    opened.mockRejectedValue(new Error("No app to open it"));
    await render(<MerchantMap />);
    expect(shownWebView().onShouldStartLoadWithRequest!(navigation("mailto:a@b.example"))).toBe(
      false
    );
    await act(async () => undefined);
    expect(screen.getByTestId("merchant-map-view")).toBeTruthy();
  });

  it("says a page that could not load, journals it, and loads it anew in a new view", async () => {
    await render(<MerchantMap />);
    expect(webViewMounts()).toBe(1);
    await act(async () => {
      shownWebView().onError?.({
        nativeEvent: { code: -1009, description: "offline", domain: "NSURLErrorDomain" }
      } as WebViewErrorEvent);
    });
    expect(webViewShown()).toBe(false);
    expect(screen.getByTestId("merchant-map-failed")).toHaveTextContent(/The map did not load/);
    expect(failures()).toContain("Loading the merchants' map failed");
    // Its journal entry names the error's domain (iOS), never its description nor the page; a
    // code of four digits is the journal's to leave out.
    expect(readLog().entries.at(-1)?.error).toEqual(
      expect.objectContaining({ kind: "NSURLErrorDomain", code: null, message: null })
    );

    await fireEvent.press(screen.getByTestId("merchant-map-retry"));
    expect(screen.getByTestId("merchant-map-loading")).toBeTruthy();
    expect(webViewMounts()).toBe(2);
    await load();
    expect(screen.queryByTestId("merchant-map-failed")).toBeNull();
  });

  it("says a page the server refused", async () => {
    await render(<MerchantMap />);
    await act(async () => {
      shownWebView().onHttpError?.({
        nativeEvent: { statusCode: 503, description: "Service Unavailable" }
      } as WebViewHttpErrorEvent);
    });
    expect(screen.getByTestId("merchant-map-failed")).toBeTruthy();
    expect(readLog().entries.at(-1)?.error).toEqual(
      expect.objectContaining({ kind: "HttpError", code: "503" })
    );
  });

  it("drops a view whose web process ended, rather than crash or show a blank page", async () => {
    await render(<MerchantMap />);
    await load();
    await act(async () => {
      shownWebView().onRenderProcessGone?.({
        nativeEvent: { didCrash: true }
      } as WebViewRenderProcessGoneEvent);
    });
    expect(webViewShown()).toBe(false);
    expect(screen.getByTestId("merchant-map-failed")).toBeTruthy();
    expect(failures()).toContain("The merchants' map's web process ended");

    await fireEvent.press(screen.getByTestId("merchant-map-retry"));
    await act(async () => {
      shownWebView().onContentProcessDidTerminate?.({
        nativeEvent: {}
      } as WebViewTerminatedEvent);
    });
    expect(webViewShown()).toBe(false);
    expect(screen.getByTestId("merchant-map-failed")).toBeTruthy();
  });

  it("opens BTC Map in the browser from its failure", async () => {
    await render(<MerchantMap />);
    // Android's: no domain, its code (-2: host not found) journaled.
    await act(async () => {
      shownWebView().onError?.({
        nativeEvent: { code: -2, description: "net::ERR_NAME_NOT_RESOLVED" }
      } as WebViewErrorEvent);
    });
    expect(readLog().entries.at(-1)?.error).toEqual(
      expect.objectContaining({ kind: "WebViewError", code: "-2", message: null })
    );
    await fireEvent.press(screen.getByTestId("merchant-map-browser"));
    expect(opened).toHaveBeenCalledWith("https://btcmap.org/map?&nfc");
  });
});

describe("the merchant map on the web app", () => {
  it("shows BTC Map's page in a sandboxed frame that may ask for the position", async () => {
    const { root } = await render(<WebMerchantMap testID="map" />);
    const [frame] = root?.queryAll((node) => node.type === "iframe") ?? [];
    expect(frame?.props).toEqual(
      expect.objectContaining({
        src: "https://btcmap.org/map?&nfc",
        title: "BTC Map's map of the shops that accept contactless payment",
        allow: "geolocation",
        referrerPolicy: "no-referrer"
      })
    );
    const sandbox = String(frame?.props.sandbox).split(" ");
    expect(sandbox).toEqual(expect.arrayContaining(["allow-scripts", "allow-same-origin"]));
    // Never the web app's own page: it holds the wallet.
    expect(sandbox.filter((flag) => flag.startsWith("allow-top-navigation"))).toEqual([]);
    expect(screen.getByTestId("merchant-map-loading")).toBeTruthy();
    await act(async () => {
      frame?.props.onLoad();
    });
    expect(screen.queryByTestId("merchant-map-loading")).toBeNull();
  });
});
