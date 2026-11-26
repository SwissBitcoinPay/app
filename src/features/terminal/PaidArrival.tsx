import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { StyleSheet, View, type ViewInstance, type ViewStyle } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
  type AnimatedStyle,
  type SharedValue
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import { outOfReach } from "@/components/ui/reach";
import { makeStyles, motion, radius, useTheme } from "@/theme";

import type { SaleState } from "./useSale";

// Two curves: settling into place, and going from one place to another.
const OUT = Easing.bezier(0.2, 0.7, 0.2, 1);
const IN_OUT = Easing.bezier(0.65, 0, 0.35, 1);
/** How far (points) the paid screen's rows rise into place. */
const RISE = 10;
const ROWS = 4;

/** From the payment seen to the last row in place: 905 ms. */
export const PAID_ARRIVAL_MS = Math.max(
  motion.paidTint,
  motion.paidWaitOut,
  motion.paidMorphDelay + motion.paidMorph,
  motion.paidCheckDelay + motion.paidCheck,
  motion.paidRowsDelay + (ROWS - 1) * motion.paidRowsStagger + motion.paidRows
);

type AnimatedViewStyle = AnimatedStyle<ViewStyle>;

/**
 * The waiting screen's parts, while the paid screen arrives (`active`). Given to it whenever it
 * shows, not only then: a style taken off a view keeps its last values (Reanimated 4.5), so that
 * an arrival cut short would leave it faded. Outside an arrival, they leave it as it is.
 */
export type WaitingLeave = {
  active: boolean;
  others: AnimatedViewStyle;
  code: AnimatedViewStyle;
};

/** The stage of the waiting and paid screens, while the paid screen arrives. */
export type StageArrival = {
  active: boolean;
  /** The green plate. */
  plate: AnimatedViewStyle;
  plateCheck: AnimatedViewStyle;
};

/** The paid screen's parts, while it arrives. */
export type OutcomeArrival = {
  disc: AnimatedViewStyle;
  pill: AnimatedViewStyle;
  amount: AnimatedViewStyle;
  detail: AnimatedViewStyle;
  footer: AnimatedViewStyle;
  discRef: RefObject<ViewInstance | null>;
  onDiscLayout: () => void;
};

/**
 * Where the green plate starts and ends, in the stage: it is drawn at the disc's place, its size,
 * and moved and scaled up onto the code's plate (`dx`, `dy`, `scale`) until it contracts.
 */
export type Geometry = {
  left: number;
  top: number;
  size: number;
  dx: number;
  dy: number;
  scale: number;
};
export type Box = { x: number; y: number; width: number; height: number };

/** The green plate's path from the code's `plate` to the `disc`, boxes measured in the window. */
export function platePath(stage: Box, plate: Box, disc: Box): Geometry | null {
  // Not laid out (yet): no path.
  if (disc.width === 0 || plate.width === 0) return null;
  return {
    left: disc.x - stage.x,
    top: disc.y - stage.y,
    size: disc.width,
    dx: plate.x + plate.width / 2 - (disc.x + disc.width / 2),
    dy: plate.y + plate.height / 2 - (disc.y + disc.height / 2),
    scale: plate.width / disc.width
  };
}

const WAITING: ReadonlySet<SaleState["phase"]> = new Set(["creating", "open", "checking"]);

/** The phases of the waiting screen, which the paid screen's arrival follows. */
export function isWaitingPhase(phase: SaleState["phase"]): boolean {
  return WAITING.has(phase);
}

/**
 * How long (ms) a code shown sharp stays so once its payment is seen, before its blur comes: most
 * checks end before (the registry read of a Lightning payment). A longer one (relays slow to
 * answer, a transaction's time asked) blurs it, so that it is not scanned and paid again. 1.5 s.
 */
export const VEIL_DELAY_MS = 1500;

/**
 * Whether the waiting screen blurs its code while its payment is checked (`verifying`). On
 * mobile, a code shown sharp stays so for VEIL_DELAY_MS: the paid screen then arrives from the
 * code as the payer saw it, without a blur. A code that shows while its
 * payment is checked (shown again after another invoice was asked, the screen opened meanwhile)
 * is blurred at once: never seen sharp. On desktop, at once too. Once the paid screen arrives
 * (`leaving`), a blur still to come never comes, and one already there stays: the waiting screen
 * leaves as it was.
 */
export function useCodeVeil(
  verifying: boolean,
  shown: boolean,
  desktop: boolean,
  leaving: boolean
): boolean {
  const [veiled, setVeiled] = useState(verifying);
  // Adjusted while rendering: a code that shows already checked is never drawn sharp.
  const [last, setLast] = useState({ verifying, shown });
  if (last.verifying !== verifying || last.shown !== shown) {
    setLast({ verifying, shown });
    if (!verifying || !last.shown) setVeiled(verifying);
  }
  if (verifying && desktop && !veiled) setVeiled(true);

  const due = verifying && !veiled && !leaving;
  useEffect(() => {
    if (!due) return;
    const timer = setTimeout(() => setVeiled(true), VEIL_DELAY_MS);
    return () => clearTimeout(timer);
  }, [due]);
  return verifying && veiled;
}

