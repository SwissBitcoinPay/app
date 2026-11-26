import { act, renderHook, waitFor } from "@testing-library/react-native";
import { Platform, Share } from "react-native";

import { DEFAULT_RELAYS } from "@/config/relays";
import {
  APP_LOCK_KEY,
  parseAppLock,
  serializeAppLock
} from "@/features/app-lock/preference-format";
import { loadAppLock, saveAppLock, useAppLockChoice } from "@/features/app-lock/preference";
import { useCameraAsked } from "@/features/media/camera-permission";
import { wipeDevice } from "@/features/settings/device-wipe";
import {
  leavingForSystemUi,
  SYSTEM_UI_EXPECTED_MS,
  expectSystemUi,
  shareWithSystem,
  withSystemUi,
  type SystemUiDeparture
} from "@/lib/system-ui";
import { readLog } from "@/lib/log/log";
import type { MerchantSettings } from "@/lib/settings/merchant";
import { saveMerchantSettings } from "@/lib/settings/store";

import type * as CameraFake from "../../jest/expo-camera";
import type * as FileSystemFake from "../../jest/expo-file-system";
import type * as SecureStoreFake from "../../jest/expo-secure-store";

/*
 * "Ask for biometrics to unlock the app" (app-lock/preference.ts): this device's choice, a
 * business's device's only (a card holder's has none), off by default; and what the app opens over
 * itself, which its lock does
 * not take for a departure (src/lib/system-ui.ts).
 */

const fileSystem = jest.requireMock<typeof FileSystemFake>("expo-file-system");
const secureStore = jest.requireMock<typeof SecureStoreFake>("expo-secure-store");

// Wallet id: the public key of the private key 2, a well-known test value.
const WALLET = "02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5";
const SETTINGS_FILE = `file:///data/user/0/ch.swissbitcoinpay.checkout.staging/files/merchant-settings/${WALLET}.json`;

const settings: MerchantSettings = {
  version: 18,
  recoveryCheck: { verifiedAt: null, dueSince: null },
  bitcoinNode: null,
  productLookup: true,
  splitSince: 1790000000,
  legacyTransfers: [],
  businessAddress: null,
  companyNumber: "",
  vatNumber: "",
  vatRate: null,
  onchainTolerance: 0,
  formerAddressMetadata: [],
  updatedAt: 1790000000,
  signUp: "done",
  businessName: "Fine Bakery",
  usage: "merchant",
  bitcoinPercent: 100,
  payoutCurrency: "CHF",
  displayCurrency: "CHF",
  detectedCountry: "CH",
  payoutAccountId: null,
  onchainPayments: true,
  relays: [...DEFAULT_RELAYS],
  devices: [],
  logo: null
};

beforeEach(() => fileSystem.resetFileSystem());

describe('"Ask for biometrics to unlock the app"', () => {
  it("keeps its name and format: installed apps read them", () => {
    expect(APP_LOCK_KEY).toBe("app-lock");
    expect(serializeAppLock(false)).toBe('{"version":1,"biometrics":false}');
    expect(parseAppLock('{"version":1,"biometrics":true}')).toBe(true);
    expect(parseAppLock('{"version":1,"biometrics":false}')).toBe(false);
    // Damaged, or a newer app's: its default.
    for (const stored of ["", "{", "null", '{"version":2,"biometrics":false}', '{"version":1}']) {
      expect(parseAppLock(stored)).toBeNull();
    }
    expect(parseAppLock('{"version":1,"biometrics":"no"}')).toBeNull();
    expect(parseAppLock(null)).toBeNull();
  });

  it("is not asked by default on a business's device", async () => {
    await saveMerchantSettings(WALLET, settings);
    await expect(loadAppLock(WALLET)).resolves.toBe(false);
  });

  it("is asked when the device's settings cannot tell: none, or a newer app's", async () => {
    await expect(loadAppLock(WALLET)).resolves.toBe(true);
    fileSystem.files.set(SETTINGS_FILE, JSON.stringify({ ...settings, version: 99 }));
    await expect(loadAppLock(WALLET)).resolves.toBe(true);
    expect(readLog().entries.map((entry) => entry.event)).toContain(
      "Reading the settings for the app lock failed"
    );
  });

  it("takes its default when what this device saved is damaged or a newer app's", async () => {
    await saveMerchantSettings(WALLET, settings);
    secureStore.items.set(APP_LOCK_KEY, '{"version":7,"biometrics":true}');
    await expect(loadAppLock(WALLET)).resolves.toBe(false);
    fileSystem.resetFileSystem();
    secureStore.items.set(APP_LOCK_KEY, "{");
    await expect(loadAppLock(WALLET)).resolves.toBe(true);
  });

  it("keeps the holder's choice over its default, and tells every screen that follows it", async () => {
    await saveMerchantSettings(WALLET, settings);
    const { result } = await renderHook(() => useAppLockChoice(WALLET));
    await waitFor(() => expect(result.current).toBe(false));
    await act(async () => {
      await saveAppLock(WALLET, true);
    });
    expect(result.current).toBe(true);
    expect(parseAppLock(secureStore.items.get(APP_LOCK_KEY) ?? null)).toBe(true);
    await expect(loadAppLock(WALLET)).resolves.toBe(true);
  });

  it("is never asked without an account (an employee's device)", async () => {
    const { result } = await renderHook(() => useAppLockChoice(null));
    expect(result.current).toBe(false);
  });

  it('goes with "Log out", a next account starting from its own default', async () => {
    await saveMerchantSettings(WALLET, settings);
    await saveAppLock(WALLET, true);
    await wipeDevice();
    expect(secureStore.items.has(APP_LOCK_KEY)).toBe(false);
    // The next account, a business's: its settings saved on the device again.
    await saveMerchantSettings(WALLET, settings);
    await expect(loadAppLock(WALLET)).resolves.toBe(false);
  });

  it("is never asked on the web, which keeps nothing of it", async () => {
    const store = jest.requireActual<typeof import("@/features/app-lock/preference-store")>(
      "../features/app-lock/preference-store.web"
    );
    await expect(store.readAppLock()).resolves.toBe(false);
    await expect(store.writeAppLock(true)).rejects.toThrow("no lock of its own");
  });
});

