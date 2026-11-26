import { Circle, Ellipse, Path, Rect } from "react-native-svg";

import { palette, useTheme } from "@/theme";

import {
  Art,
  Bar,
  BrowserWindow,
  CheckBadge,
  FaintBar,
  Ground,
  Panel,
  QrMark,
  Route
} from "./parts";

/** A glyph's stroke: its colour is given where it is drawn. */
const GLYPH = {
  strokeLinecap: "round",
  strokeLinejoin: "round",
  fill: "none"
} as const;

/**
 * "Create the integration": "New integration"'s choices, drawn as plain glyphs (never a
 * platform's logo): a shop, a bag, code, a cart, a terminal, the web; the shop chosen.
 */
export function IntegrationCreateArt({ size }: { size: number }) {
  const { colors } = useTheme();
  const STROKE = { ...GLYPH, stroke: colors.illustration.ink };
  return (
    <Art size={size}>
      <BrowserWindow x={12} y={24} width={96} height={72} />
      {[
        [20, 44],
        [78, 44],
        [20, 70],
        [49, 70],
        [78, 70]
      ].map(([x, y]) => (
        <Rect
          key={`${x}-${y}`}
          x={x}
          y={y}
          width={22}
          height={20}
          rx={5}
          fill={colors.background.app}
        />
      ))}
      <Rect x={26} y={50} width={10} height={9} rx={1.8} fill={colors.illustration.ink} />
      <Path d="M28.5 50v-1.2a2.5 2.5 0 0 1 5 0V50" {...STROKE} strokeWidth={1.4} />
      <Path d="M85 51l-3 3 3 3 M93 51l3 3-3 3 M90.5 49.5l-3 9" {...STROKE} strokeWidth={1.6} />
      <Path d="M24.5 74.5h2.2l2 7.3h7.6l1.6-5.2H27.6" {...STROKE} strokeWidth={1.5} />
      <Circle cx={30} cy={85} r={1.3} fill={colors.illustration.ink} />
      <Circle cx={35.5} cy={85} r={1.3} fill={colors.illustration.ink} />
      <Path d="M54.5 76l3 3-3 3 M59.5 82.5h6" {...STROKE} strokeWidth={1.6} />
      <Circle cx={89} cy={80} r={5.2} {...STROKE} strokeWidth={1.4} />
      <Ellipse cx={89} cy={80} rx={2.2} ry={5.2} {...STROKE} strokeWidth={1.2} />
      <Path d="M83.8 80h10.4" {...STROKE} strokeWidth={1.2} />
      <Rect
        x={49}
        y={44}
        width={22}
        height={20}
        rx={5}
        fill={colors.illustration.paper}
        stroke={palette.orange}
        strokeWidth={2}
      />
      <Rect x={54} y={48.5} width={12} height={3.6} rx={1} fill={palette.orange} />
      <Rect x={55} y={52} width={10} height={8} rx={1} fill={colors.illustration.ink} />
      <Rect x={58.6} y={55} width={2.8} height={5} fill={colors.illustration.paper} />
      <Circle cx={71} cy={44} r={6.5} fill={palette.orange} />
      <Path d="M68.2 44.1l1.9 1.9 3.6-3.8" {...GLYPH} stroke={palette.ink} strokeWidth={1.7} />
    </Art>
  );
}

/** "Hand over the secret key": the key, masked, going to the shop's server. */
export function IntegrationKeyArt({ size }: { size: number }) {
  const { colors } = useTheme();
  return (
    <Art size={size}>
      <Ground cx={84} cy={106} rx={26} />
      {[48, 66, 84].map((y, index) => (
        <ServerUnit key={y} y={y} busy={index === 0} />
      ))}
      <Route d="M36 52C36 66 44 75 56 76" />
      <Path
        d="M53 72.5l4.2 3.5-4.2 3.5"
        stroke={palette.orange}
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <Panel x={12} y={26} width={64} height={22} radius={11} />
      <Circle cx={25} cy={37} r={5.5} fill={palette.orange} />
      <Circle cx={25} cy={37} r={2} fill={colors.illustration.paper} />
      <Rect x={29.5} y={35.6} width={11} height={2.8} rx={1} fill={palette.orange} />
      <Rect x={36.4} y={38} width={2.4} height={3.6} rx={0.6} fill={palette.orange} />
      <Rect x={32.4} y={38} width={2.4} height={2.6} rx={0.6} fill={palette.orange} />
      {[47, 52.5, 58, 63.5, 69].map((cx) => (
        <Circle key={cx} cx={cx} cy={37} r={1.7} fill={colors.illustration.ink} />
      ))}
    </Art>
  );
}

/** A unit of the server: its lights (green, and orange while it works) and its slot. */
function ServerUnit({ y, busy }: { y: number; busy: boolean }) {
  const { colors } = useTheme();
  return (
    <>
      <Rect x={64} y={y} width={40} height={15} rx={4} fill={colors.illustration.ink} />
      <Circle cx={71} cy={y + 7.5} r={1.9} fill={colors.success.solid} />
      <Circle
        cx={77}
        cy={y + 7.5}
        r={1.9}
        fill={busy ? palette.orange : colors.illustration.paper}
        fillOpacity={busy ? 1 : 0.3}
      />
      <Bar
        x={86}
        y={y + 6}
        width={13}
        height={3}
        color={colors.illustration.paper}
        opacity={0.22}
      />
    </>
  );
}

/** "Your customers pay": the shop's checkout, its invoice's code, paid. */
export function IntegrationPayArt({ size }: { size: number }) {
  const { colors } = useTheme();
  return (
    <Art size={size}>
      <BrowserWindow x={14} y={22} width={92} height={70} />
      <Bar x={22} y={44} width={30} height={4.5} />
      <FaintBar x={22} y={53} width={24} height={3.5} />
      <FaintBar x={22} y={60} width={28} height={3.5} />
      <FaintBar x={22} y={72} width={12} />
      <Bar x={37} y={71} width={16} height={6} />
      <Rect x={60} y={41} width={38} height={38} rx={7} fill={colors.background.app} />
      <QrMark x={65} y={46} />
      <CheckBadge cx={97} cy={88} r={12} />
    </Art>
  );
}
