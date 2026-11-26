import "@/i18n";

import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react-native";
import { useEffect } from "react";
import { Pressable, Text } from "react-native";
import Animated, { useReducedMotion } from "react-native-reanimated";

import { BoltCardReader } from "@/features/terminal/BoltCardReader";
import {
  ArrivalStage,
  PAID_ARRIVAL_MS,
  platePath,
  useCodeVeil,
  usePaidArrival,
  VEIL_DELAY_MS,
  type OutcomeArrival,
  type WaitingLeave
} from "@/features/terminal/PaidArrival";
import type { SaleState } from "@/features/terminal/useSale";
import {
  fetchWithdrawRequest,
  lnurlToUrl,
  submitWithdraw,
  type Invoice,
  type WithdrawRequest
} from "@/lib/lightning/lnurl";
import { getCardReading, readCard } from "@/lib/nfc/boltcard";
import { motion } from "@/theme";

import { getAnimatedStyle } from "../../jest/animated-style";

// Reanimated runs for real here (driven by fake timers); only Reduce Motion is switchable.
jest.mock("react-native-reanimated", () => ({
  __esModule: true,
  ...jest.requireActual("react-native-reanimated"),
  useReducedMotion: jest.fn(() => false)
}));
// A BoltCard reader, and its card's service, driven by each test.
jest.mock("../lib/nfc/boltcard", () => ({
  getCardReading: jest.fn(),
  isReadCancelled: () => false,
  readCard: jest.fn()
}));
jest.mock("../lib/lightning/lnurl", () => ({
  fetchWithdrawRequest: jest.fn(),
  lnurlToUrl: jest.fn(),
  submitWithdraw: jest.fn()
}));

type Phase = SaleState["phase"];

const mounts = jest.fn();
const backToPos = jest.fn();

/** The waiting screen: counts its mounts, its code apart from the rest. */
function Waiting({ leave }: { leave?: WaitingLeave }) {
  useEffect(() => {
    mounts();
  }, []);
  return (
    <>
      <Animated.View testID="waiting-rest" style={leave?.others}>
        <Text>Waiting for the payment</Text>
      </Animated.View>
      <Animated.View testID="waiting-code" style={leave?.code} />
    </>
  );
}

function Outcome({ arrival }: { arrival?: OutcomeArrival }) {
  return (
    <>
      <Animated.View testID="disc" style={arrival?.disc} />
      <Animated.View testID="pill" style={arrival?.pill}>
        <Text>Paid</Text>
      </Animated.View>
      <Animated.View testID="footer" style={arrival?.footer}>
        <Pressable onPress={backToPos} testID="back-to-pos">
          <Text>Back to the Point of Sale</Text>
        </Pressable>
      </Animated.View>
    </>
  );
}

/** The charge screen's use of it (src/app/(app)/pos/charge.tsx), mobile unless `desktop`. */
function Screen({ phase, desktop = false }: { phase: Phase; desktop?: boolean }) {
  const arrival = usePaidArrival(phase, desktop);
  const waiting = phase === "creating" || phase === "open" || phase === "checking";
  return (
    <ArrivalStage
      stage={arrival.stage}
      stageRef={arrival.stageRef}
      waiting={waiting || arrival.active ? <Waiting leave={arrival.waiting} /> : null}
      outcome={
        phase === "paid" ? <Outcome arrival={arrival.active ? arrival.outcome : undefined} /> : null
      }
      check={<Text>check</Text>}
    />
  );
}

