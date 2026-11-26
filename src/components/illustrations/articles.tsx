import { Circle, Path, Rect } from "react-native-svg";

import { palette, useTheme, type ThemeColors } from "@/theme";

import { Art, Bar, Coin, FaintBar, Ground, Panel, QrMark, Route } from "./parts";

/** A product's barcode: its bars, each `M x y h w v 14 h -w z`. */
const BARCODE = [
  [34, 2],
  [37.2, 1],
  [39.4, 3],
  [43.6, 1],
  [46.2, 1.5],
  [48.9, 2.5],
  [52.6, 1],
  [54.8, 1],
  [57.4, 3],
  [61.6, 1.5],
  [64.3, 1],
  [66.5, 2],
  [70.1, 1],
  [72.3, 2.5],
  [76, 1],
  [78.2, 1.5],
  [80.9, 3],
  [85.1, 1]
]
  .map(([x, w]) => `M${x} 82h${w}v14h${-w}z`)
  .join(" ");

/** "Create your items": an article's sheet, its photo, name, price, and its barcode scanned. */
export function ArticleCreateArt({ size }: { size: number }) {
  const { colors } = useTheme();
  return (
    <Art size={size}>
      <Panel x={20} y={18} width={80} height={84} />
      <Rect x={27} y={25} width={66} height={38} rx={8} fill={colors.background.accentSubtle} />
      <Path
        d="M56 36c-2-2 2-3.5 0-6 M63 36c-2-2 2-3.5 0-6"
        stroke={colors.text.accent}
        strokeOpacity={0.45}
        strokeWidth={1.8}
        strokeLinecap="round"
        fill="none"
      />
      <Path d="M49 39h22v9a9 9 0 0 1-9 9h-4a9 9 0 0 1-9-9z" fill={palette.white} />
      <Path
        d="M71 42h2.5a4.5 4.5 0 0 1 0 9H70"
        stroke={palette.white}
        strokeWidth={2.6}
        fill="none"
      />
      <Rect x={45} y={57} width={30} height={2.8} rx={1.4} fill={palette.white} />
      <Bar x={27} y={70} width={34} height={5} />
      <Bar x={73} y={70} width={20} height={5} color={colors.text.accent} />
      <Path d={BARCODE} fill={colors.illustration.ink} />
      <Rect x={28} y={88.1} width={64} height={1.8} rx={0.9} fill={palette.orange} />
    </Art>
  );
}

/** The tiles of the point of sale's "Items", each its photo's tint (the one touched apart). */
function tiles(colors: ThemeColors): readonly { x: number; y: number; tint: string }[] {
  return [
    { x: 22, y: 46, tint: colors.background.accentSubtle },
    { x: 76, y: 46, tint: colors.state.unconfirmed.bg },
    { x: 22, y: 76, tint: colors.state.canceled.bg },
    { x: 49, y: 76, tint: colors.state.underpaid.bg },
    { x: 76, y: 76, tint: colors.state.open.bg }
  ];
}

/** "Tap them at the point of sale": "Items" chosen, an article touched and added to the basket. */
export function ArticleTapArt({ size }: { size: number }) {
  const { colors } = useTheme();
  return (
    <Art size={size}>
      <Panel x={14} y={16} width={92} height={88} radius={14} />
      <Rect x={22} y={24} width={76} height={15} rx={7.5} fill={colors.background.subtle} />
      <Rect x={60} y={25.5} width={36.5} height={12} rx={6} fill={colors.illustration.paper} />
      {[37, 41, 45].flatMap((cx) =>
        [29.5, 33.5].map((cy) => (
          <Circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={1.2} fill={colors.text.secondary} />
        ))
      )}
      {[74.5, 78.9].flatMap((x) =>
        [27.8, 32.2].map((y) => (
          <Rect
            key={`${x}-${y}`}
            x={x}
            y={y}
            width={3.4}
            height={3.4}
            rx={0.8}
            fill={colors.illustration.ink}
          />
        ))
      )}
      {tiles(colors).map(({ x, y, tint }) => (
        <Tile key={`${x}-${y}`} x={x} y={y} tint={tint} />
      ))}
      <Tile x={49} y={46} tint={colors.state.settled.bg} touched />
      <Circle
        cx={60}
        cy={58}
        r={11}
        fill="none"
        stroke={palette.orange}
        strokeOpacity={0.4}
        strokeWidth={1.6}
      />
      <Coin cx={71} cy={46.5} r={7} mark="plus" />
    </Art>
  );
}

function Tile({
  x,
  y,
  tint,
  touched = false
}: {
  x: number;
  y: number;
  tint: string;
  touched?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <>
      <Rect
        x={x}
        y={y}
        width={22}
        height={26}
        rx={6}
        fill={touched ? colors.illustration.paper : colors.background.app}
        stroke={touched ? palette.orange : undefined}
        strokeWidth={touched ? 2 : undefined}
      />
      <Circle cx={x + 11} cy={y + 10} r={6} fill={tint} />
      <FaintBar x={x + 5} y={y + 19} width={12} height={3} />
    </>
  );
}

/** The basket's lines, each its article's tint and the length of its name. */
function lines(colors: ThemeColors): readonly { cy: number; tint: string; width: number }[] {
  return [
    { cy: 34, tint: colors.background.accentSubtle, width: 16 },
    { cy: 46, tint: colors.state.settled.bg, width: 13 },
    { cy: 58, tint: colors.state.unconfirmed.bg, width: 15 }
  ];
}

/** "Charge the basket": the basket's lines and total, then its code to pay. */
export function ArticleCashArt({ size }: { size: number }) {
  const { colors } = useTheme();
  return (
    <Art size={size}>
      <Ground cx={60} cy={108} rx={40} />
      <Panel x={14} y={22} width={46} height={78} radius={8} />
      {lines(colors).map(({ cy, tint, width }) => (
        <Line key={cy} cy={cy} tint={tint} width={width} />
      ))}
      <Path
        d="M20 69H54"
        stroke={colors.illustration.ink}
        strokeOpacity={0.22}
        strokeWidth={1.2}
        strokeDasharray="2 2"
      />
      <FaintBar x={20} y={77} width={12} />
      <Bar x={36} y={76} width={18} height={6} />
      <Route d="M50 90C62 100 84 98 90 82" />
      <Panel x={72} y={40} width={38} height={38} radius={8} />
      <QrMark x={77} y={45} />
      <Coin cx={104} cy={34} r={9} mark="bitcoin" />
    </Art>
  );
}

function Line({ cy, tint, width }: { cy: number; tint: string; width: number }) {
  return (
    <>
      <Circle cx={22} cy={cy} r={4} fill={tint} />
      <Bar x={29} y={cy - 1.8} width={width} height={3.5} opacity={0.55} />
      <FaintBar x={48} y={cy - 1.8} width={7} height={3.5} />
    </>
  );
}
