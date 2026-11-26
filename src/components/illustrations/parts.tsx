import type { ReactNode } from "react";
import Svg, { Circle, Ellipse, G, Path, Rect } from "react-native-svg";

import { palette, useTheme } from "@/theme";

/*
 * What the empty screens' drawings are made of: flat shapes in the app's colours on its cream disc, 120 units square, drawn at
 * any size. Wordless, so that no language needs its own: what each step says is in its texts
 * (StepGuide). Never a gradient nor a filter: a panel's shadow is a flat copy of it, a little lower.
 */

/** A drawing's square: its units, whatever its size on the screen. */
const SIDE = 120;

/** The canvas's disc (cream in the light theme), then the drawing, `size` px square. */
export function Art({ size, children }: { size: number; children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${SIDE} ${SIDE}`}>
      <Circle cx={SIDE / 2} cy={SIDE / 2} r={SIDE / 2} fill={colors.background.app} />
      {children}
    </Svg>
  );
}

/** A panel (a sheet, a list, a window), in the drawing's paper, on its flat shadow. */
export function Panel({
  x,
  y,
  width,
  height,
  radius = 12
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  radius?: number;
}) {
  const { colors } = useTheme();
  return (
    <>
      <Rect
        x={x}
        y={y + 4}
        width={width}
        height={height}
        rx={radius}
        fill={colors.illustration.shadow}
      />
      <Rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={radius}
        fill={colors.illustration.paper}
      />
    </>
  );
}

/** The ground under an object standing on it. */
export function Ground({ cx, cy, rx }: { cx: number; cy: number; rx: number }) {
  const { colors } = useTheme();
  return <Ellipse cx={cx} cy={cy} rx={rx} ry={4} fill={colors.illustration.ground} />;
}

/** A line of text, drawn as a bar: in ink (what is read first) or faint (what comes after). */
export function Bar({
  x,
  y,
  width,
  height = 4,
  color,
  opacity = 1
}: {
  x: number;
  y: number;
  width: number;
  height?: number;
  color?: string;
  opacity?: number;
}) {
  const { colors } = useTheme();
  return (
    <Rect
      x={x}
      y={y}
      width={width}
      height={height}
      rx={height / 2}
      fill={color ?? colors.illustration.ink}
      fillOpacity={opacity}
    />
  );
}

/** A faint bar: the ink at 14 %, the hairline's. */
export function FaintBar(props: { x: number; y: number; width: number; height?: number }) {
  const { colors } = useTheme();
  return <Bar {...props} color={colors.border.subtle} />;
}

/**
 * A phone seen from the front, its screen in the drawing's paper (or `screen`) under its island:
 * `width` × `height` from (x, y).
 */
export function PhoneFront({
  x,
  y,
  width,
  height,
  screen
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  screen?: string;
}) {
  const { colors } = useTheme();
  const radius = width > 46 ? 11 : 10;
  return (
    <>
      <Rect x={x} y={y} width={width} height={height} rx={radius} fill={colors.illustration.ink} />
      <Rect
        x={x + 3.5}
        y={y + 3.5}
        width={width - 7}
        height={height - 7}
        rx={radius - 3}
        fill={screen ?? colors.illustration.paper}
      />
      <Rect
        x={x + width / 2 - 6}
        y={y + 7}
        width={12}
        height={3.5}
        rx={1.75}
        fill={colors.illustration.ink}
      />
    </>
  );
}

/** The finder squares of the QR mark, cut out of their frames (even-odd). */
const QR_FINDERS =
  "M0 0h10v10H0z M2 2v6h6V2z M18 0h10v10H18z M20 2v6h6V2z M0 18h10v10H0z M2 20v6h6v-6z";
/** Their centres, and the modules between them: a drawing of a code, read by nothing. */
const QR_MODULES =
  "M3.5 3.5h3v3h-3z M21.5 3.5h3v3h-3z M3.5 21.5h3v3h-3z M12 1h2.4v2.4h-2.4z " +
  "M14.5 4.5h2.4v2.4h-2.4z M12 7.5h2.4v2.4h-2.4z M1 12h2.4v2.4h-2.4z M4.5 14.5h2.4v2.4h-2.4z " +
  "M7.5 12h2.4v2.4h-2.4z M12 12h2.4v2.4h-2.4z M15 12.5h2.4v2.4h-2.4z M18.5 12h2.4v2.4h-2.4z " +
  "M22 13h2.4v2.4h-2.4z M25.5 12h2.4v2.4h-2.4z M12 15.5h2.4v2.4h-2.4z M16 17h2.4v2.4h-2.4z " +
  "M19.5 15.5h2.4v2.4h-2.4z M23 17h2.4v2.4h-2.4z M25.5 19.5h2.4v2.4h-2.4z M13 20.5h2.4v2.4h-2.4z " +
  "M17 21.5h2.4v2.4h-2.4z M21 20.5h2.4v2.4h-2.4z M24.5 23.5h2.4v2.4h-2.4z M12.5 25h2.4v2.4h-2.4z " +
  "M16.5 25.5h2.4v2.4h-2.4z M20.5 24.5h2.4v2.4h-2.4z";

/** A QR code's drawing, 28 units square at `scale` 1, from (x, y). */
export function QrMark({
  x,
  y,
  scale = 1,
  color,
  opacity = 1
}: {
  x: number;
  y: number;
  scale?: number;
  color?: string;
  opacity?: number;
}) {
  const { colors } = useTheme();
  return (
    <G
      transform={`translate(${x} ${y}) scale(${scale})`}
      fill={color ?? colors.illustration.ink}
      fillOpacity={opacity}
    >
      <Path fillRule="evenodd" d={QR_FINDERS} />
      <Path d={QR_MODULES} />
    </G>
  );
}

/**
 * The Bitcoin logo as published (public domain: Wikimedia Commons, File:Bitcoin.svg), in its own
 * 64-unit box: its orange disc, centred on (31.994, 32.003) with a radius of 32, and its white
 * sign.
 */
const BITCOIN_DISC =
  "m63.033,39.744c-4.274,17.143-21.637,27.576-38.782,23.301-17.138-4.274-27.571-21.638" +
  "-23.295-38.78,4.272-17.145,21.635-27.579,38.775-23.305,17.144,4.274,27.576,21.64," +
  "23.302,38.784z";
const BITCOIN_SIGN =
  "m46.103,27.444c0.637-4.258-2.605-6.547-7.038-8.074l1.438-5.768-3.511-0.875-1.4,5.616" +
  "c-0.923-0.23-1.871-0.447-2.813-0.662l1.41-5.653-3.509-0.875-1.439,5.766c-0.764-0.174" +
  "-1.514-0.346-2.242-0.527l0.004-0.018-4.842-1.209-0.934,3.75s2.605,0.597,2.55,0.634" +
  "c1.422,0.355,1.679,1.296,1.636,2.042l-1.638,6.571c0.098,0.025,0.225,0.061,0.365," +
  "0.117-0.117-0.029-0.242-0.061-0.371-0.092l-2.296,9.205c-0.174,0.432-0.615,1.08" +
  "-1.609,0.834,0.035,0.051-2.552-0.637-2.552-0.637l-1.743,4.019,4.569,1.139c0.85," +
  "0.213,1.683,0.436,2.503,0.646l-1.453,5.834,3.507,0.875,1.439-5.772c0.958,0.26,1.888," +
  "0.5,2.798,0.726l-1.434,5.745,3.511,0.875,1.453-5.823c5.987,1.133,10.489,0.676,12.384" +
  "-4.739,1.527-4.36-0.076-6.875-3.226-8.515,2.294-0.529,4.022-2.038,4.483-5.155zm" +
  "-8.022,11.249c-1.085,4.36-8.426,2.003-10.806,1.412l1.928-7.729c2.38,0.594,10.012," +
  "1.77,8.878,6.317zm1.086-11.312c-0.99,3.966-7.1,1.951-9.082,1.457l1.748-7.01c1.982," +
  "0.494,8.365,1.416,7.334,5.553z";

/**
 * A coin: the Bitcoin logo itself (`bitcoin`: a payment, sats), or an orange coin with a plus in ink
 * on it (`plus`: sats added).
 */
export function Coin({
  cx,
  cy,
  r,
  mark
}: {
  cx: number;
  cy: number;
  r: number;
  mark: "bitcoin" | "plus";
}) {
  if (mark === "bitcoin") {
    return (
      <G transform={`translate(${cx} ${cy}) scale(${r / 32}) translate(-31.994 -32.003)`}>
        <Path d={BITCOIN_DISC} fill={palette.orange} />
        <Path d={BITCOIN_SIGN} fill={palette.white} />
      </G>
    );
  }
  return (
    <G transform={`translate(${cx} ${cy})`}>
      <Circle r={r} fill={palette.orange} />
      <Path
        d={`M0 ${-r * 0.46}v${r * 0.92}M${-r * 0.46} 0h${r * 0.92}`}
        stroke={palette.ink}
        strokeWidth={r * 0.21}
        strokeLinecap="round"
      />
    </G>
  );
}

/** Done: the settled state's green disc, a white check on it. */
export function CheckBadge({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  const { colors } = useTheme();
  const k = r / 11;
  return (
    <G transform={`translate(${cx} ${cy})`}>
      <Circle r={r} fill={colors.success.solid} />
      <Path
        d="M-4.7 0.4l3.2 3.2 6.2-6.6"
        transform={`scale(${k})`}
        stroke={palette.white}
        strokeWidth={2.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </G>
  );
}

/** The contactless waves (HoldStage's), 24 units square at `scale` 1, from (x, y). */
export function Waves({
  x,
  y,
  scale,
  color,
  width = 2.4,
  opacity = 1
}: {
  x: number;
  y: number;
  scale: number;
  color: string;
  width?: number;
  opacity?: number;
}) {
  return (
    <G
      transform={`translate(${x} ${y}) scale(${scale})`}
      fill="none"
      stroke={color}
      strokeOpacity={opacity}
      strokeWidth={width}
      strokeLinecap="round"
    >
      <Path d="M6 8.32a7.43 7.43 0 0 1 0 7.36" />
      <Path d="M9.46 6.21a11.76 11.76 0 0 1 0 11.58" />
      <Path d="M12.91 4.1a15.91 15.91 0 0 1 .01 15.8" />
    </G>
  );
}

/** Where something goes: a dotted orange path. */
export function Route({ d }: { d: string }) {
  return (
    <Path
      d={d}
      stroke={palette.orange}
      strokeWidth={2.2}
      strokeDasharray="0.1 5"
      strokeLinecap="round"
      fill="none"
    />
  );
}

/** A browser's window: a panel, its bar in sand with its three dots. */
export function BrowserWindow({
  x,
  y,
  width,
  height
}: {
  x: number;
  y: number;
  width: number;
  height: number;
}) {
  const { colors } = useTheme();
  return (
    <>
      <Panel x={x} y={y} width={width} height={height} radius={10} />
      <Path
        d={`M${x} ${y + 10}a10 10 0 0 1 10-10h${width - 20}a10 10 0 0 1 10 10v2H${x}z`}
        fill={colors.background.subtle}
      />
      {[9, 15, 21].map((dx) => (
        <Circle key={dx} cx={x + dx} cy={y + 6.5} r={1.8} fill={colors.border.strong} />
      ))}
    </>
  );
}

/** A shop's front: its striped awning, its door and its two windows, `width` wide from (x, y). */
export function Storefront({ x, y, width }: { x: number; y: number; width: number }) {
  // Drawn at 40 units wide (body), scaled to `width`.
  const { colors } = useTheme();
  const k = width / 40;
  return (
    <G transform={`translate(${x} ${y}) scale(${k})`}>
      <Rect x={0} y={14} width={40} height={34} rx={4} fill={colors.illustration.shadow} />
      <Rect x={0} y={10} width={40} height={34} rx={4} fill={colors.illustration.paper} />
      <Rect x={-3} y={0} width={46} height={12} rx={3} fill={palette.orange} />
      {[4, 17, 30].map((dx) => (
        <Rect
          key={dx}
          x={dx}
          y={0}
          width={6.5}
          height={12}
          fill={palette.white}
          fillOpacity={0.92}
        />
      ))}
      <Rect x={15} y={22} width={10} height={22} rx={2} fill={colors.illustration.ink} />
      <Rect x={4} y={18} width={8} height={9} rx={1.5} fill={colors.background.accentSubtle} />
      <Rect x={28} y={18} width={8} height={9} rx={1.5} fill={colors.background.accentSubtle} />
    </G>
  );
}
