import { THEME_KEY } from "@/features/appearance/theme-format";
import { markReleaseNotesSeen } from "@/features/release-notes/seen";
import {
  parseStoredSeen,
  RELEASE_NOTES_SEEN_KEY,
  serializeSeen
} from "@/features/release-notes/seen-format";
import { wipeDevice } from "@/features/settings/device-wipe";

import type * as SecureStoreFake from "../../jest/expo-secure-store";

const secureStore = jest.requireMock<typeof SecureStoreFake>("expo-secure-store");

// "What's new" opens by itself once per device: the release notes opened are the one thing a
// "Log out" leaves on it (device-wipe.ts).
describe('the release notes opened, at a "Log out"', () => {
  it("stay on the phone, the app's other keys gone", async () => {
    markReleaseNotesSeen("3.0.0");
    secureStore.items.set(THEME_KEY, "dark");
    await settle();
    expect(parseStoredSeen(secureStore.items.get(RELEASE_NOTES_SEEN_KEY) ?? null)).toBe("3.0.0");

    await wipeDevice();
    expect([...secureStore.items.keys()]).toEqual([RELEASE_NOTES_SEEN_KEY]);
    expect(parseStoredSeen(secureStore.items.get(RELEASE_NOTES_SEEN_KEY) ?? null)).toBe("3.0.0");
  });

  describe("in the browser", () => {
    const entries = new Map<string, string>();
    const web = jest.requireActual<typeof import("@/features/settings/device-wipe.web")>(
      "@/features/settings/device-wipe.web"
    );

    beforeAll(() => {
      Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        value: {
          getItem: (key: string) => entries.get(key) ?? null,
          setItem: (key: string, value: string) => void entries.set(key, String(value)),
          removeItem: (key: string) => void entries.delete(key),
          clear: () => entries.clear()
        }
      });
    });

    afterAll(() => {
      delete (globalThis as { localStorage?: unknown }).localStorage;
    });

    beforeEach(() => entries.clear());

    it("stay, every other entry gone", async () => {
      entries.set(RELEASE_NOTES_SEEN_KEY, serializeSeen("3.0.0"));
      entries.set(THEME_KEY, "dark");
      entries.set("terminal-profile", "{}");
      await web.wipeDevice();
      expect([...entries.keys()]).toEqual([RELEASE_NOTES_SEEN_KEY]);
      expect(parseStoredSeen(entries.get(RELEASE_NOTES_SEEN_KEY) ?? null)).toBe("3.0.0");
    });

    it("leave nothing when none was opened", async () => {
      entries.set(THEME_KEY, "dark");
      await web.wipeDevice();
      expect(entries.size).toBe(0);
    });
  });
});

async function settle(): Promise<void> {
  // The save of the notes opened is chained after the earlier ones (seen.ts).
  await new Promise((resolve) => setTimeout(resolve, 0));
}
