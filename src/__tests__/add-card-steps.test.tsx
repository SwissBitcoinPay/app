import "@/i18n";

import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Linking, Platform } from "react-native";

import {
  DEFAULT_CARD_DAY_SATS,
  DEFAULT_CARD_PAYMENTS_PER_HOUR,
  DEFAULT_CARD_PAYMENT_SATS,
  DEFAULT_CARD_RELAY_HOST
} from "@/config/card";
import { AddCardSteps, type AddCardActions } from "@/features/card/AddCardSteps";
import { MigrationSteps, type MigrationRun } from "@/features/card/MigrationSteps";
import type { PairingStep } from "@/features/card/pairing";
import type { MigrationShown, PairingView } from "@/features/card/useCardPairing";
import type { CardState } from "@/lib/card/card-record";

import type * as NfcFake from "../../jest/nfc-manager";

// eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories are synchronous
jest.mock("react-native-nfc-manager", () => require("../../jest/nfc-manager"));

const nfc = jest.requireMock<typeof NfcFake>("react-native-nfc-manager");

/*
 * "Add a card" and a v2 card's migration, their steps as each state of the pairing shows
 * them (AddCardSteps.tsx, MigrationSteps.tsx): where a failure is said, what is said of the card,
 * what can be done. The flows themselves, against the fakes: cards-screen.test.tsx,
 * card-screen.test.tsx, card-migration*.test.ts*.
 */

const CARD_ID = "ab".repeat(16);

const CARD: CardState = {
  cardId: CARD_ID,
  uid: "04aabbccddeeff",
  keyVersion: 1,
  status: "active",
  relayHost: DEFAULT_CARD_RELAY_HOST,
  lastCounter: 0,
  depositedThrough: 0,
  maxPaymentSats: DEFAULT_CARD_PAYMENT_SATS,
  maxDaySats: DEFAULT_CARD_DAY_SATS,
  maxPaymentsPerHour: DEFAULT_CARD_PAYMENTS_PER_HOUR,
  suspended: false,
  name: "",
  look: null,
  issuer: null,
  settingsAt: 1,
  walletGeneration: 1,
  updatedAt: 1
};

type StepsView = Extract<PairingView, { phase: "guide" | "running" | "failed" | "paired" }>;

function actions(more: Partial<AddCardActions> = {}): AddCardActions {
  return {
    onStart: jest.fn(),
    onRetry: jest.fn(),
    onCancel: jest.fn(),
    onRecharge: jest.fn(),
    onLater: jest.fn(),
    ...more
  };
}

async function showSteps(view: StepsView, more: Partial<AddCardActions> = {}) {
  await render(<AddCardSteps view={view} actions={actions(more)} />);
}

function failed(
  reason: Extract<PairingView, { phase: "failed" }>["reason"],
  step: Extract<PairingView, { phase: "failed" }>["step"],
  touched = false
): StepsView {
  return { phase: "failed", reason, step, touched, migration: null };
}

/** The step titled `title`, as screen readers say it: its title, its state, then its caption. */
function stepSaid(title: string): string {
  return String(screen.getByLabelText(new RegExp(`^${title}: `)).props.accessibilityLabel);
}

function title(): string {
  return String(screen.getByTestId("card-steps-title").props.children);
}

beforeEach(() => {
  nfc.resetNfcManager();
});

