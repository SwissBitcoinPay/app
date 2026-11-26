import "@/i18n";

import { render, renderHook, screen, act, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { Platform, Text } from "react-native";

import { AppLock } from "@/features/app-lock/AppLock";
import { serializeAppLock, APP_LOCK_KEY } from "@/features/app-lock/preference-format";
import { useAppLockSwitch } from "@/features/app-lock/useAppLockSwitch";
import { NotificationsProvider } from "@/features/notifications/NotificationsProvider";
import { saveTerminalProfile } from "@/lib/terminal/profile";

import { testBackupKey } from "../../jest/account";
import type * as LocalAuthenticationFake from "../../jest/expo-local-authentication";
import type * as SecureStoreFake from "../../jest/expo-secure-store";

/*
 * The app's own lock (src/features/app-lock/AppLock.tsx): the apps only. Its behaviour in the app
 * is tested with the navigation (navigation.test.tsx); here, what the web app does not have.
 */

const localAuth = jest.requireMock<typeof LocalAuthenticationFake>("expo-local-authentication");
const secureStore = jest.requireMock<typeof SecureStoreFake>("expo-secure-store");

// Wallet id: the public key of the private key 2, a well-known test value.
const WALLET = "02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5";

function Locked({ children }: { children: ReactNode }) {
  return (
    <NotificationsProvider>
      <AppLock>{children}</AppLock>
    </NotificationsProvider>
  );
}

/** An owner's point of sale. */
function profile() {
  return {
    version: 2 as const,
    walletId: WALLET,
    backupKey: testBackupKey(),
    lightningAddress: "sattleme02c6047f94@breez.tips",
    businessName: "Fine Bakery",
    currency: "CHF"
  };
}

describe("the app's own lock on the web", () => {
  let platform: jest.ReplaceProperty<typeof Platform.OS>;
  beforeEach(async () => {
    // An owner's point of sale, the lock turned on: the web keeps none and asks nothing all the
    // same.
    await saveTerminalProfile(profile());
    secureStore.items.set(APP_LOCK_KEY, serializeAppLock(true));
    platform = jest.replaceProperty(Platform, "OS", "web");
  });
  afterEach(() => platform.restore());

  it("never hides the web app, nor asks anything", async () => {
    await render(
      <Locked>
        <Text testID="inside">Till</Text>
      </Locked>
    );
    await act(async () => undefined);
    expect(screen.getByTestId("inside")).toBeTruthy();
    expect(screen.queryByTestId("app-lock")).toBeNull();
    expect(localAuth.prompts()).toBe(0);
  });

  it('offers no choice in "Settings"', async () => {
    const { result } = await renderHook(() => useAppLockSwitch(profile(), true), {
      wrapper: Locked
    });
    expect(result.current.visible).toBe(false);
  });
});

describe('the app\'s own lock in "Settings", in the apps', () => {
  let platform: jest.ReplaceProperty<typeof Platform.OS>;
  beforeEach(() => {
    platform = jest.replaceProperty(Platform, "OS", "ios");
  });
  afterEach(() => platform.restore());

  function Control() {
    return <>{useAppLockSwitch(profile(), true).control}</>;
  }

  it("waits for this device's choice, its loader in the switch, until it is read", async () => {
    secureStore.items.set(APP_LOCK_KEY, serializeAppLock(true));
    const read = secureStore.getItemAsync.getMockImplementation()!;
    let release!: () => void;
    secureStore.getItemAsync.mockImplementation(async (key, options) => {
      if (key === APP_LOCK_KEY) {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      }
      return read(key, options);
    });
    try {
      await render(
        <NotificationsProvider>
          <Control />
        </NotificationsProvider>
      );
      const hidden = { includeHiddenElements: true };
      // Not read yet: the switch waits.
      expect(screen.getByTestId("unlock-asks-switch-spinner", hidden)).toBeTruthy();
      expect(screen.getByTestId("unlock-asks-switch").props.accessibilityState).toMatchObject({
        disabled: true,
        busy: true
      });
      await act(async () => release());
      await waitFor(() =>
        expect(screen.getByTestId("unlock-asks-switch").props.accessibilityState).toEqual({
          checked: true,
          disabled: false,
          busy: false
        })
      );
      await waitFor(() =>
        expect(screen.queryByTestId("unlock-asks-switch-spinner", hidden)).toBeNull()
      );
    } finally {
      secureStore.getItemAsync.mockImplementation(read);
    }
  });
});
