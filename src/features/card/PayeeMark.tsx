import { useTranslation } from "react-i18next";
import { StyleSheet, View } from "react-native";

import { Icon, type IconName } from "@/components/ui/Icon";
import { useTheme } from "@/theme";

import { payeeKindText, type PayeeKind } from "./payee-label";

/*
 * How a merchant is identified, beside its name wherever a card's payments show it: "@" for one its
 * Lightning address names (the point of sale's proof,
 * payee-proof.ts), a bolt for one the node its invoice pays names, which others may share.
 * Discreet, a mark and never a chip: the status says the rest.
 */

const MARKS: Record<PayeeKind, IconName> = { address: "at", node: "bolt" };

/** The mark, its words read by screen readers. */
export function PayeeMark({ kind, size = 11 }: { kind: PayeeKind; size?: number }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={payeeKindText(kind, t)}
      style={styles.mark}
      testID={`payee-mark-${kind}`}
    >
      <Icon name={MARKS[kind]} size={size} color={colors.text.secondary} />
    </View>
  );
}

const styles = StyleSheet.create({ mark: { justifyContent: "center" } });