describe("what the app opens over itself (system-ui.ts)", () => {
  /** Runs `run` as on an Android device. */
  async function onAndroid<T>(run: () => Promise<T>): Promise<T> {
    const android = jest.replaceProperty(Platform, "OS", "android");
    try {
      return await run();
    } finally {
      android.restore();
    }
  }

  it("is not a departure while it shows on Android, and only it", async () => {
    await onAndroid(async () => {
      expect(leavingForSystemUi()).toBeNull();
      let during: SystemUiDeparture = null;
      await withSystemUi(async () => {
        during = leavingForSystemUi();
      });
      expect(during).toBe("trip");
      expect(leavingForSystemUi()).toBeNull();
      // Its end, failed too.
      await expect(
        withSystemUi(async () => {
          throw new Error("Dismissed");
        })
      ).rejects.toThrow("Dismissed");
      expect(leavingForSystemUi()).toBeNull();
    });
  });

  it("is a departure on iOS, which shows it within the app: leaving meanwhile is leaving", async () => {
    const ios = jest.replaceProperty(Platform, "OS", "ios");
    try {
      let during: SystemUiDeparture = "trip";
      await withSystemUi(async () => {
        during = leavingForSystemUi();
      });
      expect(during).toBeNull();
    } finally {
      ios.restore();
    }
  });

  it("is told once for the system's settings, and only for a while", () => {
    expectSystemUi();
    expect(leavingForSystemUi()).toBe("trip");
    // The holder's next departure is theirs.
    expect(leavingForSystemUi()).toBeNull();
    expectSystemUi();
    const later = jest.spyOn(Date, "now").mockReturnValue(Date.now() + SYSTEM_UI_EXPECTED_MS + 1);
    expect(leavingForSystemUi()).toBeNull();
    later.mockRestore();
  });

  it("is the share sheet: announced on Android, which resolves before the app leaves", async () => {
    const share = jest.spyOn(Share, "share");
    try {
      await onAndroid(async () => {
        share.mockResolvedValueOnce({ action: Share.sharedAction, activityType: undefined });
        await shareWithSystem({ message: "lightning:lnbc1" });
        expect(leavingForSystemUi()).toBe("trip");
        expect(leavingForSystemUi()).toBeNull();
      });
      // iOS shows it within the app: leaving while it shows is leaving.
      const ios = jest.replaceProperty(Platform, "OS", "ios");
      try {
        let during: SystemUiDeparture = "trip";
        share.mockImplementationOnce(async () => {
          during = leavingForSystemUi();
          return { action: Share.dismissedAction, activityType: undefined };
        });
        await shareWithSystem({ message: "lightning:lnbc1" });
        expect(during).toBeNull();
      } finally {
        ios.restore();
      }
    } finally {
      share.mockRestore();
    }
  });

  it("is the camera's permission prompt, asked as a scanner shows and by its button", async () => {
    const camera = jest.requireMock<typeof CameraFake>("expo-camera");
    const during: SystemUiDeparture[] = [];
    const hook = jest.spyOn(camera, "useCameraPermissions").mockImplementation(
      () =>
        [
          { ...camera.permission },
          async () => {
            during.push(leavingForSystemUi());
            return { ...camera.permission };
          },
          async () => ({ ...camera.permission })
        ] as const
    );
    try {
      await onAndroid(async () => {
        const { result } = await renderHook(() => useCameraAsked());
        await act(async () => undefined);
        // Never asked by expo-camera itself, outside the trip.
        expect(hook).toHaveBeenCalledWith({ get: false });
        expect(during).toEqual(["trip"]);
        expect(leavingForSystemUi()).toBeNull();
        await act(async () => result.current[1]());
        expect(during).toEqual(["trip", "trip"]);
        expect(leavingForSystemUi()).toBeNull();
      });
    } finally {
      hook.mockRestore();
    }
  });

  it("logs a camera prompt that failed", async () => {
    // Expected: logFailure writes it to the console in development too.
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const camera = jest.requireMock<typeof CameraFake>("expo-camera");
    const hook = jest
      .spyOn(camera, "useCameraPermissions")
      .mockImplementation(
        () =>
          [
            null,
            () => Promise.reject(new Error("No activity")),
            async () => ({ ...camera.permission })
          ] as unknown as ReturnType<typeof camera.useCameraPermissions>
      );
    try {
      await renderHook(() => useCameraAsked());
      await act(async () => undefined);
      expect(readLog().entries.map((entry) => entry.event)).toContain(
        "Asking for the camera failed"
      );
      expect(leavingForSystemUi()).toBeNull();
    } finally {
      hook.mockRestore();
      warn.mockRestore();
    }
  });
});
