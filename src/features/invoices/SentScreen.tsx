import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { DocumentLanguageChip, type DocumentKind } from "@/components/DocumentLanguage";
import { useIsDesktop } from "@/components/layout/useIsDesktop";
import { Button } from "@/components/ui/Button";
import { Icon, type IconName } from "@/components/ui/Icon";
import { IconButton } from "@/components/ui/IconButton";
import { useHover } from "@/components/ui/useHover";
import { formatInvoiceNumber, type Invoice } from "@/lib/invoice/record";
import { getDeviceLocale } from "@/lib/locale/device";
import { canShareUrl } from "@/lib/payment-link/device";
import {
  control,
  gutter,
  makeStyles,
  proseLineHeight,
  radius,
  sans,
  space,
  stroke,
  TITLE_EM,
  tracked,
  tracking,
  type,
  useTheme
} from "@/theme";

import { useInvoiceActions } from "./actions";
import { dueDateLabel } from "./format";

/**
 * The invoice created: the green check stands for the sentence, nothing repeats it. Then the four
 * ways of passing it on, the same on mobile and desktop:
 * send it by mail (the device's mail client, the mail written, its PDF attached in the apps: the
 * app sends no mail itself), copy its payment link, share it, download its PDF; beside the mail and
 * the PDF, their language (DocumentLanguageChip), one for both. "Share" only where a share sheet
 * opens: a browser without one would only copy the link, as "Copy the link" does. At the bottom,
 * "New invoice" and "View the invoice" (full width, one above the other).
 */
