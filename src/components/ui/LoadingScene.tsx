import { useEffect, useState, type ComponentProps, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
  type SharedValue
} from "react-native-reanimated";
import Svg, { Circle, Ellipse, G, Path, Rect } from "react-native-svg";

import { Coin } from "@/components/illustrations/parts";
import { makeStyles, motion, palette, sans, tracked, type, useTheme } from "@/theme";

import {
  ARTICLES_CYCLE,
  BACK_DELAYS,
  beamAt,
  busyAt,
  BUSY_CYCLE,
  caretAt,
  CARDS_CYCLE,
  coinAt,
  fillAt,
  FINDER_PASSES,
  finderAt,
  hopAt,
  INVOICE_CYCLE,
  loupeAt,
  OUT_DELAYS,
  packetAt,
  PACKETS_CYCLE,
  PAYMENT_CYCLE,
  swingAt,
  TEAM_CYCLE,
  WALLET_CYCLE
} from "./loading-scene-motion";
import { Spinner } from "./Spinner";

/*
 * A screen's loading scene: what the screen waits for, drawn as an action that never ends (coins
 * falling into the wallet, a beam reading the card…), on a disc inside the ring of the app's
 * spinner, the words of the wait under it. It never shows a result: no check, no amount, no
 * "paid" green. The drawings are the empty screens' (src/components/illustrations/): flat shapes
 * in the theme's illustration colours, 120 units square. The pieces that move are views over the
 * still drawing, each driven by its scene's Reanimated loop on the UI thread
 * (loading-scene-motion.ts); with Reduce Motion nothing moves and the whole ring pulses, as the
 * spinner's does.
 */

/** The screens that have a scene. */
export type LoadingSceneKind =
  "wallet" | "cards" | "team" | "integrations" | "invoice" | "payment" | "articles";

/** The scene's box (points), the spinner's ring in it, and its stroke. */
const BOX = 168;
const RING = 160;
const RING_STROKE = 4;
/** Points per unit of the drawing: the drawing (120 units) fills the disc inside the ring. */
const UNIT = 1.08;
const SCENE = 120 * UNIT;
const SCENE_INSET = (BOX - SCENE) / 2;

/** The code's modules but its finder squares, a drawing of a code read by nothing. */
const QR_MODULES =
  "M12 1h2.4v2.4h-2.4z M14.5 4.5h2.4v2.4h-2.4z M12 7.5h2.4v2.4h-2.4z M1 12h2.4v2.4h-2.4z " +
  "M4.5 14.5h2.4v2.4h-2.4z M7.5 12h2.4v2.4h-2.4z M12 12h2.4v2.4h-2.4z M15 12.5h2.4v2.4h-2.4z " +
  "M18.5 12h2.4v2.4h-2.4z M22 13h2.4v2.4h-2.4z M25.5 12h2.4v2.4h-2.4z M12 15.5h2.4v2.4h-2.4z " +
  "M16 17h2.4v2.4h-2.4z M19.5 15.5h2.4v2.4h-2.4z M23 17h2.4v2.4h-2.4z M25.5 19.5h2.4v2.4h-2.4z " +
  "M13 20.5h2.4v2.4h-2.4z M17 21.5h2.4v2.4h-2.4z M21 20.5h2.4v2.4h-2.4z M24.5 23.5h2.4v2.4h-2.4z " +
  "M12.5 25h2.4v2.4h-2.4z M16.5 25.5h2.4v2.4h-2.4z M20.5 24.5h2.4v2.4h-2.4z";
/** The code's three finder squares, each in its frame (even-odd), in the order FINDER_PASSES. */
const QR_FINDERS = [
  "M64 46h10v10H64z M66 48v6h6v-6z M67.5 49.5h3v3h-3z",
  "M46 64h10v10H46z M48 66v6h6v-6z M49.5 67.5h3v3h-3z",
  "M46 46h10v10H46z M48 48v6h6v-6z M49.5 49.5h3v3h-3z"
] as const;

/** The invoice's lines, then its total: x, y, width, height (units), the total in orange. */
const INVOICE_LINES = [
  [38, 46, 44, 5],
  [38, 56, 36, 5],
  [38, 66, 40, 5],
  [38, 76, 28, 5],
  [58, 88, 24, 6]
] as const;

type AnimatedStyle = ComponentProps<typeof Animated.View>["style"];