/**
 * A green fade:
 * the waiting screen becomes the paid screen. The code's plate turns green, fading, as the rest of
 * the waiting screen fades out; the green plate then contracts into the paid screen's disc, whose
 * check pops, while the paid screen's rows rise into place, in 905 ms. On mobile, from any waiting
 * phase (the plate shows a code or, while a payment is checked, a spinner); desktop changes screens
 * at once (the animation is for mobile only).
 *
 * The waiting screen stays mounted during it (over the paid screen, in `ArrivalStage`): its code,
 * its BoltCard line keep what they showed. With Reduce Motion, nothing moves: the waiting screen
 * fades out, the disc and the rows fade in at their times. The plate's path is measured once the
 * disc is laid out; until then (or without it: Jest has no layout), the disc fades in where it is.
 */
export function usePaidArrival(phase: SaleState["phase"], desktop: boolean) {
  const { shadow } = useTheme();
  const { rgb: shadowRgb, alpha: shadowAlpha } = shadow.cardTint;
  const still = useReducedMotion();
  const waiting = WAITING.has(phase);

  // Arriving from the render that shows the paid screen (adjusted while rendering: its first frame
  // already shows the waiting screen over a hidden paid screen) to the end of the timeline.
  const [arriving, setArriving] = useState(false);
  const [lastPhase, setLastPhase] = useState(phase);
  if (phase !== lastPhase) {
    setLastPhase(phase);
    setArriving(phase === "paid" && WAITING.has(lastPhase) && !desktop);
  }
  // Desktop meanwhile (a window made wider): its paid screen shows at once, for good.
  if (arriving && desktop) setArriving(false);
  const active = arriving && phase === "paid";

  const stageRef = useRef<ViewInstance>(null);
  const plateRef = useRef<ViewInstance>(null);
  const discRef = useRef<ViewInstance>(null);
  const geometry = useSharedValue<Geometry | null>(null);

  // Each part's progress, 0 to 1.
  const tint = useSharedValue(0);
  const waitOut = useSharedValue(0);
  const codeGone = useSharedValue(0);
  const morph = useSharedValue(0);
  const check = useSharedValue(0);
  const pill = useSharedValue(0);
  const amount = useSharedValue(0);
  const detail = useSharedValue(0);
  const footer = useSharedValue(0);
  // The real disc takes the green plate's place once everything is still.
  const settled = useSharedValue(0);

  // Back to the start while the sale waits: an on-chain payment replaced before it confirmed sends
  // the sale back to its invoice, which may then be paid again.
  useEffect(() => {
    if (!waiting) return;
    for (const value of [tint, waitOut, codeGone, morph, check, pill, amount, detail, footer]) {
      value.set(0);
    }
    settled.set(0);
    geometry.set(null);
  }, [
    waiting,
    tint,
    waitOut,
    codeGone,
    morph,
    check,
    pill,
    amount,
    detail,
    footer,
    settled,
    geometry
  ]);

  useEffect(() => {
    if (!active) return;
    const run = (value: SharedValue<number>, delay: number, duration: number, easing = OUT) => {
      const timing = withTiming(1, { duration, easing, reduceMotion: ReduceMotion.Never });
      value.set(delay > 0 ? withDelay(delay, timing, ReduceMotion.Never) : timing);
    };
    run(tint, 0, motion.paidTint, IN_OUT);
    run(waitOut, 0, motion.paidWaitOut, IN_OUT);
    run(codeGone, motion.paidTint, 0);
    run(morph, motion.paidMorphDelay, motion.paidMorph, IN_OUT);
    run(check, motion.paidCheckDelay, motion.paidCheck);
    [pill, amount, detail, footer].forEach((row, i) =>
      run(row, motion.paidRowsDelay + i * motion.paidRowsStagger, motion.paidRows)
    );
    // Shown under the green plate, which looks just like it by then, before the plate goes.
    settled.set(
      withDelay(
        PAID_ARRIVAL_MS,
        withTiming(1, { duration: 0, reduceMotion: ReduceMotion.Never }, (finished) => {
          if (finished) scheduleOnRN(setArriving, false);
        }),
        ReduceMotion.Never
      )
    );
    return () => {
      for (const value of [tint, waitOut, codeGone, morph, check, pill, amount, detail, footer]) {
        cancelAnimation(value);
      }
      cancelAnimation(settled);
    };
  }, [active, tint, waitOut, codeGone, morph, check, pill, amount, detail, footer, settled]);

  /** Once the disc is laid out: the plate's path, from the code's plate to the disc. */
  const onDiscLayout = () => {
    if (!active) return;
    void Promise.all([
      measureInWindow(stageRef.current),
      measureInWindow(plateRef.current),
      measureInWindow(discRef.current)
    ]).then(([stage, plate, disc]) => {
      const path = stage && plate && disc ? platePath(stage, plate, disc) : null;
      if (path) geometry.set(path);
    });
  };

  const leaving = useAnimatedStyle(() => ({ opacity: active ? 1 - waitOut.get() : 1 }));
  // Under the green plate, the code stays until the plate is opaque, then goes at once.
  const code = useAnimatedStyle(() => ({
    opacity: !active
      ? 1
      : geometry.get() !== null && !still
        ? 1 - codeGone.get()
        : 1 - waitOut.get()
  }));

  const plate = useAnimatedStyle(() => {
    const g = geometry.get();
    if (g === null || still) return { opacity: 0 };
    const m = morph.get();
    const rest = 1 - m;
    return {
      left: g.left,
      top: g.top,
      width: g.size,
      height: g.size,
      opacity: tint.get(),
      // The code plate's corners and shadow (shadow.card, its tint) at its size, the disc's at its own.
      borderRadius: (radius.lg / g.scale) * rest + (g.size / 2) * m,
      boxShadow: `0px ${(2 / g.scale) * rest}px ${(14 / g.scale) * rest}px 0px rgba(${shadowRgb}, ${shadowAlpha * rest})`,
      transform: [
        { translateX: g.dx * rest },
        { translateY: g.dy * rest },
        { scale: g.scale + (1 - g.scale) * m }
      ]
    };
  });
  const plateCheck = useAnimatedStyle(() => ({
    opacity: check.get(),
    transform: [{ scale: 0.5 + 0.5 * check.get() }]
  }));
  const disc = useAnimatedStyle(() => ({
    opacity: geometry.get() !== null && !still ? settled.get() : morph.get()
  }));
  const pillStyle = useRise(pill, still);
  const amountStyle = useRise(amount, still);
  const detailStyle = useRise(detail, still);
  const footerStyle = useRise(footer, still);

  const outcome: OutcomeArrival = {
    disc,
    pill: pillStyle,
    amount: amountStyle,
    detail: detailStyle,
    footer: footerStyle,
    discRef,
    onDiscLayout
  };
  const leave: WaitingLeave = { active, others: leaving, code };
  const stage: StageArrival = { active, plate, plateCheck };
  return {
    /** The paid screen is arriving: the waiting screen is still shown, leaving. */
    active,
    stage,
    stageRef,
    /** The code's plate of the waiting screen. */
    plateRef,
    /** The header's actions of the waiting screen, while they fade out. */
    header: leaving,
    /** For the waiting screen whenever it shows (`WaitingLeave`). */
    waiting: leave,
    outcome
  };
}