async function advance(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

type Style = { opacity: number; transform?: { translateY: number }[] };
const styleOf = (testID: string) =>
  getAnimatedStyle(screen.getByTestId(testID, { includeHiddenElements: true })) as Style;
const waitingText = () =>
  screen.queryByText("Waiting for the payment", { includeHiddenElements: true });

describe("usePaidArrival", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mounts.mockClear();
    backToPos.mockClear();
    jest.mocked(useReducedMotion).mockReturnValue(false);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("keeps the waiting screen as it was over the paid screen, then lets it go", async () => {
    const view = await render(<Screen phase="open" />);
    expect(screen.getByText("Waiting for the payment")).toBeTruthy();

    await view.rerender(<Screen phase="paid" />);
    expect(screen.getByText("Paid")).toBeTruthy();
    // Leaving: not mounted again, hidden from accessibility, and the paid screen takes the taps.
    expect(mounts).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Waiting for the payment")).toBeNull();
    expect(waitingText()).toBeTruthy();
    await fireEvent.press(screen.getByTestId("back-to-pos"));
    expect(backToPos).toHaveBeenCalledTimes(1);

    await advance(PAID_ARRIVAL_MS + 100);
    expect(waitingText()).toBeNull();
    expect(screen.queryByText("check", { includeHiddenElements: true })).toBeNull();
    expect(screen.getByText("Paid")).toBeTruthy();
  });

  it("fades the waiting screen out as the paid screen's rows rise into place", async () => {
    const view = await render(<Screen phase="checking" />);
    await view.rerender(<Screen phase="paid" />);
    // The first frame: still the waiting screen, the paid screen hidden.
    expect(styleOf("waiting-rest").opacity).toBe(1);
    expect(styleOf("pill")).toEqual({ opacity: 0, transform: [{ translateY: 10 }] });
    expect(styleOf("disc").opacity).toBe(0);

    await advance(motion.paidWaitOut + 50);
    expect(styleOf("waiting-rest").opacity).toBe(0);
    // Without the plate's path (no layout in Jest), the code leaves with the rest.
    expect(styleOf("waiting-code").opacity).toBe(0);
    // The footer, last of the rows, has not started yet.
    expect(styleOf("footer").opacity).toBe(0);

    await advance(PAID_ARRIVAL_MS - motion.paidWaitOut - 100);
    expect(styleOf("pill")).toEqual({ opacity: 1, transform: [{ translateY: 0 }] });
    expect(styleOf("disc").opacity).toBe(1);
  });

  it("moves nothing with Reduce Motion: the paid screen fades in", async () => {
    jest.mocked(useReducedMotion).mockReturnValue(true);
    const view = await render(<Screen phase="open" />);
    await view.rerender(<Screen phase="paid" />);
    expect(styleOf("pill")).toEqual({ opacity: 0, transform: [{ translateY: 0 }] });

    await advance(PAID_ARRIVAL_MS - 100);
    expect(styleOf("pill")).toEqual({ opacity: 1, transform: [{ translateY: 0 }] });
    await advance(200);
    expect(waitingText()).toBeNull();
  });

  it("shows the paid screen at once on desktop", async () => {
    const view = await render(<Screen phase="open" desktop />);
    await view.rerender(<Screen phase="paid" desktop />);
    expect(screen.getByText("Paid")).toBeTruthy();
    expect(waitingText()).toBeNull();

    // Nor later, once the window is narrower.
    await view.rerender(<Screen phase="paid" />);
    expect(waitingText()).toBeNull();
  });

  it("gives the waiting screen back whole when the payment no longer counts mid-way", async () => {
    const view = await render(<Screen phase="open" />);
    await view.rerender(<Screen phase="paid" />);
    await advance(motion.paidWaitOut + 50);
    expect(styleOf("waiting-rest").opacity).toBe(0);

    // Another payment of the sale to check (or a transaction replaced): waiting again.
    await view.rerender(<Screen phase="checking" />);
    await advance(50);
    expect(mounts).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Waiting for the payment")).toBeTruthy();
    expect(styleOf("waiting-rest").opacity).toBe(1);
    expect(styleOf("waiting-code").opacity).toBe(1);
  });

  it("brings in only a paid screen that follows the waiting one", async () => {
    // An on-chain payment, paid once confirmed: its screen was "Confirming".
    const view = await render(<Screen phase="unconfirmed" />);
    await view.rerender(<Screen phase="paid" />);
    expect(screen.getByText("Paid")).toBeTruthy();
    expect(waitingText()).toBeNull();
    expect(screen.queryByText("check", { includeHiddenElements: true })).toBeNull();
  });
});