/** A scene's loop, 0 to 1, round and round; still with Reduce Motion. */
function useLoop(cycle: number, still: boolean): SharedValue<number> {
  const loop = useSharedValue(0);
  useEffect(() => {
    loop.set(0);
    if (still) return;
    loop.set(withRepeat(withTiming(1, { duration: cycle, easing: Easing.linear }), -1));
    return () => cancelAnimation(loop);
  }, [cycle, still, loop]);
  return loop;
}

/** The still drawing of a scene, under or over its moving pieces. */
function Drawing({ children }: { children: ReactNode }) {
  return (
    <Svg width={SCENE} height={SCENE} viewBox="0 0 120 120" style={StyleSheet.absoluteFill}>
      {children}
    </Svg>
  );
}

/**
 * A moving piece of a scene: the part of the drawing from (x, y), `width` × `height` units, drawn
 * in the scene's own coordinates, moved by `style`.
 */
function Piece({
  x,
  y,
  width,
  height,
  origin = "center",
  style,
  children
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  origin?: string;
  style: AnimatedStyle;
  children: ReactNode;
}) {
  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          left: x * UNIT,
          top: y * UNIT,
          width: width * UNIT,
          height: height * UNIT,
          transformOrigin: origin
        },
        style
      ]}
    >
      <Svg width={width * UNIT} height={height * UNIT} viewBox={`${x} ${y} ${width} ${height}`}>
        {children}
      </Svg>
    </Animated.View>
  );
}

/** "Wallet": coins falling one after the other into the wallet. */
function WalletScene({ still }: { still: boolean }) {
  const { colors } = useTheme();
  const { ink, paper, ground } = colors.illustration;
  const loop = useLoop(WALLET_CYCLE, still);
  return (
    <>
      <Drawing>
        <Ellipse cx={60} cy={102} rx={36} ry={4} fill={ground} />
      </Drawing>
      {[0, 1, 2].map((index) => (
        <FallingCoin key={index} index={index} loop={loop} still={still} />
      ))}
      {/* The wallet over the coins: they fall into it. */}
      <Drawing>
        <Rect x={24} y={50} width={72} height={48} rx={11} fill={ink} />
        <Rect x={24} y={62} width={72} height={2.5} fill={paper} fillOpacity={0.18} />
        <Rect x={70} y={68} width={30} height={16} rx={8} fill={paper} />
        <Circle cx={80} cy={76} r={3.2} fill={palette.orange} />
      </Drawing>
    </>
  );
}

function FallingCoin({
  index,
  loop,
  still
}: {
  index: number;
  loop: SharedValue<number>;
  still: boolean;
}) {
  const style = useAnimatedStyle(() => {
    const { y, opacity } = coinAt(loop.get(), index, still);
    return { opacity, transform: [{ translateY: y * UNIT }] };
  }, [index, still]);
  return (
    // A unit round the coin, so that its edge is not cut by its own box.
    <Piece x={49} y={29} width={22} height={22} style={style}>
      <Coin cx={60} cy={40} r={10} mark="bitcoin" />
    </Piece>
  );
}

/** "Cards": a beam sweeping the card, reading it. */
function CardsScene({ still }: { still: boolean }) {
  const { colors } = useTheme();
  const loop = useLoop(CARDS_CYCLE, still);
  const beam = useAnimatedStyle(() => {
    const { y, opacity } = beamAt(loop.get(), still);
    return { opacity, transform: [{ translateY: y * UNIT }] };
  }, [still]);
  return (
    <>
      <Drawing>
        <Ellipse cx={60} cy={97} rx={36} ry={4} fill={colors.illustration.ground} />
        <Rect x={20} y={39} width={80} height={50} rx={8} fill={palette.ink} fillOpacity={0.16} />
        <Rect x={20} y={35} width={80} height={50} rx={8} fill={colors.cardFace.night} />
        <Rect x={28} y={43} width={28} height={5} rx={2.5} fill={palette.white} fillOpacity={0.9} />
        <Rect x={28} y={53} width={13} height={10} rx={2.5} fill={palette.apricot} />
        <Rect
          x={28}
          y={73}
          width={34}
          height={4.5}
          rx={2.25}
          fill={palette.white}
          fillOpacity={0.3}
        />
      </Drawing>
      {/* The beam, clipped to the card's face. */}
      <View style={sceneStyles.cardWindow}>
        <Animated.View style={[sceneStyles.beam, beam]}>
          <View style={sceneStyles.beamGlow} />
          <View style={sceneStyles.beamLine} />
        </Animated.View>
      </View>
    </>
  );
}

