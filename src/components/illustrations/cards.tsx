import { Circle, G, Rect } from "react-native-svg";

import { palette, useTheme } from "@/theme";

import { Art, Bar, CheckBadge, Coin, FaintBar, Ground, PhoneFront, Route, Waves } from "./parts";

/** "Program it": a card held to the back of a phone (HoldStage's), its waves on it. */
export function CardProgramArt({ size }: { size: number }) {
  const { colors } = useTheme();
  return (
    <Art size={size}>
      <Ground cx={62} cy={108} rx={38} />
      <Rect
        x={23}
        y={13}
        width={48}
        height={92}
        rx={12}
        fill={colors.illustration.phone}
        stroke={colors.illustration.ink}
        strokeWidth={2}
      />
      <Rect x={29} y={19} width={18} height={20} rx={6} fill={colors.illustration.module} />
      {[24.5, 33].map((cy) => (
        <Circle
          key={cy}
          cx={38}
          cy={cy}
          r={3.6}
          fill={colors.illustration.lens}
          stroke={colors.illustration.lensRing}
          strokeWidth={1.2}
        />
      ))}
      <G transform="rotate(-10 72 74)">
        <Rect x={40} y={60} width={64} height={40} rx={6} fill={palette.ink} fillOpacity={0.2} />
        <Rect x={40} y={56} width={64} height={40} rx={6} fill={palette.orange} />
        <Bar x={47} y={63} width={24} height={4.5} color={palette.ink} />
        <Bar x={47} y={84} width={16} height={3.5} color={palette.ink} opacity={0.45} />
        <Waves x={84} y={61} scale={0.8} color={palette.ink} />
      </G>
    </Art>
  );
}

/** "Top it up": sats dropping onto the card, its own balance filling. */
export function CardRechargeArt({ size }: { size: number }) {
  const { colors } = useTheme();
  return (
    <Art size={size}>
      <Ground cx={58} cy={110} rx={38} />
      <G transform="rotate(-6 56 80)">
        <Rect x={20} y={62} width={72} height={46} rx={7} fill={palette.ink} fillOpacity={0.16} />
        <Rect x={20} y={58} width={72} height={46} rx={7} fill={colors.cardFace.night} />
        <Bar x={28} y={66} width={26} height={4.5} color={palette.white} opacity={0.9} />
        <Bar x={28} y={91} width={46} height={5} color={palette.white} opacity={0.2} />
        <Bar x={28} y={91} width={30} height={5} color={palette.orange} />
        <Waves x={73} y={62} scale={0.72} color={palette.white} opacity={0.85} />
      </G>
      <Route d="M84 46C83 52 78 56 70 58" />
      <Coin cx={88} cy={31} r={13} mark="plus" />
      <Coin cx={57} cy={32} r={8.5} mark="bitcoin" />
    </Art>
  );
}

/** "Pay with a tap": the card against a merchant's phone, the payment done. */
export function CardPayArt({ size }: { size: number }) {
  const { colors } = useTheme();
  return (
    <Art size={size}>
      <Ground cx={60} cy={108} rx={40} />
      <PhoneFront x={14} y={16} width={48} height={90} />
      <Bar x={24} y={34} width={28} height={6} />
      <FaintBar x={29} y={43.5} width={18} height={3.5} />
      <Waves x={24} y={57} scale={1.15} color={palette.orange} width={2.2} />
      <G transform="rotate(-14 80 72)">
        <Rect x={50} y={57} width={58} height={37} rx={6} fill={palette.ink} fillOpacity={0.2} />
        <Rect x={50} y={53} width={58} height={37} rx={6} fill={colors.illustration.ink} />
        <Bar
          x={57}
          y={60}
          width={22}
          height={4.5}
          color={colors.illustration.paper}
          opacity={0.9}
        />
        <Bar
          x={57}
          y={79}
          width={14}
          height={3.5}
          color={colors.illustration.paper}
          opacity={0.45}
        />
        <Waves x={90} y={57} scale={0.65} color={palette.orange} width={2.6} />
      </G>
      <CheckBadge cx={95} cy={30} r={12} />
    </Art>
  );
}
