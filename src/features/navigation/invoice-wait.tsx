import type { TFunction } from "i18next";
import type { StyleProp, ViewStyle } from "react-native";

import type { IconName } from "@/components/ui/Icon";
import { StateDot } from "@/components/ui/StateDot";
import type { InvoiceWait } from "@/features/terminal/pos";

import { DESTINATION_ICONS, type Destination } from "./destinations";

type T = TFunction;

/**
 * The dot of an invoice still waiting in "Charge", pulsing: the open
 * state's orange while it waits for its payment, the unconfirmed state's teal while its on-chain
 * payment waits for its confirmations.
 */
export function InvoiceWaitDot({
  wait,
  style,
  testID
}: {
  wait: Exclude<InvoiceWait, null>;
  style?: StyleProp<ViewStyle>;
  testID: string;
}) {
  return <StateDot state={wait} pulsing style={style} testID={testID} />;
}

/**
 * A destination's name: an employee's "Wallet" is "My activity", its own operations.
 */
export function destinationName(destination: Destination, t: T, member = false): string {
  return member && destination === "wallet"
    ? t("navigation.memberWallet")
    : t(`navigation.destinations.${destination}`);
}

/** A destination's icon: "My activity" has the history's. */
export function destinationIcon(destination: Destination, member = false): IconName {
  return member && destination === "wallet" ? "clock-rotate-left" : DESTINATION_ICONS[destination];
}

/** A destination's name for screen readers: the point of sale's says what its invoice waits for. */
export function destinationLabel(
  destination: Destination,
  wait: InvoiceWait,
  t: T,
  member = false
): string {
  const name = destinationName(destination, t, member);
  if (destination !== "pos" || wait === null) return name;
  return wait === "open"
    ? t("navigation.pendingLabel", { name })
    : t("navigation.confirmingLabel", { name });
}