/** "Employees": three avatars jumping one after the other. */
function TeamScene({ still }: { still: boolean }) {
  const loop = useLoop(TEAM_CYCLE, still);
  return (
    <>
      {[28, 60, 92].map((cx, index) => (
        <HopShadow key={cx} cx={cx} index={index} loop={loop} still={still} />
      ))}
      {[28, 60, 92].map((cx, index) => (
        <Avatar key={cx} cx={cx} index={index} loop={loop} still={still} />
      ))}
    </>
  );
}

function HopShadow({
  cx,
  index,
  loop,
  still
}: {
  cx: number;
  index: number;
  loop: SharedValue<number>;
  still: boolean;
}) {
  const { colors } = useTheme();
  const style = useAnimatedStyle(() => {
    const { shadowScale, shadowOpacity } = hopAt(loop.get(), index, still);
    return { opacity: shadowOpacity, transform: [{ scaleX: shadowScale }] };
  }, [index, still]);
  return (
    <Piece x={cx - 12} y={85} width={24} height={6} style={style}>
      <Ellipse cx={cx} cy={88} rx={12} ry={3} fill={colors.illustration.ground} />
    </Piece>
  );
}

/** An avatar: its disc (ink, or orange in the air), its head and shoulders in the paper. */
function AvatarArt({ cx, fill }: { cx: number; fill: string }) {
  const { colors } = useTheme();
  const paper = colors.illustration.paper;
  return (
    <Svg width={30 * UNIT} height={30 * UNIT} viewBox={`${cx - 15} 51 30 30`}>
      <Circle cx={cx} cy={66} r={15} fill={fill} />
      <Circle cx={cx} cy={62} r={5} fill={paper} />
      <Path d={`M${cx - 8.5} 76.5a8.5 7.5 0 0 1 17 0z`} fill={paper} />
    </Svg>
  );
}

function Avatar({
  cx,
  index,
  loop,
  still
}: {
  cx: number;
  index: number;
  loop: SharedValue<number>;
  still: boolean;
}) {
  const { colors } = useTheme();
  const jump = useAnimatedStyle(() => {
    const { y, scaleX, scaleY } = hopAt(loop.get(), index, still);
    return { transform: [{ translateY: y * UNIT }, { scaleX }, { scaleY }] };
  }, [index, still]);
  const lit = useAnimatedStyle(() => {
    return { opacity: hopAt(loop.get(), index, still).lit ? 1 : 0 };
  }, [index, still]);
  return (
    <Animated.View
      style={[
        sceneStyles.avatar,
        { left: (cx - 15) * UNIT, top: 51 * UNIT, transformOrigin: "50% 100%" },
        jump
      ]}
    >
      <AvatarArt cx={cx} fill={colors.illustration.ink} />
      <Animated.View style={[StyleSheet.absoluteFill, lit]}>
        <AvatarArt cx={cx} fill={palette.orange} />
      </Animated.View>
    </Animated.View>
  );
}