export function SentScreen({
  invoice,
  businessName,
  onClose,
  onNew,
  onView
}: {
  invoice: Invoice;
  businessName: string;
  onClose: () => void;
  onNew: () => void;
  onView: () => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const desktop = useIsDesktop();
  const insets = useSafeAreaInsets();
  const [languageTag] = useState(() => getDeviceLocale().languageTag);
  const actions = useInvoiceActions(invoice, businessName);
  const number = formatInvoiceNumber(invoice.number);
  const date = invoice.dueDate ? dueDateLabel(invoice.dueDate, languageTag, "dayMonth") : "";
  const url = invoice.sent?.link.url;
  const shareable = url !== undefined && canShareUrl(url);
  // The mail and the PDF: their language beside them.
  const items: {
    icon: IconName;
    label: string;
    onPress: () => void;
    testID: string;
    document?: DocumentKind;
  }[] = [
    {
      icon: "envelope",
      label: t("invoices.sent.mail"),
      onPress: actions.mail,
      testID: "invoice-sent-mail",
      document: "mail"
    },
    {
      icon: "copy",
      label: t("invoices.sent.copy"),
      onPress: () => void actions.copy(),
      testID: "invoice-sent-copy"
    },
    ...(shareable
      ? [
          {
            icon: "share-nodes" as const,
            label: t("invoices.sent.share"),
            onPress: actions.share,
            testID: "invoice-sent-share"
          }
        ]
      : []),
    {
      icon: desktop ? "file-pdf" : "download",
      label: t("invoices.sent.pdf"),
      onPress: actions.pdf,
      testID: "invoice-sent-pdf",
      document: "pdf"
    }
  ];
  const chip = (testID: string, height: number, document: DocumentKind) => (
    <DocumentLanguageChip
      value={actions.language}
      onChange={actions.setLanguage}
      document={document}
      height={height}
      testID={`${testID}-language`}
    />
  );
  const close = (
    <IconButton
      icon="xmark"
      label={t("invoices.sent.close")}
      overhang={desktop ? undefined : "right"}
      onPress={onClose}
      testID="invoice-sent-close"
    />
  );
  const footer = (
    <View style={styles.footer}>
      <Button variant="text" size="md" icon="plus" onPress={onNew} testID="invoice-sent-new">
        {t("invoices.sent.newInvoice")}
      </Button>
      <Button onPress={onView} testID="invoice-sent-view">
        {t("invoices.sent.view")}
      </Button>
    </View>
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]} testID="invoice-sent">
      <View style={desktop ? styles.desktopHeader : styles.mobileHeader}>{close}</View>
      <View style={desktop ? styles.desktopBody : styles.mobileBody}>
        <View style={desktop ? styles.desktopColumn : styles.mobileColumn}>
          <View style={[styles.check, desktop && styles.checkDesktop]}>
            <Icon name="check" size={desktop ? 32 : 26} color={colors.state.settled.fg} />
          </View>
          <Text accessibilityRole="header" style={[styles.title, desktop && styles.titleDesktop]}>
            {t("invoices.sent.title", { number })}
          </Text>
          <Text style={[styles.lead, desktop && styles.leadDesktop]}>
            {t("invoices.sent.lead", { date })}
          </Text>
          {desktop ? (
            <View style={styles.tiles}>
              {items.map(({ document, ...item }) => (
                <View key={item.testID} style={styles.tileCell}>
                  <Tile {...item} />
                  {document ? (
                    <View style={styles.tileChip}>{chip(item.testID, 28, document)}</View>
                  ) : null}
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.list}>
              {items.map((item, index) => (
                <View key={item.testID}>
                  {index > 0 ? <View style={styles.divider} /> : null}
                  <View style={styles.listLine}>
                    <Pressable
                      accessibilityRole="button"
                      onPress={item.onPress}
                      style={({ pressed }) => [styles.listRow, pressed && styles.pressed]}
                      testID={item.testID}
                    >
                      <Icon
                        name={item.icon}
                        size={15}
                        color={colors.text.secondary}
                        style={styles.listIcon}
                      />
                      <Text style={styles.listLabel}>{item.label}</Text>
                    </Pressable>
                    {item.document ? chip(item.testID, control.min, item.document) : null}
                  </View>
                </View>
              ))}
            </View>
          )}
          <View style={styles.push} />
          {footer}
        </View>
      </View>
    </View>
  );
}

function Tile({
  icon,
  label,
  onPress,
  testID
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  testID: string;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { hovered, hoverProps } = useHover();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      testID={testID}
      {...hoverProps}
      style={[styles.tile, hovered && styles.tileHovered]}
    >
      <Icon name={icon} size={17} color={colors.text.secondary} />
      <Text style={styles.tileLabel}>{label}</Text>
    </Pressable>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  screen: { flex: 1, backgroundColor: colors.background.app },
  mobileHeader: {
    height: 64,
    paddingHorizontal: gutter,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end"
  },
  desktopHeader: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingVertical: 26,
    paddingHorizontal: 38,
    borderBottomWidth: stroke.hairline,
    borderBottomColor: colors.border.subtle
  },
  // The bottom safe area is the shell's, below the screen once the dock left (ShellMain): the
  // actions keep only their margin above it.
  mobileBody: { flex: 1, paddingHorizontal: gutter, paddingBottom: space[5] },
  mobileColumn: { flex: 1 },
  desktopBody: { flex: 1, alignItems: "center", paddingVertical: 74, paddingHorizontal: 38 },
  desktopColumn: { flex: 1, width: 620, maxWidth: "100%", alignItems: "center" },
  check: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    backgroundColor: colors.state.settled.bg,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginTop: 16
  },
  checkDesktop: { width: 76, height: 76, marginTop: 0 },
  title: {
    ...sans(700),
    fontSize: 24,
    letterSpacing: tracking(TITLE_EM, 24),
    lineHeight: 24 * 1.15,
    color: colors.text.primary,
    marginTop: 20
  },
  titleDesktop: {
    fontSize: 30,
    letterSpacing: tracking(TITLE_EM, 30),
    lineHeight: 33,
    marginTop: 24,
    textAlign: "center"
  },
  lead: {
    ...sans(500),
    fontSize: type.prose,
    lineHeight: proseLineHeight,
    color: colors.text.secondary,
    marginTop: 10
  },
  leadDesktop: {
    fontSize: type.body,
    lineHeight: type.body * 1.5,
    textAlign: "center",
    maxWidth: 460,
    marginTop: 12
  },
  list: {
    marginTop: 22,
    backgroundColor: colors.background.surface,
    borderWidth: stroke.hairline,
    borderColor: colors.border.subtle,
    borderRadius: radius.lg,
    paddingVertical: 8,
    paddingHorizontal: 10,
    overflow: "hidden"
  },
  // A row and, for a document, its language beside it (not in it: two buttons, never nested).
  listLine: { flexDirection: "row", alignItems: "center", gap: space[3] },
  listRow: {
    flex: 1,
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 12,
    borderRadius: radius.md
  },
  pressed: { backgroundColor: colors.hoverOverlay },
  listIcon: { width: 20 },
  listLabel: {
    ...sans(600),
    fontSize: type.body,
    color: colors.text.primary
  },
  divider: { height: 1, backgroundColor: colors.border.subtle, marginHorizontal: 12 },
  tiles: { marginTop: 30, width: "100%", flexDirection: "row", gap: 12 },
  tileCell: { flex: 1 },
  // A document's language in its tile's corner, over it (its own button, beside the tile's).
  tileChip: { position: "absolute", top: 6, right: 6 },
  tile: {
    flex: 1,
    alignItems: "center",
    gap: 10,
    paddingVertical: 20,
    paddingHorizontal: 12,
    borderRadius: radius.lg,
    backgroundColor: colors.background.surface,
    borderWidth: stroke.hairline,
    borderColor: colors.border.subtle
  },
  tileHovered: { backgroundColor: colors.hoverOverlay },
  tileLabel: {
    ...sans(600),
    fontSize: type.label,
    letterSpacing: tracked.label,
    color: colors.text.primary,
    textAlign: "center"
  },
  push: { flexGrow: 1, minHeight: 30 },
  footer: { width: "100%", gap: 10, paddingTop: 12 }
}));
