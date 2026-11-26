import "@/i18n";

import { act, renderRouter, screen } from "expo-router/testing-library";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { MerchantMapScreen } from "@/features/card/MerchantMapScreen";
import { isMobileEdgeToEdgeRoute } from "@/features/navigation/destinations";
import { DockAreaProvider, ShellMain } from "@/features/navigation/dock-area";
import { motion } from "@/theme";

import { bottomInsetOf } from "../../jest/layout";

jest.mock("@/components/layout/useIsDesktop", () => ({
  ...jest.requireActual("@/components/layout/useIsDesktop"),
  useIsDesktop: () => false
}));

/*
 * "Where to pay with your card"'s map down to the window's bottom edge on a phone (never a band of
 * the app's background below it). BTC Map's page keeps its own controls above the home indicator
 * (isMobileEdgeToEdgeRoute). Through the shell: cards-screen.test.tsx.
 */

/** An iPhone's home indicator. */
const HOME_INDICATOR = 34;

/** The map's screen in the shell, as AppShell draws it on a phone (the dock hidden or none). */
function open(docked: boolean) {
  return renderRouter(
    {
      "cards/map": () => (
        <DockAreaProvider docked={docked} hidden>
          <ShellMain style={{ flex: 1 }} toWindowEdge={isMobileEdgeToEdgeRoute("/cards/map")}>
            <MerchantMapScreen />
          </ShellMain>
        </DockAreaProvider>
      )
    },
    { initialUrl: "/cards/map" }
  );
}

describe("the merchants' map's bottom", () => {
  const insets = jest.mocked(useSafeAreaInsets);
  const original = insets.getMockImplementation();

  beforeEach(() => {
    jest.useFakeTimers();
    insets.mockReturnValue({ top: 47, right: 0, bottom: HOME_INDICATOR, left: 0 });
  });

  afterEach(() => {
    jest.useRealTimers();
    insets.mockImplementation(original);
  });

  it.each([
    ["a merchant's phone (the dock hidden)", true],
    ["a card holder's phone (no dock)", false]
  ])("reaches the window's bottom edge, on %s", async (_, docked) => {
    await open(docked);
    // The shell's band below a hidden dock eases in as the screen shows: none here, once eased.
    await act(async () => {
      jest.advanceTimersByTime(motion.navDock * 2);
    });
    expect(bottomInsetOf(screen.getByTestId("merchant-map-view"))).toBe(0);
  });

  it("is the only route of the whole window that reaches it", () => {
    expect(isMobileEdgeToEdgeRoute("/cards/map")).toBe(true);
    for (const route of ["/cards", "/cards/mapping", "/cards/pair", "/wallet/invoice/new"]) {
      expect(isMobileEdgeToEdgeRoute(route)).toBe(false);
    }
  });
});
