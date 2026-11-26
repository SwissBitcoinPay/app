import { useTranslation } from "react-i18next";
import { Pressable, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { Icon } from "@/components/ui/Icon";
import { externalLinkProps } from "@/components/ui/external-link";
import { useHover } from "@/components/ui/useHover";
import type { PayerNode } from "@/lib/onchain/node";
import { normalTxid, explorerName, txPageUrl } from "@/lib/onchain/tx-page";
import { makeStyles, mono, sans, useTheme } from "@/theme";

/**
 * Up to the 44 px touch floor without moving anything: a transaction's line is 15 to 19.5 px high.
 * Above and below it, lines of its card that take no touch.
 */
const HIT_SLOP = { top: 14, bottom: 10, left: 8, right: 8 };

/**
 * A transaction, its id cut short (its first `cut` and last `tail` characters, in lower case),
 * linked to its page (external-link.ts, the browser in the apps, a new tab
 * on the web) on the explorer its screen reads the chain on: the merchant's node (`node`), else
 * mempool.space (txPageUrl); as plain text when `txid` is not a transaction id. `fontSize`: its
 * card's; `face`: mono (a received transaction's line), or the sans of a row of details, its plain
 * text in the primary ink; `style` places it.
 */
export function TxLink({
  txid,
  node,
  cut,
  tail = cut,
  fontSize,
  face = "mono",
  style
}: {
  txid: string;
  /** The merchant's node its screen reads the chain on; null for mempool.space. */
  node: PayerNode | null;
  cut: number;
  /** The last characters kept: `cut` unless given. */
  tail?: number;
  fontSize: number;
  face?: "mono" | "sans";
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const { hovered, hoverProps } = useHover();
  const id = normalTxid(txid) ?? txid.toLowerCase();
  const label = `${id.slice(0, cut)}…${id.slice(-tail)}`;
  const faceStyle = face === "sans" ? styles.sans : null;
  const url = txPageUrl(txid, node);
  if (url === null) {
    return (
      <View style={[styles.pressable, style]}>
        <Text
          style={[styles.txid, faceStyle, face === "sans" && styles.sansPlain, { fontSize }]}
          numberOfLines={1}
        >
          {label}
        </Text>
      </View>
    );
  }
  return (
    <Pressable
      {...externalLinkProps(url)}
      {...hoverProps}
      accessibilityRole="link"
      accessibilityLabel={t("pos.underpaid.txLink", {
        txid: label,
        explorer: explorerName(node)
      })}
      hitSlop={HIT_SLOP}
      style={[styles.pressable, style]}
      testID="tx-link"
    >
      {({ pressed }) => (
        <View style={styles.link}>
          <Text
            style={[
              styles.txid,
              faceStyle,
              styles.txidLink,
              { fontSize },
              (hovered || pressed) && styles.active
            ]}
            numberOfLines={1}
          >
            {label}
          </Text>
          <Icon
            name="arrow-up-right-from-square"
            size={fontSize - 3}
            color={hovered || pressed ? colors.button.text.labelHover : colors.text.accent}
          />
        </View>
      )}
    </Pressable>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  pressable: { flexShrink: 1, minWidth: 0 },
  link: { flexDirection: "row", alignItems: "center", gap: 5 },
  txid: { ...mono(500), flexShrink: 1, color: colors.text.secondary },
  sans: { ...sans(600) },
  sansPlain: { color: colors.text.primary },
  // A link reads in the readable accent, umber (orange is never text).
  txidLink: { color: colors.text.accent },
  active: { color: colors.button.text.labelHover }
}));
