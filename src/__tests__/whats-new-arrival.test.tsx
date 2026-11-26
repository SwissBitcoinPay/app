import "@/i18n";

import { act, renderHook } from "@testing-library/react-native";

import { NEXT, shownReleases } from "@/features/release-notes/releases";
import { markReleaseNotesSeen } from "@/features/release-notes/seen";
import { parseStoredSeen, RELEASE_NOTES_SEEN_KEY } from "@/features/release-notes/seen-format";
import {
  OPENS_ON_ARRIVAL,
  useWhatsNewOnArrival
} from "@/features/release-notes/useWhatsNewOnArrival";
import { type AppInfo, getAppInfo } from "@/lib/app-info";

import type * as SecureStoreFake from "../../jest/expo-secure-store";

jest.mock("../lib/app-info", () => ({
  ...jest.requireActual("../lib/app-info"),
  getAppInfo: jest.fn()
}));

// The released 3.0.0's notes, whatever release-notes/ holds today.
jest.mock("../features/release-notes/releases", () => {
  const actual = jest.requireActual("../features/release-notes/releases");
  return {
    ...actual,
    shownReleases: jest.fn((info: Pick<AppInfo, "variant" | "version">) =>
      actual.shownReleases(info, [{ version: "3.0.0", date: "2026-12-02" }], false)
    )
  };
});

const secureStore = jest.requireMock<typeof SecureStoreFake>("expo-secure-store");
const stored = () => parseStoredSeen(secureStore.items.get(RELEASE_NOTES_SEEN_KEY) ?? null);

function appVersion(version: string, variant = "production") {
  jest.mocked(getAppInfo).mockReturnValue({
    version,
    variant,
    buildNumber: null,
    commit: null,
    updates: null
  });
}

beforeEach(() => {
  // Never opened on this device: the store empty (jest.after-env.ts).
  appVersion(OPENS_ON_ARRIVAL);
});

describe('"What\'s new" opened by itself', () => {
  it("is 3.0.0's, the new app's", () => {
    expect(OPENS_ON_ARRIVAL).toBe("3.0.0");
  });

  it("opens on the arrival at the point of sale, its notes marked new, then remembered", async () => {
    const { result, rerender } = await renderHook(
      ({ arrived }: { arrived: boolean }) => useWhatsNewOnArrival(arrived),
      { initialProps: { arrived: false } }
    );
    expect(result.current.visible).toBe(false);
    await rerender({ arrived: true });
    expect(result.current).toMatchObject({ visible: true, fresh: "3.0.0", holding: true });
    await act(async () => undefined);
    expect(stored()).toBe("3.0.0");

    await act(async () => result.current.close());
    expect(result.current).toMatchObject({ visible: false, holding: false });
    // Arriving there again: never by itself a second time.
    await rerender({ arrived: false });
    await rerender({ arrived: true });
    expect(result.current.visible).toBe(false);
  });

  it("opens only the first time: never once opened on this device, from the label too", async () => {
    markReleaseNotesSeen("3.0.0");
    const { result } = await renderHook(() => useWhatsNewOnArrival(true));
    expect(result.current).toMatchObject({ visible: false, holding: false });
  });

  it("opens for 3.0.0's notes even when older notes were opened", async () => {
    markReleaseNotesSeen("2.9.0");
    const { result } = await renderHook(() => useWhatsNewOnArrival(true));
    expect(result.current.visible).toBe(true);
  });

  it("never opens in another version, its dot alone telling the new notes", async () => {
    for (const version of ["3.0.1", "3.1.0", "2.9.0"]) {
      appVersion(version);
      const { result, unmount } = await renderHook(() => useWhatsNewOnArrival(true));
      expect({ version, ...result.current }).toMatchObject({
        version,
        visible: false,
        holding: false
      });
      await unmount();
    }
    expect(stored()).toBeNull();
  });

  it("holds another panel only while it is about to open, or open", async () => {
    const away = await renderHook(() => useWhatsNewOnArrival(false));
    // Not at the point of sale: "Stay informed" may show meanwhile.
    expect(away.result.current.holding).toBe(false);
    await away.unmount();
    const here = await renderHook(() => useWhatsNewOnArrival(true));
    expect(here.result.current.holding).toBe(true);
  });

  it("opens the next version's notes in a staging app of 3.0.0", async () => {
    appVersion(OPENS_ON_ARRIVAL, "staging");
    jest
      .mocked(shownReleases)
      .mockReturnValueOnce([{ key: NEXT, version: null, date: null }])
      .mockReturnValueOnce([{ key: NEXT, version: null, date: null }]);
    const { result } = await renderHook(() => useWhatsNewOnArrival(true));
    expect(result.current).toMatchObject({ visible: true, fresh: NEXT });
  });
});
