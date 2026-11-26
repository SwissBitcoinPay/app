import { Circle, G, Path, Rect } from "react-native-svg";

import { palette, useTheme } from "@/theme";

import {
  Art,
  Bar,
  CheckBadge,
  Coin,
  FaintBar,
  Ground,
  Panel,
  PhoneFront,
  QrMark,
  Route,
  Storefront
} from "./parts";

/** "Invite": a name typed in its field, the invitation's button under it, a person added. */
export function TeamInviteArt({ size }: { size: number }) {
  const { colors } = useTheme();
  return (
    <Art size={size}>
      <Panel x={18} y={36} width={84} height={58} />
      <FaintBar x={28} y={46} width={28} />
      <Rect
        x={28}
        y={55}
        width={64}
        height={17}
        rx={6}
        fill={colors.background.app}
        stroke={palette.orange}
        strokeWidth={1.5}
      />
      <Bar x={34} y={61.25} width={22} height={4.5} />
      <Rect x={58.5} y={59} width={1.6} height={9} rx={0.8} fill={palette.orange} />
      <Rect x={28} y={78} width={64} height={9} rx={4.5} fill={palette.orange} />
      <Circle cx={90} cy={34} r={14} fill={colors.illustration.ink} />
      <Circle cx={86.5} cy={31} r={3.4} fill={colors.illustration.paper} />
      <Path d="M80.5 41.5a6 5.5 0 0 1 12 0z" fill={colors.illustration.paper} />
      <Path
        d="M97.5 26v7M94 29.5h7"
        stroke={palette.orange}
        strokeWidth={2.2}
        strokeLinecap="round"
      />
    </Art>
  );
}

/** "Set up their phone": the invitation's code, scanned by the employee's phone. */
export function TeamActivateArt({ size }: { size: number }) {
  const { colors } = useTheme();
  return (
    <Art size={size}>
      <Ground cx={62} cy={108} rx={40} />
      <PhoneFront x={14} y={20} width={44} height={84} />
      <FaintBar x={24} y={38} width={24} />
      <QrMark x={22} y={47} />
      <Rect x={24} y={84} width={24} height={7} rx={3.5} fill={palette.orange} />
      <G transform="rotate(8 84 66)">
        <PhoneFront x={62} y={26} width={44} height={82} screen={colors.illustration.phone} />
        <Path
          d="M72 58V53h5M91 53h5v5M72 73v5h5M91 78h5v-5"
          stroke={palette.orange}
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        <QrMark x={76.3} y={57.8} scale={0.55} color={palette.white} opacity={0.88} />
        <Bar x={72} y={88} width={24} color={palette.white} opacity={0.22} />
      </G>
    </Art>
  );
}

/** "Take payments as a team": a sale paid on the employee's phone, its sats to the business. */
export function TeamSellsArt({ size }: { size: number }) {
  return (
    <Art size={size}>
      <Ground cx={60} cy={106} rx={44} />
      <PhoneFront x={12} y={26} width={42} height={78} />
      <CheckBadge cx={33} cy={58} r={11} />
      <Bar x={23} y={76} width={20} height={5} />
      <FaintBar x={26} y={85} width={14} height={3.5} />
      <Route d="M48 40C60 20 82 22 88 48" />
      <Coin cx={70} cy={26} r={9.5} mark="bitcoin" />
      <Storefront x={66} y={56} width={40} />
    </Art>
  );
}
