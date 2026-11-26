import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { type PaymentState, radius, sans, space, tracked, type, useTheme } from "@/theme";

import { ChainLoader } from "./ChainLoader";
import { Icon } from "./Icon";
import { Spinner } from "./Spinner";
import { StateDot } from "./StateDot";

/**
 * A sign before the label, where a screen asks for it ("Wallet"):
 * `pulse` the state's dot, pulsing while it waits on someone else (StateDot: the open state's),
 * `warning` the triangle of the warning notifications, in the state's colour, `check` a tick in
 * the state's text colour (a transaction confirmed, on the payer's page),
 * `spinner` the turning arc (Spinner) in the state's colour (a transaction being confirmed, on the
 * payer's page), `ban` a barred circle in the state's text colour (a card
 * payment refused, "History" of a card).
 */
export type PillSign = "pulse" | "warning" | "check" | "spinner" | "ban";

const GLYPHS = { warning: "triangle-exclamation", check: "check", ban: "ban" } as const;

type StatusPillProps = {
  state: PaymentState;
  label: string;
  sign?: PillSign;
  /**
   * The point of sale's pill by default. Inside a row ("Wallet"): `sm` 24 px high
   * (a detail's header), `xs` 20 px (a list row's second line).
   */
  size?: "md" | "sm" | "xs";
};

/**
 * The state of a payment as a tinted pill. "Confirming" carries a mined chain
 * (ChainLoader), the size of the other signs; the other states the point of sale shows (settled,
 * expired) carry no sign in the design system either. `sign` adds one where a screen asks for
 * it, in place of the chain: one sign at most.
 */
export function StatusPill({ state, label, sign, size = "md" }: StatusPillProps) {
  const { colors } = useTheme();
  return (
    <View style={[styles.pill, SIZES[size].pill, { backgroundColor: colors.state[state].bg }]}>
      {state === "unconfirmed" && sign === undefined ? (
        <ChainLoader color={colors.state.unconfirmed.dot} size={SIGN_SIZES[size]} />
      ) : null}
      {sign === "pulse" ? <StateDot state={state} testID="status-pill-pulse" /> : null}
      {sign === "spinner" ? (
        // Decorative (Spinner is hidden from screen readers): the label says what it means.
        <Spinner
          size={SIGN_SIZES[size]}
          color={colors.state[state].dot}
          testID="status-pill-spinner"
        />
      ) : null}
      {sign === "warning" || sign === "check" || sign === "ban" ? (
        // Decorative, as StateDot (aria-hidden for the web): the label says what it means.
        <View
          aria-hidden
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          testID={`status-pill-${sign}`}
        >
          <Icon
            name={GLYPHS[sign]}
            size={SIGN_SIZES[size]}
            color={sign === "warning" ? colors.state[state].dot : colors.state[state].fg}
          />
        </View>
      ) : null}
      <Text
        numberOfLines={size === "md" ? undefined : 1}
        style={[styles.label, SIZES[size].label, { color: colors.state[state].fg }]}
      >
        {label}
      </Text>
    </View>
  );
}

/**
 * A pill's own box in a row (the pill's `alignSelf: "flex-start"` would set it at the row's top),
 * never wider than the row: as narrow as the row needs, the pill's label then ends in "…".
 * `whole`: what shares the row gives way first (a time, a title), the pill only when it alone is
 * wider than the row.
 */
export function StatusPillBox({
  whole = false,
  children
}: {
  whole?: boolean;
  children: ReactNode;
}) {
  return <View style={whole ? styles.wholeBox : styles.box}>{children}</View>;
}

const styles = StyleSheet.create({
  box: { flexShrink: 1, minWidth: 0 },
  wholeBox: { flexShrink: 0, maxWidth: "100%" },
  // Never wider than its parent: a label too long for it ends in "…" (`sm`, `xs`) or wraps (`md`)
  // instead of running out of it ("Pagadas de menos" in a desktop tile of 1024 px).
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[4],
    borderRadius: radius.pill,
    flexShrink: 1,
    maxWidth: "100%"
  },
  label: { ...sans(600), fontSize: type.label, letterSpacing: tracked.label, flexShrink: 1 }
});

const SIZES = {
  md: StyleSheet.create({
    pill: { paddingVertical: 9, paddingHorizontal: space[6], alignSelf: "center" },
    label: {}
  }),
  sm: StyleSheet.create({
    pill: { height: 24, paddingHorizontal: 10, alignSelf: "flex-start" },
    label: {}
  }),
  xs: StyleSheet.create({
    pill: { height: 20, paddingHorizontal: 8, alignSelf: "flex-start" },
    // The tab bar's size, which the design system does not tighten.
    label: { fontSize: type.tabLabel, letterSpacing: 0 }
  })
};

/** The size of each size's sign: warning, check, spinner, chain (about its label's cap height). */
const SIGN_SIZES = { md: 12, sm: 12, xs: 10 } as const;
