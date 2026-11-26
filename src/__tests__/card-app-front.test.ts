// The marker of the app in front (src/lib/card/app-front.ts, useAppFrontMarker.ts), which the iOS
// notification service extension reads before it takes a card's wake: written while the app is
// active, refreshed, removed once it is not; a stale, future or foreign marker is none.
import { act, renderHook } from "@testing-library/react-native";
import { AppState, Platform } from "react-native";

import * as cardConfig from "@/config/card";
import { useAppFrontMarker } from "@/features/card/useAppFrontMarker";
import {
  APP_FRONT_DIR_NAME,
  APP_FRONT_FRESH_MS,
  APP_FRONT_REFRESH_MS,
  appInFront,
  clearAppInFront,
  markAppInFront
} from "@/lib/card/app-front";

import type * as FileSystemFake from "../../jest/expo-file-system";

const GROUP = "group.ch.swissbitcoinpay.checkout.staging.cards";
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    expoConfig: { extra: { cardAppGroup: "group.ch.swissbitcoinpay.checkout.staging.cards" } }
  }
}));

const fileSystem = jest.requireMock<typeof FileSystemFake>("expo-file-system");
const NOW = Date.UTC(2026, 10, 24, 9, 0);

function markerFile() {
  return new fileSystem.File(
    fileSystem.Paths.appleSharedContainers[GROUP],
    APP_FRONT_DIR_NAME,
    "front.json"
  );
}

/** AppState's listeners, called as React Native calls them. */
function appStates() {
  const listeners: ((state: string) => void)[] = [];
  jest.spyOn(AppState, "addEventListener").mockImplementation((_, listener) => {
    listeners.push(listener as (state: string) => void);
    return { remove: () => listeners.splice(listeners.indexOf(listener as never), 1) };
  });
  return (state: string) => {
    (AppState as { currentState: unknown }).currentState = state;
    for (const listener of [...listeners]) listener(state);
  };
}

beforeEach(() => {
  jest.replaceProperty(Platform, "OS", "ios");
  fileSystem.resetFileSystem();
  fileSystem.setSharedContainers([GROUP]);
  jest.replaceProperty(cardConfig, "IOS_EXTENSION_PAYS_CARDS", true);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("the app's in-front marker (app-front.ts)", () => {
  it("is in the app group's container, at names never changed, of format 1", () => {
    markAppInFront(NOW);
    expect(APP_FRONT_DIR_NAME).toBe("card-app");
    expect(JSON.parse(markerFile().textSync())).toEqual({ version: 1, at: NOW });
    expect(appInFront(NOW)).toBe(true);
  });

  it("holds APP_FRONT_FRESH_MS, never a marker dated ahead of the reader's clock, nor of another format", () => {
    markAppInFront(NOW);
    expect(appInFront(NOW + APP_FRONT_FRESH_MS)).toBe(true);
    expect(appInFront(NOW + APP_FRONT_FRESH_MS + 1)).toBe(false);
    expect(appInFront(NOW - 2_001)).toBe(false);
    for (const text of ['{"version":2,"at":1}', '{"version":1,"at":"now"}', "{ damaged"]) {
      markerFile().writeSync(text);
      expect(appInFront(NOW)).toBe(false);
    }
  });

  it("is removed, and none where the build has no app group", () => {
    markAppInFront(NOW);
    clearAppInFront();
    expect(markerFile().exists).toBe(false);
    expect(appInFront(NOW)).toBe(false);
    fileSystem.setSharedContainers([]);
    markAppInFront(NOW);
    expect(appInFront(NOW)).toBe(false);
  });
});

describe("useAppFrontMarker", () => {
  it("writes the marker while the app is active, again every APP_FRONT_REFRESH_MS, and removes it once not", async () => {
    jest.useFakeTimers({ now: NOW });
    const change = appStates();
    (AppState as { currentState: unknown }).currentState = "active";
    const { unmount } = await renderHook(() => useAppFrontMarker());
    expect(appInFront(Date.now())).toBe(true);
    await act(async () => jest.advanceTimersByTime(APP_FRONT_REFRESH_MS * 3));
    expect(JSON.parse(markerFile().textSync())).toEqual({ version: 1, at: Date.now() });
    await act(async () => change("inactive"));
    expect(markerFile().exists).toBe(false);
    await act(async () => jest.advanceTimersByTime(APP_FRONT_REFRESH_MS * 2));
    expect(markerFile().exists).toBe(false);
    await act(async () => change("active"));
    expect(appInFront(Date.now())).toBe(true);
    await unmount();
    expect(markerFile().exists).toBe(false);
  });

  it("writes nothing while the extension pays no card", async () => {
    jest.replaceProperty(cardConfig, "IOS_EXTENSION_PAYS_CARDS", false);
    appStates();
    (AppState as { currentState: unknown }).currentState = "active";
    await renderHook(() => useAppFrontMarker());
    expect(markerFile().exists).toBe(false);
  });
});