/** "Integrations": data going back and forth between the shop and its server. */
function IntegrationsScene({ still }: { still: boolean }) {
  const { colors } = useTheme();
  const { ink, paper, shadow, ground } = colors.illustration;
  const packets = useLoop(PACKETS_CYCLE, still);
  const pulse = useLoop(BUSY_CYCLE, still);
  const busy = useAnimatedStyle(() => ({ opacity: busyAt(pulse.get(), still) }), [still]);
  const track = {
    stroke: colors.border.subtle,
    strokeWidth: 2,
    strokeLinecap: "round",
    strokeDasharray: "0.1 4.5",
    fill: "none"
  } as const;
  return (
    <>
      <Drawing>
        <Ellipse cx={60} cy={96} rx={46} ry={4} fill={ground} />
        {/* The shop: a browser's window. */}
        <Rect x={8} y={42} width={40} height={40} rx={8} fill={shadow} />
        <Rect x={8} y={38} width={40} height={40} rx={8} fill={paper} />
        <Path d="M8 46a8 8 0 0 1 8-8h24a8 8 0 0 1 8 8v1H8z" fill={colors.background.subtle} />
        {[14, 19, 24].map((cx) => (
          <Circle key={cx} cx={cx} cy={42.5} r={1.5} fill={colors.border.strong} />
        ))}
        <Rect x={14} y={54} width={20} height={4} rx={2} fill={ink} />
        <Rect x={14} y={62} width={16} height={3} rx={1.5} fill={colors.border.subtle} />
        <Rect x={14} y={68} width={24} height={3} rx={1.5} fill={colors.border.subtle} />
        {/* The server: three units, their lights, their slots. */}
        {[38, 52, 66].map((y, unit) => (
          <G key={y}>
            <Rect x={74} y={y} width={38} height={11} rx={3.5} fill={ink} />
            <Circle cx={80} cy={y + 5.5} r={1.7} fill={colors.success.solid} />
            {unit === 0 ? null : (
              <Circle cx={86} cy={y + 5.5} r={1.7} fill={paper} fillOpacity={0.3} />
            )}
            <Rect
              x={96}
              y={y + 4.2}
              width={11}
              height={2.6}
              rx={1.3}
              fill={paper}
              fillOpacity={0.22}
            />
          </G>
        ))}
        <Path d="M52 54H70" {...track} />
        <Path d="M52 64H70" {...track} />
      </Drawing>
      <Animated.View style={[sceneStyles.busy, busy]} />
      {OUT_DELAYS.map((delay) => (
        <Packet key={`out-${delay}`} delay={delay} loop={packets} still={still} out />
      ))}
      {BACK_DELAYS.map((delay) => (
        <Packet key={`back-${delay}`} delay={delay} loop={packets} still={still} out={false} />
      ))}
    </>
  );
}

function Packet({
  delay,
  loop,
  still,
  out
}: {
  delay: number;
  loop: SharedValue<number>;
  still: boolean;
  out: boolean;
}) {
  const { colors } = useTheme();
  const style = useAnimatedStyle(() => {
    const { x, opacity } = packetAt(loop.get(), delay, still);
    return { opacity, transform: [{ translateX: (out ? x : -x) * UNIT }] };
  }, [delay, still, out]);
  // Out, an orange packet from the shop; back, an ink one from the server.
  const radius = out ? 2.8 : 2.4;
  const [cx, cy] = out ? [52, 54] : [70, 64];
  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          left: (cx - radius) * UNIT,
          top: (cy - radius) * UNIT,
          width: 2 * radius * UNIT,
          height: 2 * radius * UNIT,
          borderRadius: radius * UNIT,
          backgroundColor: out ? palette.orange : colors.illustration.ink
        },
        style
      ]}
    />
  );
}

/** "Invoice": a caret writing the invoice, line after line, then its total. */
function InvoiceScene({ still }: { still: boolean }) {
  const { colors } = useTheme();
  const { ink, paper, shadow, ground } = colors.illustration;
  const loop = useLoop(INVOICE_CYCLE, still);
  const caret = useAnimatedStyle(() => {
    const { x, y, opacity } = caretAt(loop.get(), still);
    return { opacity, transform: [{ translateX: x * UNIT }, { translateY: y * UNIT }] };
  }, [still]);
  return (
    <>
      <Drawing>
        <Ellipse cx={60} cy={106} rx={30} ry={4} fill={ground} />
        <Rect x={30} y={18} width={60} height={86} rx={8} fill={shadow} />
        <Rect x={30} y={14} width={60} height={86} rx={8} fill={paper} />
        <Rect x={38} y={23} width={11} height={11} rx={3} fill={palette.orange} />
        <Rect x={64} y={25} width={18} height={3} rx={1.5} fill={colors.border.subtle} />
        <Rect x={70} y={31} width={12} height={3} rx={1.5} fill={colors.border.subtle} />
        {INVOICE_LINES.map(([x, y, width, height]) => (
          <Rect
            key={y}
            x={x}
            y={y}
            width={width}
            height={height}
            rx={height / 2}
            fill={colors.border.subtle}
          />
        ))}
      </Drawing>
      {INVOICE_LINES.map(([x, y, width, height], index) => (
        <InvoiceLine
          key={y}
          index={index}
          rect={[x, y, width, height]}
          color={index === INVOICE_LINES.length - 1 ? palette.orange : ink}
          loop={loop}
          still={still}
        />
      ))}
      <Animated.View style={[sceneStyles.caret, caret]} />
    </>
  );
}

