import "@/i18n";

import { act, render, screen, waitFor } from "@testing-library/react-native";
import { Platform } from "react-native";

import { NotificationsProvider } from "@/features/notifications/NotificationsProvider";
import { useCrashReportsSwitch } from "@/features/support/useCrashReportsSwitch";
import { OBSERVE_CHOICE_KEY, serializeObserveChoice } from "@/lib/observe/choice-format";
import { startObserve } from "@/lib/observe/observe";

import type * as SecureStoreFake from "../../jest/expo-secure-store";

/*
 * The "Send crash reports" switch while this device's choice is not read: it waits,
 * its loader in its knob (Switch's `loading`), unless Expo Observe never started, which never reads
 * it. Its use in "Settings" is tested with the settings (settings-screen.test.tsx). Observe starts
 * once per file, as once per app: the test without it comes first.
 */

const secureStore = jest.requireMock<typeof SecureStoreFake>("expo-secure-store");
const hidden = { includeHiddenElements: true };

function Control() {
  return <>{useCrashReportsSwitch(true).control}</>;
}

async function show() {
  await render(
    <NotificationsProvider>
      <Control />
    </NotificationsProvider>
  );
}

describe('the "Send crash reports" switch', () => {
  let platform: jest.ReplaceProperty<typeof Platform.OS>;
  beforeEach(() => {
    platform = jest.replaceProperty(Platform, "OS", "android");
  });
  afterEach(() => platform.restore());

  it("never waits without Expo Observe, which never reads the choice: greyed", async () => {
    await show();
    expect(screen.queryByTestId("support-reports-spinner", hidden)).toBeNull();
    expect(screen.getByTestId("support-reports").props.accessibilityState).toEqual({
      checked: false,
      disabled: true,
      busy: false
    });
  });

  it("waits, its loader in the switch, until this device's choice is read", async () => {
    secureStore.items.set(OBSERVE_CHOICE_KEY, serializeObserveChoice(false));
    const read = secureStore.getItemAsync.getMockImplementation()!;
    let release!: () => void;
    secureStore.getItemAsync.mockImplementation(async (key, options) => {
      if (key === OBSERVE_CHOICE_KEY) {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      }
      return read(key, options);
    });
    try {
      // As src/app/_layout.tsx does as the app starts.
      startObserve("staging");
      await show();
      expect(screen.getByTestId("support-reports-spinner", hidden)).toBeTruthy();
      expect(screen.getByTestId("support-reports").props.accessibilityState).toMatchObject({
        disabled: true,
        busy: true
      });
      await act(async () => release());
      // Off, as saved, over staging's default (on).
      await waitFor(() =>
        expect(screen.getByTestId("support-reports").props.accessibilityState).toEqual({
          checked: false,
          disabled: false,
          busy: false
        })
      );
      await waitFor(() =>
        expect(screen.queryByTestId("support-reports-spinner", hidden)).toBeNull()
      );
    } finally {
      secureStore.getItemAsync.mockImplementation(read);
    }
  });
});
