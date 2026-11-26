import { Circle, Path, Rect } from "react-native-svg";

import { palette, useTheme, type PaymentState } from "@/theme";

import { Art, Bar, Coin, FaintBar, Ground, Panel, PhoneFront, QrMark, Route } from "./parts";

/** "Take a payment": the point of sale's amount and code, a payment on its way to it. */
export function WalletTakeArt({ size }: { size: number }) {
  return (
    <Art size={size}>
      <Ground cx={56} cy={108} rx={34} />
      <PhoneFront x={30} y={14} width={48} height={92} />
      <Bar x={40} y={31} width={28} height={6} />
      <FaintBar x={45} y={40.5} width={18} height={3.5} />
      <QrMark x={40} y={52} />
      <Route d="M90 50C88 62 82 68 72 70" />
      <Coin cx={92} cy={36} r={12.5} mark="bitcoin" />
    </Art>
  );
}

/** "Receive": the balance, and the payment arrived in the list under it, in green. */
export function WalletReceiveArt({ size }: { size: number }) {
  const { colors } = useTheme();
  return (
    <Art size={size}>
      <Panel x={14} y={30} width={86} height={70} />
      <Bar x={24} y={40} width={38} height={8} />
      <FaintBar x={24} y={52} width={24} />
      <Rect x={20} y={62} width={74} height={16} rx={8} fill={colors.state.settled.bg} />
      <Circle cx={29} cy={70} r={5} fill={colors.success.solid} />
      <Path
        d="M29 67.4v5.2M26.4 70h5.2"
        stroke={palette.white}
        strokeWidth={1.6}
        strokeLinecap="round"
      />
      <Bar x={38} y={68} width={24} />
      <Bar x={72} y={68} width={16} color={colors.state.settled.fg} />
      <Circle cx={29} cy={88} r={5} fill={colors.background.subtle} />
      <FaintBar x={38} y={86} width={20} />
      <FaintBar x={74} y={86} width={14} />
      <Route d="M95 40C96 50 94 56 90 60" />
      <Coin cx={94} cy={24} r={11.5} mark="bitcoin" />
    </Art>
  );
}

/** The rows of "Follow and send", each in its state's colours. */
const FOLLOWED: readonly { cy: number; state: PaymentState; width: number }[] = [
  { cy: 36, state: "settled", width: 22 },
  { cy: 60, state: "open", width: 18 },
  { cy: 84, state: "unconfirmed", width: 20 }
];

/** "Follow and send": movements in their states, and "Send"'s paper plane. */
export function WalletFollowArt({ size }: { size: number }) {
  const { colors } = useTheme();
  return (
    <Art size={size}>
      <Panel x={12} y={20} width={82} height={80} />
      <Path
        d="M20 48h68M20 72h68"
        stroke={colors.illustration.ink}
        strokeOpacity={0.08}
        strokeWidth={1.2}
      />
      {FOLLOWED.map(({ cy, state, width }) => (
        <Row key={state} cy={cy} state={state} width={width} />
      ))}
      <Circle cx={97} cy={92} r={15} fill={colors.illustration.ink} />
      <Path d="M89 92.5L105 85L99.5 101L96.5 94.5Z" fill={colors.illustration.paper} />
      <Path d="M96.5 94.5L105 85" stroke={colors.illustration.ink} strokeWidth={1.3} />
    </Art>
  );
}

function Row({ cy, state, width }: { cy: number; state: PaymentState; width: number }) {
  const { colors } = useTheme();
  const tones = colors.state[state];
  return (
    <>
      <Circle cx={25} cy={cy} r={5.5} fill={colors.background.app} />
      <Bar x={35} y={cy - 2} width={width} />
      <Rect x={62} y={cy - 5} width={24} height={10} rx={5} fill={tones.bg} />
      <Circle cx={68} cy={cy} r={2} fill={tones.dot} />
      <Rect x={72} y={cy - 1} width={10} height={2} rx={1} fill={tones.fg} fillOpacity={0.6} />
    </>
  );
}
