import { render, screen } from "@testing-library/react-native";

import i18n from "@/i18n";
import { freezeStep, historyStep, walletStep } from "@/features/migration/end-steps";
import { MigrationTimeline, type TimelineStep } from "@/features/migration/MigrationTimeline";

/*
 * The steps of "Your account is up to date" (end-steps.tsx) as each outcome says them, and the
 * timeline that draws them (MigrationTimeline.tsx). The screen's flow is migration-flow.test.tsx's.
 */

const t = i18n.t;
const LOCALE = { languageTag: "en-CH" };
const amount = (sats: bigint) => `${sats} sats`;

describe("the freeze's step", () => {
  it("says the money in a few words, never the Lightning address it went to", () => {
    const step = freezeStep(
      t,
      { phase: "done", lightningAddress: "sattleme02c6047f94@breez.tips", payout: "pending" },
      undefined
    );
    expect(step).toMatchObject({ state: "done", title: "Old account frozen" });
    expect(step.caption).toMatch(
      /^It no longer accepts payments\. The funds will be transferred to your new sattle\.me wallet by 0:00\sUTC at the latest\.$/
    );
    expect(step.caption).not.toMatch(/breez/);
  });

  it('offers "Try again" only when asked to and the freeze may be tried again', () => {
    const retry = () => undefined;
    expect(freezeStep(t, { phase: "failed", retry: true }, retry).actions).toBeTruthy();
    expect(freezeStep(t, { phase: "failed", retry: true }, undefined).actions).toBeUndefined();
    const lost = freezeStep(t, { phase: "failed", retry: false }, retry);
    expect(lost.actions).toBeUndefined();
    expect(lost).toMatchObject({ state: "error", title: "Old account not frozen" });
  });
});