function InvoiceLine({
  index,
  rect: [x, y, width, height],
  color,
  loop,
  still
}: {
  index: number;
  rect: readonly [number, number, number, number];
  color: string;
  loop: SharedValue<number>;
  still: boolean;
}) {
  const style = useAnimatedStyle(() => {
    const { scale, opacity } = fillAt(loop.get(), index, still);
    return { opacity, transform: [{ scaleX: scale }] };
  }, [index, still]);
  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          left: x * UNIT,
          top: y * UNIT,
          width: width * UNIT,
          height: height * UNIT,
          borderRadius: (height / 2) * UNIT,
          backgroundColor: color,
          transformOrigin: "left"
        },
        style
      ]}
    />
  );
}

/** The payer's page: a loupe circling the code, looking for the payment request. */
function PaymentScene({ still }: { still: boolean }) {
  const { colors } = useTheme();
  const { ink, paper, shadow, ground } = colors.illustration;
  const loop = useLoop(PAYMENT_CYCLE, still);
  const loupe = useAnimatedStyle(() => {
    const { x, y } = loupeAt(loop.get(), still);
    return { transform: [{ translateX: x * UNIT }, { translateY: y * UNIT }] };
  }, [still]);
  return (
    <>
      <Drawing>
        <Ellipse cx={60} cy={100} rx={30} ry={4} fill={ground} />
        <Rect x={32} y={36} width={56} height={56} rx={10} fill={shadow} />
        <Rect x={32} y={32} width={56} height={56} rx={10} fill={paper} />
        <G transform="translate(46 46)">
          <Path d={QR_MODULES} fill={ink} fillOpacity={0.35} />
        </G>
      </Drawing>
      {QR_FINDERS.map((d, index) => (
        <Finder key={d} d={d} pass={FINDER_PASSES[index] ?? 0} loop={loop} still={still} />
      ))}
      <Piece x={47} y={47} width={32} height={32} style={loupe}>
        <Circle cx={60} cy={60} r={11} fill={paper} fillOpacity={0.6} />
        <Circle cx={60} cy={60} r={11} fill="none" stroke={palette.orange} strokeWidth={3.4} />
        <Path
          d="M68 68L76 76"
          stroke={palette.orange}
          strokeWidth={4.6}
          strokeLinecap="round"
          fill="none"
        />
      </Piece>
    </>
  );
}

function Finder({
  d,
  pass,
  loop,
  still
}: {
  d: string;
  pass: number;
  loop: SharedValue<number>;
  still: boolean;
}) {
  const { colors } = useTheme();
  const style = useAnimatedStyle(
    () => ({ opacity: finderAt(loop.get(), pass, still) }),
    [pass, still]
  );
  // Its frame's corner, from its path ("M64 46…"): the piece's place.
  const [x, y] = d.slice(1).split(/[h ]/).map(Number);
  return (
    <Piece x={x ?? 0} y={y ?? 0} width={10} height={10} style={style}>
      <Path d={d} fill={colors.illustration.ink} fillRule="evenodd" />
    </Piece>
  );
}

/**
 * "Articles": a price tag swinging on its pin, its price and barcode on it; its shadow on the
 * ground follows its foot.
 */
function ArticlesScene({ still }: { still: boolean }) {
  const { colors } = useTheme();
  const { ink, paper, shadow, ground, disc } = colors.illustration;
  const loop = useLoop(ARTICLES_CYCLE, still);
  const swing = useAnimatedStyle(() => {
    return { transform: [{ rotate: `${swingAt(loop.get(), still).angle}deg` }] };
  }, [still]);
  const follow = useAnimatedStyle(() => {
    return { transform: [{ translateX: swingAt(loop.get(), still).shift * UNIT }] };
  }, [still]);
  return (
    <>
      <Piece x={36} y={100} width={48} height={8} style={follow}>
        <Ellipse cx={60} cy={104} rx={18} ry={3.5} fill={ground} />
      </Piece>
      {/* Turning round its pin: (60, 22), 2 units under the piece's top. */}
      <Piece x={36} y={20} width={48} height={82} origin={`50% ${(2 / 82) * 100}%`} style={swing}>
        <Path d="M60 22V40" stroke={ink} strokeWidth={1.8} strokeLinecap="round" />
        <Path d={TAG} fill={shadow} transform="translate(0 4)" />
        <Path d={TAG} fill={paper} />
        <Circle cx={60} cy={42} r={3.2} fill={disc} />
        <Rect x={47} y={53} width={26} height={7} rx={3.5} fill={palette.orange} />
        <Rect x={47} y={65} width={18} height={4} rx={2} fill={ink} fillOpacity={0.25} />
        <Path d={TAG_BARCODE} fill={ink} />
      </Piece>
      <Drawing>
        <Circle cx={60} cy={22} r={3.4} fill={ink} />
      </Drawing>
    </>
  );
}

