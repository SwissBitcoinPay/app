import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Platform, Pressable, Text, View } from "react-native";

import { useIsDesktop } from "@/components/layout/useIsDesktop";
import { Icon } from "@/components/ui/Icon";
import { useHover } from "@/components/ui/useHover";
import type { Language } from "@/i18n/languages";
import type { InvoiceLine } from "@/lib/invoice/amounts";
import type { InvoiceRecipient } from "@/lib/invoice/record";
import { getCountryName } from "@/lib/countries";
import { makeStyles, radius, sans, stroke, tracked, type, useTheme } from "@/theme";

import { dueDateLabel } from "./format";
import { LinesCard } from "./LinesCard";
import { StepTitle } from "./WizardFrame";

/**
 * Step 5, "Check the invoice": one card per step before it, in their order ("Client", "Items", "Due
 * date", "Administrative notes"), each pressed as a whole to go back to its step. No number: the
 * invoice gets it when it is created.
 */
export function ReviewStep({
  recipient,
  lines,
  currency,
  dueDate,
  terms,
  legal,
  redirectUrl,
  languageTag,
  onEdit
}: {
  recipient: InvoiceRecipient;
  lines: InvoiceLine[];
  currency: { code: string; digits: number };
  dueDate: string;
  terms: string;
  legal: string;
  redirectUrl: string | null;
  languageTag: string;
  /** Back to step `step` (0: the recipient, 1: the lines, 2: the due date, 3: the notices). */
  onEdit: (step: number) => void;
}) {
  const styles = useStyles();
  const { t, i18n } = useTranslation();
  const desktop = useIsDesktop();
  const address = [
    recipient.street,
    [recipient.postalCode, recipient.city].filter(Boolean).join(" "),
    getCountryName(recipient.country, i18n.language as Language)
  ]
    .filter(Boolean)
    .join(" · ");
  const notices = [
    { label: t("invoices.terms.conditions"), value: terms.trim() },
    { label: t("invoices.terms.legal"), value: legal.trim() },
    { label: t("invoices.terms.redirect"), value: redirectUrl?.trim() ?? "" }
  ].filter((notice) => notice.value !== "");

  return (
    <View>
      <StepTitle>{t("invoices.review.title")}</StepTitle>
      <View style={[styles.cards, desktop && styles.cardsDesktop]}>
        <StepCard
          title={t("invoices.review.client")}
          editLabel={t("invoices.review.editRecipient")}
          onPress={() => onEdit(0)}
          testID="invoice-review-recipient"
        >
          <Text style={styles.value}>{recipient.name}</Text>
          <Text style={styles.secondary}>{address}</Text>
          {recipient.reference ? <Text style={styles.secondary}>{recipient.reference}</Text> : null}
        </StepCard>
        <StepCard
          title={t("invoices.review.articles")}
          editLabel={t("invoices.review.editLines")}
          onPress={() => onEdit(1)}
          testID="invoice-review-lines"
        >
          <LinesCard
            lines={lines}
            currency={currency}
            languageTag={languageTag}
            desktop={desktop}
            bare
          />
        </StepCard>
        <StepCard
          title={t("invoices.review.due")}
          editLabel={t("invoices.review.editDue")}
          onPress={() => onEdit(2)}
          testID="invoice-review-due"
        >
          <Text style={styles.value}>{dueDateLabel(dueDate, languageTag, "long")}</Text>
        </StepCard>
        <StepCard
          title={t("invoices.review.notices")}
          editLabel={t("invoices.review.editNotices")}
          onPress={() => onEdit(3)}
          testID="invoice-review-notices"
        >
          {notices.length === 0 ? (
            <Text style={styles.secondary}>{t("invoices.review.noNotices")}</Text>
          ) : (
            notices.map((notice) => (
              <View key={notice.label} style={styles.notice}>
                <Text style={styles.noticeLabel}>{notice.label}</Text>
                <Text style={styles.noticeValue} numberOfLines={4}>
                  {notice.value}
                </Text>
              </View>
            ))
          )}
        </StepCard>
      </View>
    </View>
  );
}

/** A step's card: its name and a pen, then what it holds; pressed, back to the step. */
function StepCard({
  title,
  editLabel,
  onPress,
  children,
  testID
}: {
  title: string;
  editLabel: string;
  onPress: () => void;
  children: ReactNode;
  testID: string;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const desktop = useIsDesktop();
  const { hovered, hoverProps } = useHover();
  // The white card holds the press: the tint (translucent) goes over its white, never in its place.
  // The pen's action is the hint: the card's texts stay what a screen reader reads.
  return (
    <View style={styles.card}>
      <Pressable
        accessibilityRole="button"
        accessibilityHint={editLabel}
        onPress={onPress}
        testID={testID}
        {...hoverProps}
        style={({ pressed }) => [
          styles.cardInside,
          desktop && styles.cardInsideDesktop,
          // The card clips: the browser's focus ring is drawn inside it (as ListRow's).
          Platform.OS === "web" && styles.focusRingInside,
          (hovered || pressed) && styles.cardActive
        ]}
      >
        <View style={styles.head}>
          <Text style={styles.label}>{title}</Text>
          <Icon name="pen" size={12} color={colors.text.secondary} />
        </View>
        <View style={styles.body}>{children}</View>
      </Pressable>
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  cards: { marginTop: 16, gap: 10 },
  cardsDesktop: { marginTop: 24, gap: 14 },
  card: {
    backgroundColor: colors.background.surface,
    borderWidth: stroke.hairline,
    borderColor: colors.border.subtle,
    borderRadius: radius.lg,
    overflow: "hidden"
  },
  cardInside: { paddingTop: 14, paddingHorizontal: 18, paddingBottom: 16, gap: 8 },
  cardInsideDesktop: { paddingTop: 18, paddingHorizontal: 26, paddingBottom: 22, gap: 10 },
  cardActive: { backgroundColor: colors.hoverOverlay },
  focusRingInside: { outlineOffset: -2 },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12
  },
  label: {
    ...sans(600),
    fontSize: type.fieldLabel,
    color: colors.text.secondary
  },
  body: { gap: 4 },
  value: {
    ...sans(700),
    fontSize: type.body,
    color: colors.text.primary
  },
  secondary: {
    ...sans(500),
    fontSize: type.label,
    letterSpacing: tracked.label,
    color: colors.text.secondary
  },
  notice: { gap: 2, paddingVertical: 2 },
  noticeLabel: { ...sans(600), fontSize: type.caption, color: colors.text.secondary },
  noticeValue: {
    ...sans(500),
    fontSize: type.label,
    letterSpacing: tracked.label,
    color: colors.text.primary
  }
}));