describe("the history's step", () => {
  it("waits for the freeze, then runs as soon as the session is handed on", () => {
    expect(historyStep(t, { phase: "idle" }, { copy: "waiting", ...LOCALE })).toMatchObject({
      state: "pending",
      caption: "As soon as your old account is frozen."
    });
    expect(historyStep(t, { phase: "idle" }, { copy: "running", ...LOCALE })).toMatchObject({
      state: "running",
      title: "Copying your history…"
    });
  });

  it("counts the rows read, then those written, with a bar", () => {
    expect(
      historyStep(t, { phase: "running", step: "reading", rows: 1 }, { copy: "running", ...LOCALE })
        .caption
    ).toBe("1 movement read");
    const writing = historyStep(
      t,
      { phase: "running", step: "writing", copied: 840, total: 1392 },
      { copy: "running", ...LOCALE }
    );
    expect(writing.caption).toMatch(/^840\s\/\s1'392 movements$/);
    expect(writing.progress).toEqual({ now: 840, max: 1392 });
  });

  it("says a history without any movement copied, never nothing", () => {
    expect(historyStep(t, { phase: "done", rows: 0 }, { copy: "ended", ...LOCALE })).toMatchObject({
      state: "done",
      title: "History copied",
      caption: "No movement to copy."
    });
  });

  it('says a history not copied here, with no session to copy with, as "Settings" offers it', () => {
    const step = historyStep(t, { phase: "idle" }, { copy: "ended", ...LOCALE });
    expect(step).toMatchObject({ state: "warning", title: "History not copied" });
    expect(step.caption).toMatch(/Start it again from “Settings”/);
  });
});

describe("the v2 wallet's step", () => {
  const sent = {
    phase: "done" as const,
    outcome: {
      status: "sent" as const,
      txid: "a".repeat(64),
      outputSats: 49_000n,
      feeSats: 1_000n,
      waitingSats: 0n
    }
  };

  it("is none without a v2 wallet to speak of", () => {
    const none = { state: { phase: "idle" as const }, showTransfer: false, amount };
    expect(walletStep(t, { ...none, wordsNeeded: { status: "none" } }, {})).toBeNull();
    expect(walletStep(t, { ...none, wordsNeeded: null }, {})).toMatchObject({
      state: "running",
      title: "Checking your old wallet…"
    });
  });

  it("is done once sent, a warning while more is on its way to the old wallet", () => {
    const step = walletStep(t, { state: sent, wordsNeeded: null, showTransfer: true, amount }, {});
    expect(step).toMatchObject({
      state: "done",
      title: "49000 sats on its way to your new account"
    });
    const more = walletStep(
      t,
      {
        state: { ...sent, outcome: { ...sent.outcome, waitingSats: 5_000n } },
        wordsNeeded: null,
        showTransfer: true,
        amount
      },
      {}
    );
    expect(more?.state).toBe("warning");
    expect(more?.caption).toMatch(/Another 5000 sats is on its way to your old account/);
  });

  it("says the words erased from the phone after the transfer", () => {
    const step = walletStep(
      t,
      {
        state: { ...sent, outcome: { ...sent.outcome, erased: true } },
        wordsNeeded: null,
        showTransfer: true,
        amount
      },
      {}
    );
    expect(step?.caption).toMatch(/The 12 words were erased from this phone\.$/);
    const dust = walletStep(
      t,
      {
        state: {
          phase: "done",
          outcome: { status: "tooSmall", sats: 600n, waitingSats: 0n, erased: true }
        },
        wordsNeeded: null,
        showTransfer: true,
        amount
      },
      {}
    );
    expect(dust?.caption).toBe(
      "Your old wallet holds 600 sats, less than the fees to move it: it stays where it is. The 12 words were erased from this phone."
    );
  });

  it("waits for the owner's answer to the offer, then says the words erased without a transfer", () => {
    const idle = {
      state: { phase: "idle" as const },
      wordsNeeded: null,
      showTransfer: true,
      amount
    };
    expect(walletStep(t, idle, {})).toMatchObject({
      state: "running",
      title: "Old wallet"
    });
    expect(walletStep(t, { ...idle, skipped: "erasing" }, {})?.state).toBe("running");
    const erased = walletStep(t, { ...idle, skipped: "erased" }, { typeWords: () => undefined });
    expect(erased).toMatchObject({ state: "done", testID: "migration-transfer-skipped" });
    expect(erased?.actions).toBeTruthy();
    const failed = walletStep(t, { ...idle, skipped: "failed" }, {});
    expect(failed).toMatchObject({ state: "error", testID: "migration-transfer-erase-failed" });
    expect(failed?.actions).toBeUndefined();
    expect(
      walletStep(t, { ...idle, skipped: "failed" }, { eraseAgain: () => undefined })?.actions
    ).toBeTruthy();
  });

  it("offers the words' screen only when asked to", () => {
    const funds = {
      state: { phase: "idle" as const },
      wordsNeeded: { status: "funds" as const, sats: 70_000n },
      showTransfer: false,
      amount
    };
    expect(walletStep(t, funds, {})?.actions).toBeUndefined();
    expect(walletStep(t, funds, { typeWords: () => undefined })?.actions).toBeTruthy();
  });
});

describe("MigrationTimeline", () => {
  const steps: TimelineStep[] = [
    { key: "a", state: "done", title: "Account created", caption: "Ready", testID: "step-a" },
    {
      key: "b",
      state: "running",
      title: "Copying…",
      caption: "840 / 1392",
      progress: { now: 840, max: 1392 },
      testID: "step-b"
    },
    { key: "c", state: "pending", title: "Next", testID: "step-c" }
  ];

  it("reads each step as its title and sentence, a counted one as a progress bar", async () => {
    await render(<MigrationTimeline steps={steps} />);
    expect(screen.getByLabelText("Account created. Ready")).toBeTruthy();
    const running = screen.getByLabelText("Copying…. 840 / 1392");
    expect(running.props.accessibilityRole).toBe("progressbar");
    expect(running.props.accessibilityValue).toEqual({ min: 0, max: 1392, now: 840 });
    // A pending step shows its number.
    expect(screen.getByTestId("step-c")).toHaveTextContent(/^3Next$/);
  });
});
