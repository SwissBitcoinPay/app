import { useTranslation } from "react-i18next";
import { Image, Text, View, type ImageSourcePropType } from "react-native";

import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Icon } from "@/components/ui/Icon";
import { Sheet } from "@/components/ui/Sheet";
import { makeStyles, mono, palette, radius, sans, space, type } from "@/theme";

/** The Swiss Bitcoin Pay logo, square. */
const SBP_LOGO: ImageSourcePropType = require("../../../assets/images/swiss-bitcoin-pay-logo-square.png");
/** sattle.me's own mark: the app's icon ("s."). */
const SATTLE_ME_LOGO: ImageSourcePropType = require("../../../assets/images/icon.png");

/** Where the panel is: its offer, or the confirmation of "Don't move" over it. */
export type LegacyTransferChoice = "offer" | "confirmSkip";

/**
 * At the end of the migration ("Your account is up to date", done.tsx), on a device the v2 app left
 * its wallet's words on: the offer to transfer that wallet to the new account (a bottom panel),
 * from Swiss Bitcoin Pay to sattle.me, what it holds (`amount`: the v2 server's index,
 * listedWalletBalance; none when not proven), and that its words are erased from the phone
 * afterwards in any case. "Move" asks the device's biometrics (the v2 app put them on its words).
 * "Don't move", or closing the panel, asks once more (`confirmSkip`): the words are erased then,
 * and only the words written down move the money.
 *
 * The confirmation keeps ConfirmDialog's "Back" (to the offer, where "Move" is) beside the erasure,
 * rather than a second "Move": its scrim and the system's back cancel, which must never start a
 * transfer. The biometrics are named on no button: Face ID, Touch ID or a fingerprint, as the phone
 * has them.
 */
export function LegacyTransferSheet({
  choice,
  amount,
  erasing,
  onTransfer,
  onSkip,
  onBack,
  onErase
}: {
  /** Null: the panel hidden. */
  choice: LegacyTransferChoice | null;
  amount: { sats: string; fiat: string | null } | null;
  /** The words being erased ("I have the 12 words, erase without moving"). */
  erasing: boolean;
  onTransfer: () => void;
  onSkip: () => void;
  onBack: () => void;
  onErase: () => void;
}) {
  const { t } = useTranslation();
  const styles = useStyles();
  return (
    <Sheet
      title={t("migration.transfer.sheetTitle")}
      closeLabel={t("migration.transfer.skip")}
      visible={choice !== null}
      onClose={onSkip}
      // Only while it shows: an `over` puts the panel under it out of reach (as "Bitcoin node"'s).
      over={
        choice === "confirmSkip" ? (
          <ConfirmDialog
            visible
            title={t("migration.transfer.skipTitle")}
            body={
              amount
                ? t("migration.transfer.skipBody", {
                    amount: amount.fiat ? `${amount.sats} (${amount.fiat})` : amount.sats
                  })
                : t("migration.transfer.skipBodyUnknown")
            }
            confirmLabel={t("migration.transfer.skipConfirm")}
            confirmWrap
            cancelLabel={t("common.back")}
            working={erasing}
            onConfirm={onErase}
            onCancel={onBack}
            testID="migration-transfer-skip-dialog"
            confirmTestID="migration-transfer-erase"
          />
        ) : undefined
      }
      testID="migration-transfer-sheet"
    >
      <View>
        <Party
          logo={SBP_LOGO}
          label={t("migration.transfer.from")}
          name={t("migration.transfer.fromName")}
          caption={t("migration.transfer.fromCaption")}
          tone="from"
        />
        <View style={styles.arrow} aria-hidden>
          <Icon name="arrow-down" size={16} color={palette.white} />
        </View>
        <Party
          logo={SATTLE_ME_LOGO}
          label={t("migration.transfer.to")}
          name={t("migration.transfer.toName")}
          tone="to"
        />
      </View>
      <View style={styles.amountRow} testID="migration-transfer-amount">
        <Text style={styles.amountLabel}>{t("migration.transfer.amountLabel")}</Text>
        {amount ? (
          <View style={styles.amountValue}>
            <Text style={styles.sats}>{amount.sats}</Text>
            {amount.fiat ? <Text style={styles.fiat}>{amount.fiat}</Text> : null}
          </View>
        ) : (
          <Text style={[styles.fiat, styles.unknown]}>{t("migration.transfer.amountUnknown")}</Text>
        )}
      </View>
      <Callout tone="warning" testID="migration-transfer-erase-note">
        {t("migration.transfer.eraseNote")}
      </Callout>
      <View style={styles.actions}>
        <Button icon="fingerprint" onPress={onTransfer} testID="migration-transfer-start">
          {t("migration.transfer.start")}
        </Button>
        <Button variant="text" size="md" onPress={onSkip} testID="migration-transfer-skip">
          {t("migration.transfer.skip")}
        </Button>
      </View>
    </Sheet>
  );
}

/** One end of the transfer: its logo, "From" or "To", the wallet's name. */
function Party({
  logo,
  label,
  name,
  caption,
  tone
}: {
  logo: ImageSourcePropType;
  label: string;
  name: string;
  caption?: string;
  tone: "from" | "to";
}) {
  const styles = useStyles();
  return (
    <View style={[styles.party, tone === "from" ? styles.from : styles.to]}>
      {/* The name beside it says the same: hidden from screen readers. */}
      <Image
        source={logo}
        accessibilityIgnoresInvertColors
        aria-hidden
        style={styles.logo}
        resizeMode="contain"
      />
      <View style={styles.partyTexts}>
        <Text style={[styles.partyLabel, tone === "to" && styles.toLabel]}>{label}</Text>
        <Text style={styles.partyName}>{name}</Text>
        {caption ? <Text style={styles.partyCaption}>{caption}</Text> : null}
      </View>
    </View>
  );
}

const LOGO = 52;
const ARROW = 36;

const useStyles = makeStyles(({ colors }) => ({
  party: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[5],
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: radius.md
  },
  from: { backgroundColor: colors.background.subtle },
  to: { backgroundColor: colors.background.accentSubtle },
  // Logos look the same in both themes: on their own white tile.
  logo: {
    width: LOGO,
    height: LOGO,
    borderRadius: radius.sm,
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: colors.border.faint
  },
  partyTexts: { flex: 1, gap: 2 },
  partyLabel: { ...sans(600), fontSize: type.label, color: colors.text.secondary },
  toLabel: { color: colors.text.accent },
  partyName: { ...sans(700), fontSize: type.body, color: colors.text.primary },
  partyCaption: { ...sans(500), fontSize: type.label, color: colors.text.secondary },
  // Over the two rows' meeting edge, in a ring of the panel's surface.
  arrow: {
    alignSelf: "center",
    width: ARROW,
    height: ARROW,
    marginVertical: -space[4],
    zIndex: 1,
    borderRadius: radius.pill,
    backgroundColor: colors.background.accent,
    borderWidth: 4,
    borderColor: colors.background.surface,
    alignItems: "center",
    justifyContent: "center"
  },
  amountRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: space[5]
  },
  amountLabel: { ...sans(600), fontSize: type.body, color: colors.text.secondary },
  amountValue: { alignItems: "flex-end", gap: 2, flexShrink: 1 },
  sats: { ...mono(700), fontSize: type.title, color: colors.text.primary },
  fiat: { ...sans(600), fontSize: type.prose, color: colors.text.secondary },
  unknown: { flexShrink: 1, textAlign: "right" },
  actions: { gap: space[2] }
}));