describe("useCodeVeil", () => {
  type Props = { verifying: boolean; shown: boolean; desktop?: boolean; leaving?: boolean };
  const veil = (props: Props) =>
    renderHook(
      ({ verifying, shown, desktop = false, leaving = false }: Props) =>
        useCodeVeil(verifying, shown, desktop, leaving),
      { initialProps: props }
    );

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("keeps a code shown sharp so while its payment is checked briefly", async () => {
    const { result, rerender } = await veil({ verifying: false, shown: true });
    expect(result.current).toBe(false);

    await rerender({ verifying: true, shown: true });
    expect(result.current).toBe(false);
    await advance(VEIL_DELAY_MS - 1);
    expect(result.current).toBe(false);

    // Counted meanwhile: the paid screen arrives from the sharp code, and no blur comes after.
    await rerender({ verifying: true, shown: true, leaving: true });
    await advance(VEIL_DELAY_MS * 2);
    expect(result.current).toBe(false);
  });

  it("blurs it once the check lasts, and keeps the blur while the paid screen arrives", async () => {
    const { result, rerender } = await veil({ verifying: false, shown: true });
    await rerender({ verifying: true, shown: true });
    await advance(VEIL_DELAY_MS);
    expect(result.current).toBe(true);

    await rerender({ verifying: true, shown: true, leaving: true });
    expect(result.current).toBe(true);
  });

  it("drops the blur, and the one to come, when the payment does not count", async () => {
    const { result, rerender } = await veil({ verifying: false, shown: true });
    await rerender({ verifying: true, shown: true });
    await advance(VEIL_DELAY_MS);
    expect(result.current).toBe(true);
    await rerender({ verifying: false, shown: true });
    expect(result.current).toBe(false);

    // Another payment seen: sharp again for the delay, and the first one's timer is gone.
    await rerender({ verifying: true, shown: true });
    expect(result.current).toBe(false);
    await rerender({ verifying: false, shown: true });
    await advance(VEIL_DELAY_MS * 2);
    expect(result.current).toBe(false);
  });

  it("never draws sharp a code that shows while its payment is checked", async () => {
    // The screen opened meanwhile.
    expect((await veil({ verifying: true, shown: true })).result.current).toBe(true);

    // Shown again after another invoice was asked (no code meanwhile).
    const { result, rerender } = await veil({ verifying: false, shown: false });
    await rerender({ verifying: true, shown: true });
    expect(result.current).toBe(true);
  });

  it("blurs at once on desktop, and keeps the blur once the window is narrower", async () => {
    const { result, rerender } = await veil({ verifying: false, shown: true, desktop: true });
    await rerender({ verifying: true, shown: true, desktop: true });
    expect(result.current).toBe(true);
    await rerender({ verifying: true, shown: true });
    expect(result.current).toBe(true);
  });
});

describe("platePath", () => {
  // Mobile (390 × 844): the code's plate (216 + 2 × 18) under the amount, the disc lower.
  const stage = { x: 22, y: 116, width: 346, height: 694 };
  const plate = { x: 69, y: 230, width: 252, height: 252 };
  const disc = { x: 147, y: 270, width: 96, height: 96 };

  it("starts the green plate on the code's plate, at its size, and ends it on the disc", () => {
    expect(platePath(stage, plate, disc)).toEqual({
      left: 125,
      top: 154,
      size: 96,
      // Centre to centre: (195, 356) to (195, 318).
      dx: 0,
      dy: 38,
      scale: 2.625
    });
  });

  it("has no path before the disc and the plate are laid out", () => {
    expect(platePath(stage, plate, { ...disc, width: 0, height: 0 })).toBeNull();
    expect(platePath(stage, { ...plate, width: 0, height: 0 }, disc)).toBeNull();
  });
});

describe("BoltCardReader, once its sale is paid", () => {
  const invoice = { pr: "lnbc1shown", verifyUrl: "https://lnurl.example/verify" } as Invoice;

  it("stops listening, and a card being read no longer pays", async () => {
    const cancel = jest.fn();
    let cardRead!: (lnurl: string) => void;
    let serviceAnswered!: (withdraw: WithdrawRequest) => void;
    jest.mocked(getCardReading).mockResolvedValue("auto");
    jest.mocked(readCard).mockReturnValue({
      lnurl: new Promise((resolve) => {
        cardRead = resolve;
      }),
      cancel
    });
    jest.mocked(lnurlToUrl).mockReturnValue(new URL("https://card.example/withdraw"));
    jest.mocked(fetchWithdrawRequest).mockReturnValue(
      new Promise((resolve) => {
        serviceAnswered = resolve;
      })
    );

    const view = await render(<BoltCardReader invoice={invoice} />);
    await waitFor(() => expect(readCard).toHaveBeenCalledTimes(1));
    // A card is read: its service is asked for the withdrawal.
    await act(async () => cardRead("lnurl1card"));
    expect(fetchWithdrawRequest).toHaveBeenCalledTimes(1);

    // Paid meanwhile (another invoice of the sale): its screen leaves, the line still shown.
    await view.rerender(<BoltCardReader invoice={invoice} stopped />);
    expect(cancel).toHaveBeenCalled();
    expect(screen.getByTestId("boltcard")).toBeTruthy();
    await act(async () => serviceAnswered({} as WithdrawRequest));
    expect(submitWithdraw).not.toHaveBeenCalled();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(readCard).toHaveBeenCalledTimes(1);
  });
});