/** A row of the paid screen, rising into place as it fades in (fading only with Reduce Motion). */
function useRise(value: SharedValue<number>, still: boolean) {
  return useAnimatedStyle(() => ({
    opacity: value.get(),
    transform: [{ translateY: still ? 0 : RISE * (1 - value.get()) }]
  }));
}

function measureInWindow(view: ViewInstance | null): Promise<Box | null> {
  return new Promise((resolve) => {
    if (!view || typeof view.measureInWindow !== "function") {
      resolve(null);
      return;
    }
    view.measureInWindow((x, y, width, height) => resolve({ x, y, width, height }));
  });
}

/**
 * The content of the waiting and paid screens on mobile. The waiting screen lies over the paid
 * screen while it leaves (without taking taps, hidden from accessibility), the green plate over
 * both. Always the same tree from one phase to the other, so that the waiting screen is not mounted
 * again when the payment comes.
 */
export function ArrivalStage({
  stage,
  stageRef,
  waiting,
  outcome,
  check
}: {
  stage: StageArrival;
  stageRef: RefObject<ViewInstance | null>;
  /** The waiting screen, while it is shown or leaving. */
  waiting?: ReactNode;
  outcome?: ReactNode;
  /** The paid screen's disc icon, carried by the green plate. */
  check?: ReactNode;
}) {
  const styles = useStyles();
  const leaving = stage.active;
  return (
    <View ref={stageRef} style={styles.stage}>
      {outcome ?? null}
      {waiting ? (
        <View
          style={[StyleSheet.absoluteFill, { pointerEvents: leaving ? "none" : "auto" }]}
          // Out of reach of screen readers and, on the web, of the keyboard too.
          {...outOfReach(leaving)}
        >
          {waiting}
        </View>
      ) : null}
      {leaving ? (
        <Animated.View {...outOfReach(true)} style={[styles.plate, stage.plate]}>
          <Animated.View style={stage.plateCheck}>{check}</Animated.View>
        </Animated.View>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  stage: { flex: 1 },
  plate: {
    position: "absolute",
    left: 0,
    top: 0,
    pointerEvents: "none",
    backgroundColor: colors.state.settled.bg,
    alignItems: "center",
    justifyContent: "center"
  }
}));
