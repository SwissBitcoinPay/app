import "@/i18n";

import { act, render, screen } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AddCardSteps } from "@/features/card/AddCardSteps";
import { LegacyCardFound } from "@/features/card/LegacyCardFound";
import { DockAreaProvider, ShellMain } from "@/features/navigation/dock-area";
import { PosFrame } from "@/features/terminal/PosFrame";
import { motion, space } from "@/theme";

import { bottomInsetOf } from "../../jest/layout";

// eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories are synchronous
jest.mock("react-native-nfc-manager", () => require("../../jest/nfc-manager"));
jest.mock("@/components/layout/useIsDesktop", () => ({
  ...jest.requireActual("@/components/layout/useIsDesktop"),
  useIsDesktop: () => false
}));

/*
 * Where the actions of a card's steps stand (CardStepsView.tsx, LegacyCardFound.tsx): on the
 * frame's bottom safe area, their margin above it, the safe area counted once (never 34 px above
 * the frame's own band). The sign-up's card step, its own frame: card-screen.test.tsx.
 */

/** An iPhone's home indicator. */
const HOME_INDICATOR = 34;

/** "Add a card" from "Cards" (PairCardScreen.tsx): a screen of the whole window. */
function Frame({ docked, children }: { docked: boolean; children: ReactNode }) {
  return (
    <DockAreaProvider docked={docked} hidden>
      <ShellMain style={{ flex: 1 }}>
        <PosFrame title="Add a card" flush="always">
          {children}
        </PosFrame>
      </ShellMain>
    </DockAreaProvider>
  );
}

const actions = {
  onStart: jest.fn(),
  onRetry: jest.fn(),
  onCancel: jest.fn(),
  onRecharge: jest.fn(),
  onLater: jest.fn()
};

const LEGACY = {
  url: "lnurlw://api.swiss-bitcoin-pay.ch/card?p=&c=",
  p: "0".repeat(32),
  c: "0".repeat(16),
  uid: "04aabbccddeeff",
  cardId: "ab".repeat(16)
};

describe("the actions of a card's steps", () => {
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

  async function settle() {
    // The dock's band eases in as the screen shows.
    await act(async () => {
      jest.advanceTimersByTime(motion.navDock * 2);
    });
  }

  it.each([
    ["a merchant's phone (the dock hidden)", true],
    ["a card holder's phone (no dock)", false]
  ])("stand on the safe area, on %s", async (_, docked) => {
    await render(
      <Frame docked={docked}>
        <AddCardSteps view={{ phase: "guide" }} actions={actions} />
      </Frame>
    );
    await settle();
    expect(bottomInsetOf(screen.getByTestId("add-card-start"))).toBe(HOME_INDICATOR + space[5]);
  });

  it("stand on the safe area when a v2 card is found", async () => {
    await render(
      <Frame docked>
        <LegacyCardFound
          card={LEGACY}
          amountSats={1000n}
          visual={null}
          onConfirm={jest.fn()}
          onCancel={jest.fn()}
        />
      </Frame>
    );
    await settle();
    expect(bottomInsetOf(screen.getByTestId("card-migrate-cancel"))).toBe(
      HOME_INDICATOR + space[5]
    );
  });
});