describe('"Add a card", its steps', () => {
  it('before "Start": the steps to come on the first screen, each saying what it asks', async () => {
    const onStart = jest.fn();
    await showSteps({ phase: "guide" }, { onStart });
    expect(title()).toBe("Before you start");
    expect(screen.getByTestId("card-steps-subtitle")).toHaveTextContent(
      "A blank BoltCard. A card from the former app is migrated, with its balance."
    );
    // Each says what it will do, never what it has not done ("Notifications allowed").
    expect(stepSaid("Notification permission")).toBe(
      "Notification permission: to come, Allow them when the phone asks: they are how it learns that a till reads the card."
    );
    expect(stepSaid("Card's relay check")).toBe(
      `Card's relay check: to come, ${DEFAULT_CARD_RELAY_HOST}`
    );
    expect(stepSaid("Holding the card")).toMatch(
      /^Holding the card: to come, (Above the phone|Against the back of the phone)/
    );
    expect(stepSaid("Card programming")).toMatch(/^Card programming: to come, /);
    expect(stepSaid("Card activation")).toMatch(/^Card activation: to come, /);
    // One way on: "Start"; the header leads out.
    expect(screen.queryByTestId("card-steps-cancel")).toBeNull();
    await fireEvent.press(screen.getByTestId("add-card-start"));
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('before "Start" only, offers the shop where cards are ordered, in the browser', async () => {
    const opened = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    try {
      await showSteps({ phase: "guide" });
      expect(screen.getByRole("header", { name: "Choose your card" })).toBeTruthy();
      await fireEvent.press(screen.getByRole("button", { name: "Order cards" }));
      expect(opened).toHaveBeenCalledWith("https://shop.sattle.me");
    } finally {
      opened.mockRestore();
    }
    // Under way, failed or done: the card is in hand already.
    const others: StepsView[] = [
      { phase: "running", step: "card" },
      failed("cardLost", "card", true),
      { phase: "paired", card: CARD, activation: { status: "ready", pending: 3 }, migrated: null }
    ];
    for (const view of others) {
      await screen.unmount();
      await showSteps(view);
      expect(screen.queryByTestId("card-shop")).toBeNull();
    }
  });

  it("says why the notifications are asked while they are, and only why once allowed", async () => {
    await showSteps({ phase: "running", step: "notifications" });
    expect(stepSaid("Allowing notifications")).toMatch(/: in progress, Allow them when/);
    await showSteps({ phase: "running", step: "relay" });
    expect(stepSaid("Notifications allowed")).toBe(
      "Notifications allowed: done, That is how your phone learns that a till reads the card"
    );
  });

  // A step never says what it has not reached.
  it("says of each step what it does while it runs, never that it is done", async () => {
    const running: [PairingStep, string][] = [
      ["notifications", "Allowing notifications"],
      ["relay", "Checking the card's relay"],
      ["card", "Waiting for the card"],
      ["programming", "Programming the card"],
      ["activating", "Activating the card"]
    ];
    for (const [step, said] of running) {
      await showSteps({ phase: "running", step });
      expect(stepSaid(said)).toMatch(/: in progress/);
      await screen.unmount();
    }
  });

  it("says each step done once the card is added, the activation included", async () => {
    await showSteps({
      phase: "paired",
      card: CARD,
      activation: { status: "ready", pending: 3 },
      migrated: null
    });
    for (const said of [
      "Notifications allowed",
      "Card's relay reachable",
      "Card held to the phone",
      "Card programmed",
      "Card activated"
    ]) {
      expect(stepSaid(said)).toMatch(/: done/);
    }
  });

  it("says of a failed step what it did not do, where its failure has no title of its own", async () => {
    const failures: [PairingStep, string][] = [
      ["notifications", "Notifications not allowed"],
      ["relay", "Card's relay not checked"],
      ["card", "Card not recognized"],
      ["programming", "Card not programmed"],
      ["activating", "Card not activated"]
    ];
    for (const [step, said] of failures) {
      await showSteps(failed("failed", step, true));
      expect(stepSaid(said)).toBe(`${said}: failed, Adding the card failed: try again`);
      await screen.unmount();
    }
  });

  it("never says a card activated that its relay has not taken yet, and says so of one without push", async () => {
    await showSteps({
      phase: "paired",
      card: CARD,
      activation: { status: "unreachable" },
      migrated: null
    });
    expect(stepSaid("Activation to finish")).toMatch(/^Activation to finish: to check/);
    expect(screen.queryByLabelText(/^Card activated/)).toBeNull();
    await screen.unmount();

    // It pays while the app shows: activated, to check.
    await showSteps({
      phase: "paired",
      card: CARD,
      activation: { status: "noPush", pending: 3 },
      migrated: null
    });
    expect(stepSaid("Card activated")).toMatch(/^Card activated: to check/);
  });

  it("never lets a step's mark be flattened, whatever its state (square ticks on Android)", async () => {
    await showSteps({ phase: "running", step: "programming" });
    for (const key of ["notifications", "relay", "card", "programming", "activating"]) {
      const mark = screen.getByTestId(`card-step-${key}`).children[0];
      expect(typeof mark === "string" ? null : mark.props.collapsable).toBe(false);
    }
  });

  it("makes a step's mark again when its state changes, never updating the former one", async () => {
    const mark = () => screen.getByTestId("card-step-relay").children[0];
    const { rerender } = await render(
      <AddCardSteps view={{ phase: "running", step: "relay" }} actions={actions()} />
    );
    const running = mark();
    await rerender(<AddCardSteps view={{ phase: "running", step: "relay" }} actions={actions()} />);
    // Its state the same: the same view (compared as a boolean: Jest cannot print a view).
    expect(mark() === running).toBe(true);
    await rerender(<AddCardSteps view={{ phase: "running", step: "card" }} actions={actions()} />);
    expect(stepSaid("Card's relay reachable")).toMatch(/: done, /);
    expect(mark() === running).toBe(false);
  });

  it("waiting for an attempt left to stop: every step to come, nothing said to run", async () => {
    await showSteps({ phase: "running", step: null });
    expect(title()).toBe("Preparing…");
    for (const step of [
      "Notification permission",
      "Card's relay check",
      "Holding the card",
      "Card programming",
      "Card activation"
    ]) {
      expect(stepSaid(step)).toMatch(new RegExp(`^${step}: to come`));
    }
    expect(screen.getByTestId("card-steps-cancel")).toHaveTextContent("Cancel");
  });

  it("says a relay unreachable at its step, with its host, and that nothing was written", async () => {
    await showSteps(failed("relayUnreachable", "relay"));
    expect(title()).toBe("The card was not added");
    expect(stepSaid("Notifications allowed")).toMatch(/: done/);
    expect(stepSaid("Relay unreachable")).toMatch(
      new RegExp(`: failed, ${DEFAULT_CARD_RELAY_HOST.replace(/\./g, "\\.")} does not answer`)
    );
    expect(stepSaid("Holding the card")).toMatch(/: to come$/);
    expect(screen.getByTestId("card-steps-subtitle")).toHaveTextContent(
      "Nothing was written to the card"
    );
  });

  it("says a failure of no step under the steps (the account's session closed)", async () => {
    await showSteps(failed("noAccount", null));
    expect(screen.getByTestId("add-card-failure")).toBeTruthy();
    expect(stepSaid("Notification permission")).toMatch(/: to come$/);
  });

  it("never says nothing was written once an attempt had the card, and says it goes on", async () => {
    await showSteps(failed("cardLost", "programming", true));
    expect(stepSaid("Card moved away too early")).toMatch(/: failed/);
    expect(screen.getByTestId("card-steps-subtitle")).toHaveTextContent(
      "It will resume where it stopped"
    );
    expect(screen.queryByText("Nothing was written to the card")).toBeNull();
    // Stopped: nothing is written to the card any more, the failure may be left.
    expect(screen.getByTestId("card-steps-cancel")).toBeTruthy();
  });

  it("opens the app's settings from notifications refused", async () => {
    const settings = jest.spyOn(Linking, "openSettings").mockResolvedValue(undefined);
    try {
      await showSteps(failed("notificationsDenied", "notifications"));
      expect(stepSaid("Notifications refused")).toMatch(/Allow them in the phone's settings/);
      await fireEvent.press(screen.getByText("Open settings"));
      expect(settings).toHaveBeenCalledTimes(1);
    } finally {
      settings.mockRestore();
    }
  });

  it("offers Android's NFC settings on a phone with NFC only, never on one without", async () => {
    const os = jest.replaceProperty(Platform, "OS", "android");
    try {
      await showSteps(failed("nfcUnavailable", "notifications"));
      // Said at the card's step, whatever ran.
      expect(stepSaid("NFC unavailable")).toMatch(/: failed/);
      await fireEvent.press(await screen.findByText("Open settings"));
      expect(nfc.calls).toContain("goToNfcSetting");
      await screen.unmount();

      nfc.removeNfc();
      await showSteps(failed("nfcUnavailable", "notifications"));
      expect(stepSaid("NFC unavailable")).toMatch(/: failed/);
      // Its check answered (no NFC at all): no button.
      await act(async () => undefined);
      expect(screen.queryByText("Open settings")).toBeNull();
    } finally {
      os.restore();
    }
  });

  it("has its two ways out wait while the sign-up saves: the one pressed, and the other", async () => {
    const paired: StepsView = {
      phase: "paired",
      card: CARD,
      activation: { status: "ready", pending: 3 },
      migrated: null
    };
    await showSteps(paired, { finishing: "later" });
    expect(screen.getByTestId("card-steps-cancel").props.accessibilityState).toMatchObject({
      disabled: true,
      busy: true
    });
    expect(screen.getByTestId("card-steps-primary").props.accessibilityState).toMatchObject({
      disabled: true,
      busy: false
    });
    await screen.unmount();

    await showSteps(paired, { finishing: "recharge" });
    expect(screen.getByTestId("card-steps-primary").props.accessibilityState).toMatchObject({
      disabled: true,
      busy: true
    });
    expect(screen.getByTestId("card-steps-cancel").props.accessibilityState).toMatchObject({
      disabled: true,
      busy: false
    });
    await screen.unmount();

    const onLater = jest.fn();
    await showSteps(paired, { onLater });
    expect(screen.getByTestId("card-steps-primary")).toBeEnabled();
    await fireEvent.press(screen.getByText("Later"));
    expect(onLater).toHaveBeenCalledWith(CARD);
  });
});

describe("a v2 card's migration, its steps", () => {
  const resumed: MigrationShown = {
    cardId: CARD_ID,
    amountSats: 0n,
    receivedSats: null,
    resume: true,
    visual: null
  };

  async function showMigration(
    run: MigrationRun,
    migration: MigrationShown = resumed,
    finishing = false
  ): Promise<{ onFinish: jest.Mock }> {
    const onFinish = jest.fn();
    await render(
      <MigrationSteps
        migration={migration}
        run={run}
        onRetry={jest.fn()}
        onCancel={jest.fn()}
        onFinish={onFinish}
        finishing={finishing}
      />
    );
    return { onFinish };
  }

  it("left half-done: recognized, its balance kept, the card asked for again", async () => {
    await showMigration({ phase: "migrating", step: "card" });
    expect(title()).toBe("Hold the card to the phone once more");
    expect(stepSaid("Card recognized")).toMatch(
      /^Card recognized: done, Its wallet keeps what it has already transferred/
    );
    expect(stepSaid("Waiting for the card")).toMatch(/: in progress$/);
    expect(stepSaid("Card erasure and programming")).toMatch(/: to come$/);
    expect(stepSaid("Card activation")).toMatch(/: to come$/);
    expect(screen.getByTestId("card-steps-cancel")).toHaveTextContent("Cancel");
  });

  it("says another card refused at the card's step, nothing more of the steps after", async () => {
    await showMigration({ phase: "failed", step: "card", reason: "notThisCard", touched: false });
    expect(title()).toBe("The migration did not go through");
    expect(screen.getByTestId("card-step-held")).toHaveTextContent(/This is not the chosen card/);
    expect(stepSaid("Card erasure and programming")).toMatch(/: to come$/);
    expect(screen.getByTestId("card-steps-primary")).toHaveTextContent(/Try again$/);
  });

  // Never "Balance transferred" while the balance is on its way.
  it("says the balance on its way while it is transferred, then transferred, or not", async () => {
    const balance: MigrationShown = {
      cardId: CARD_ID,
      amountSats: 70n,
      receivedSats: null,
      resume: false,
      visual: null
    };
    await showMigration({ phase: "migrating", step: "transferring" }, balance);
    expect(title()).toBe("Transferring the balance");
    expect(stepSaid("Transferring the balance")).toBe(
      "Transferring the balance: in progress, 70 sats on their way"
    );
    expect(screen.queryByLabelText(/^Balance transferred/)).toBeNull();
    expect(stepSaid("Holding the card a second time")).toMatch(/: to come$/);
    expect(stepSaid("Card erasure and programming")).toMatch(/: to come$/);
    expect(stepSaid("Card activation")).toMatch(/: to come$/);
    await screen.unmount();

    await showMigration({ phase: "migrating", step: "card" }, { ...balance, receivedSats: 70n });
    expect(stepSaid("Balance transferred")).toBe("Balance transferred: done, 70 sats received");
    expect(stepSaid("Waiting for the card")).toMatch(/: in progress$/);
    await screen.unmount();

    await showMigration(
      { phase: "failed", step: "transferring", reason: "failed", touched: false },
      balance
    );
    expect(stepSaid("Balance not transferred")).toBe(
      "Balance not transferred: failed, The migration failed: try again"
    );
  });

  it("says the card's programming and activation while they run, and what failed", async () => {
    await showMigration({ phase: "migrating", step: "programming" });
    expect(stepSaid("Card held once more")).toMatch(/: done$/);
    expect(stepSaid("Erasing and programming the card")).toMatch(/: in progress$/);
    await screen.unmount();

    await showMigration({ phase: "migrating", step: "activating" });
    expect(stepSaid("Card erased and programmed")).toMatch(/: done$/);
    expect(stepSaid("Activating the card")).toMatch(/: in progress$/);
    await screen.unmount();

    await showMigration({ phase: "failed", step: "programming", reason: "failed", touched: true });
    expect(stepSaid("Card not programmed")).toMatch(/: failed, /);
    await screen.unmount();

    await showMigration({
      phase: "paired",
      card: CARD,
      activation: { status: "unreachable" }
    });
    expect(stepSaid("Activation to finish")).toMatch(/: to check$/);
  });

  it("says what the card's wallet received, as its own payment says it", async () => {
    await showMigration(
      { phase: "migrating", step: "card" },
      { cardId: CARD_ID, amountSats: 50_000n, receivedSats: 49_979n, resume: false, visual: null }
    );
    expect(stepSaid("Balance transferred")).toMatch(/: done, 49.979 sats received/);
    expect(title()).toBe("Hold the card to the phone a second time");
  });

  it('has "Done" wait while the sign-up saves', async () => {
    const run: MigrationRun = {
      phase: "paired",
      card: CARD,
      activation: { status: "ready", pending: 3 }
    };
    await showMigration(run, resumed, true);
    expect(screen.getByTestId("card-steps-primary").props.accessibilityState).toMatchObject({
      disabled: true,
      busy: true
    });
    await screen.unmount();

    const { onFinish } = await showMigration(run);
    expect(title()).toBe("Card migrated");
    await fireEvent.press(screen.getByTestId("card-steps-primary"));
    expect(onFinish).toHaveBeenCalledWith(CARD);
  });
});