/** The price tag: a pointed top round its hole, rounded corners below. */
const TAG =
  "M44 46a4 4 0 0 1 1.6-3.2l12-9a4 4 0 0 1 4.8 0l12 9A4 4 0 0 1 76 46v44a6 6 0 0 1-6 6H50a6 6 0 0 1-6-6z";
/** The tag's barcode: its bars, each at `x`, `w` wide, from 76 to 88. */
const TAG_BARCODE = [
  [48, 1.6],
  [50.6, 0.8],
  [52.4, 2.2],
  [55.6, 0.8],
  [57.4, 1.4],
  [59.8, 2],
  [62.8, 0.8],
  [64.6, 1.6],
  [67.2, 0.8],
  [69, 2.2],
  [71.2, 0.8]
]
  .map(([x, w]) => `M${x} 76h${w}v12h${-(w ?? 0)}z`)
  .join(" ");

const SCENES: Record<LoadingSceneKind, (props: { still: boolean }) => ReactNode> = {
  wallet: WalletScene,
  cards: CardsScene,
  team: TeamScene,
  integrations: IntegrationsScene,
  invoice: InvoiceScene,
  payment: PaymentScene,
  articles: ArticlesScene
};

/** What a screen shows of its loading scene: which, its words, its test ID. */
export type LoadingSceneSpec = { scene: LoadingSceneKind; label: string; testID?: string };

/**
 * A screen's loading scene, from what it waits for (`waiting`: the scene to show, or null once
 * read): `scene` to draw in its place, `leaving` once read, for motion.loadingExit, while it fades
 * out (only if it showed: a wait shorter than motion.loadingDelay showed nothing, its content
 * comes at once); then null, the content's turn. `waited`: the screen waited on its scene since it
 * mounted, its content fades in (Arrival.tsx). The screen draws `scene` in one place, waiting and
 * leaving, so that it is the same scene that fades out.
 */
export function useLoadingScene(waiting: LoadingSceneSpec | null): {
  scene: (LoadingSceneSpec & { leaving: boolean }) | null;
  waited: boolean;
} {
  // What the screen waits for, or waited for last: whether its scene showed (past its delay,
  // told by a timer) and whether it is leaving. Updated while rendering, so that the render that
  // ends the wait already draws it leaving.
  const [held, setHeld] = useState<{
    spec: LoadingSceneSpec;
    shown: boolean;
    leaving: boolean;
  } | null>(waiting ? { spec: waiting, shown: false, leaving: false } : null);
  const [waited, setWaited] = useState(waiting !== null);
  if (waiting !== null && !waited) setWaited(true);
  if (waiting !== null) {
    const same =
      held !== null &&
      !held.leaving &&
      held.spec.scene === waiting.scene &&
      held.spec.label === waiting.label &&
      held.spec.testID === waiting.testID;
    // Waited on again while leaving: the scene, which showed, comes back.
    if (!same) setHeld({ spec: waiting, shown: held?.shown ?? false, leaving: false });
  } else if (held !== null && !held.leaving) {
    // Shown: it fades out; not yet: nothing to fade.
    setHeld(held.shown ? { ...held, leaving: true } : null);
  }
  const counting = held !== null && !held.shown;
  useEffect(() => {
    if (!counting) return;
    const timer = setTimeout(
      () => setHeld((current) => (current ? { ...current, shown: true } : current)),
      motion.loadingDelay
    );
    return () => clearTimeout(timer);
  }, [counting]);
  const leaving = held?.leaving ?? false;
  useEffect(() => {
    if (!leaving) return;
    const timer = setTimeout(() => setHeld(null), motion.loadingExit);
    return () => clearTimeout(timer);
  }, [leaving]);
  if (waiting !== null) return { scene: { ...waiting, leaving: false }, waited: true };
  if (held !== null && held.shown) return { scene: { ...held.spec, leaving: true }, waited };
  return { scene: null, waited };
}

/**
 * What a screen waits for: its scene, and `label` under it, which screen readers read (the scene
 * is decorative; `testID` is the scene's). Nothing shows for motion.loadingDelay, so that what
 * the device reads at once never flashes a scene; then it fades in, growing from 94 %, fading only
 * with Reduce Motion. `leaving` (useLoadingScene): read, it fades out (motion.loadingExit),
 * shrinking back to 96 %.
 */
