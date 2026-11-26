import "@/i18n";

import { act, render, screen } from "@testing-library/react-native";
import { useEffect } from "react";
import { Text } from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";

import { closeAccount, updateAccount } from "@/features/account/session";
import { RecoveryCheckFrame } from "@/features/recovery-check/RecoveryCheckBanner";
import { nowUnix } from "@/lib/clock";

import { openMerchantAccount } from "../../jest/account";
import type * as FileSystemFake from "../../jest/expo-file-system";
import type * as RelaysFake from "../../jest/nostr-relays";

/*
 * The banner of the check of the 12 words over the app's screens (RecoveryCheckBanner.tsx): it
 * comes and goes without ever mounting the screens again, and takes the status bar's room.
 */

const fileSystem = jest.requireMock<typeof FileSystemFake>("expo-file-system");
const relays = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 }
};

/** A screen: how many times it was mounted, and the top of the safe area it gets. */
let mounts = 0;
function Screen() {
  const { top } = useSafeAreaInsets();
  useEffect(() => {
    mounts++;
  }, []);
  return <Text testID="screen-top">{top}</Text>;
}

async function show(shown: boolean) {
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <RecoveryCheckFrame shown={shown} onCheck={() => undefined}>
        <Screen />
      </RecoveryCheckFrame>
    </SafeAreaProvider>
  );
}

beforeEach(async () => {
  mounts = 0;
  fileSystem.resetFileSystem();
  relays.resetRelays();
  closeAccount();
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
  await openMerchantAccount();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("the banner of the check of the 12 words", () => {
  it("comes and goes without mounting the screen under it again", async () => {
    await show(true);
    expect(screen.queryByTestId("recovery-check-banner")).toBeNull();
    expect(screen.getByTestId("screen-top")).toHaveTextContent("47");

    await act(async () => {
      await updateAccount({ recoveryCheck: { verifiedAt: null, dueSince: nowUnix() } });
    });

    expect(screen.getByTestId("recovery-check-banner")).toBeTruthy();
    // The banner takes the status bar's room: the screen gets none of it.
    expect(screen.getByTestId("screen-top")).toHaveTextContent("0");

    await act(async () => {
      await updateAccount({ recoveryCheck: { verifiedAt: nowUnix(), dueSince: null } });
    });

    expect(screen.queryByTestId("recovery-check-banner")).toBeNull();
    expect(screen.getByTestId("screen-top")).toHaveTextContent("47");
    expect(mounts).toBe(1);
  });

  it("never shows where it may not (till mode, the check's own screens)", async () => {
    await updateAccount({ recoveryCheck: { verifiedAt: null, dueSince: nowUnix() } });

    await show(false);

    expect(screen.queryByTestId("recovery-check-banner")).toBeNull();
    expect(screen.getByTestId("screen-top")).toHaveTextContent("47");
  });
});