export function LoadingScene({
  scene,
  label,
  testID,
  leaving = false
}: {
  scene: LoadingSceneKind;
  label: string;
  testID?: string;
  leaving?: boolean;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const still = useReducedMotion();
  const shown = useSharedValue(0);
  const gone = useSharedValue(0);

  useEffect(() => {
    shown.set(
      withDelay(
        motion.loadingDelay,
        withTiming(1, {
          duration: motion.loadingEnter,
          easing: Easing.out(Easing.cubic),
          reduceMotion: ReduceMotion.Never
        }),
        ReduceMotion.Never
      )
    );
    return () => cancelAnimation(shown);
  }, [shown]);

  // Waited on again while it was leaving: it comes back.
  useEffect(() => {
    gone.set(
      withTiming(leaving ? 1 : 0, {
        duration: motion.loadingExit,
        // Most of the fade at once, so that it is seen; its end, faint, also hides the frame or two
        // by which the hold's timer (useLoadingScene, on the JS thread) may beat it.
        easing: Easing.out(Easing.cubic),
        reduceMotion: ReduceMotion.Never
      })
    );
    return () => cancelAnimation(gone);
  }, [leaving, gone]);

  const enter = useAnimatedStyle(() => {
    const share = shown.get() * (1 - gone.get());
    const scale = still ? 1 : 0.94 + 0.06 * shown.get() - 0.04 * gone.get();
    return { opacity: share, transform: [{ scale }] };
  }, [still]);

  const Scene = SCENES[scene];
  return (
    <Animated.View
      style={[styles.root, enter]}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityLiveRegion="polite"
    >
      <View
        aria-hidden
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        testID={testID}
        style={sceneStyles.box}
      >
        <View style={[sceneStyles.disc, { backgroundColor: colors.illustration.disc }]} />
        <View style={sceneStyles.ring}>
          <Spinner size={RING} thickness={RING_STROKE} />
        </View>
        <View style={sceneStyles.scene}>
          <Scene still={still} />
        </View>
      </View>
      <Text style={styles.label}>{label}</Text>
    </Animated.View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  root: { alignItems: "center", gap: 16 },
  label: {
    ...sans(600),
    fontSize: type.label,
    letterSpacing: tracked.label,
    color: colors.text.secondary,
    textAlign: "center"
  }
}));

/** The scenes' places, the same in both themes. */
const sceneStyles = StyleSheet.create({
  box: { width: BOX, height: BOX },
  disc: {
    position: "absolute",
    left: SCENE_INSET,
    top: SCENE_INSET,
    width: SCENE,
    height: SCENE,
    borderRadius: SCENE / 2
  },
  ring: { position: "absolute", left: (BOX - RING) / 2, top: (BOX - RING) / 2 },
  scene: {
    position: "absolute",
    left: SCENE_INSET,
    top: SCENE_INSET,
    width: SCENE,
    height: SCENE
  },
  cardWindow: {
    position: "absolute",
    left: 20 * UNIT,
    top: 35 * UNIT,
    width: 80 * UNIT,
    height: 50 * UNIT,
    borderRadius: 8 * UNIT,
    overflow: "hidden"
  },
  // The beam's glow above its line, 14 units, from above the card's top: it sweeps downwards.
  beam: { position: "absolute", left: 0, right: 0, top: -14 * UNIT, height: 16.2 * UNIT },
  beamGlow: { height: 14 * UNIT, backgroundColor: palette.orange, opacity: 0.22 },
  beamLine: { height: 2.2 * UNIT, marginTop: -1 * UNIT, backgroundColor: palette.orange },
  avatar: { position: "absolute", width: 30 * UNIT, height: 30 * UNIT },
  busy: {
    position: "absolute",
    left: (86 - 1.7) * UNIT,
    top: (43.5 - 1.7) * UNIT,
    width: 3.4 * UNIT,
    height: 3.4 * UNIT,
    borderRadius: 1.7 * UNIT,
    backgroundColor: palette.orange
  },
  caret: {
    position: "absolute",
    left: 37 * UNIT,
    top: 45 * UNIT,
    width: 2 * UNIT,
    height: 7 * UNIT,
    borderRadius: UNIT,
    backgroundColor: palette.orange
  }
});
