import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";

import { CountryPicker } from "@/components/CountryPicker";
import { Button } from "@/components/ui/Button";
import { useIsDesktop } from "@/components/layout/useIsDesktop";
import { Select } from "@/components/ui/Select";
import { TextField } from "@/components/ui/TextField";
import { RECIPIENT_FIELD_MAX_LENGTH } from "@/config/invoices";
import type { Language } from "@/i18n/languages";
import { getCountryName } from "@/lib/countries";
import type { InvoiceRecipient } from "@/lib/invoice/record";
import { lightTheme, makeStyles, radius, sans, ThemeContext, type } from "@/theme";

import {
  businessAddressLines,
  businessNumbers,
  type BusinessDetails,
  type BusinessNumber
} from "./business-details";
import { StepTitle } from "./WizardFrame";

/** Which line of the recipient the merchant is typing: the desktop preview highlights it. */
export type RecipientField = Exclude<keyof InvoiceRecipient, "reference">;

type RecipientStepProps = {
  recipient: InvoiceRecipient;
  onChange: (patch: Partial<InvoiceRecipient>) => void;
  /** The country detected when the account was created: first in the picker. */
  suggestedCountry: string | null;
  businessName: string;
  /** Its address and numbers, under its name on the preview; null when not known. */
  business: BusinessDetails | null;
  /** Today, for the preview's date. */
  today: string;
  disabled: boolean;
  /**
   * "Make your invoices with an AI", under the fields: opens "AI assistant". Null: not offered (a
   * draft, a copy).
   */
  onAssistant: (() => void) | null;
};

/**
 * Step 1, "Who is the invoice for?". The name, then the postal address, in the order an envelope
 * reads them; no email asked here. Without group titles nor the client's reference; a draft that
 * has a reference keeps it. Desktop: the first page of the PDF is drawn on the right while the
 * merchant types, the line being typed highlighted.
 */
export function RecipientStep({
  recipient,
  onChange,
  suggestedCountry,
  businessName,
  business,
  today,
  disabled,
  onAssistant
}: RecipientStepProps) {
  const styles = useStyles();
  const { t, i18n } = useTranslation();
  const desktop = useIsDesktop();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [focused, setFocused] = useState<RecipientField | null>(null);
  const language = i18n.language as Language;
  const field = (name: RecipientField) => ({
    value: recipient[name],
    onChangeText: (value: string) =>
      onChange({ [name]: value.slice(0, RECIPIENT_FIELD_MAX_LENGTH) }),
    onFocus: () => setFocused(name),
    onBlur: () => setFocused((last) => (last === name ? null : last)),
    disabled,
    testID: `invoice-recipient-${name}`
  });

  const form = (
    <View style={desktop ? styles.formDesktop : undefined}>
      <StepTitle>{t("invoices.recipient.title")}</StepTitle>
      <View style={[styles.fields, desktop && styles.fieldsDesktop]}>
        <TextField
          label={t("invoices.recipient.name")}
          autoCapitalize="words"
          autoComplete="organization"
          {...field("name")}
        />
        <TextField
          label={t("invoices.recipient.street")}
          autoComplete="street-address"
          {...field("street")}
        />
        <View style={[styles.row, desktop && styles.rowDesktop]}>
          <TextField
            label={t("invoices.recipient.postalCode")}
            autoComplete="postal-code"
            style={desktop ? styles.postalDesktop : styles.postal}
            {...field("postalCode")}
          />
          <TextField label={t("invoices.recipient.city")} style={styles.city} {...field("city")} />
        </View>
        <Select
          label={t("invoices.recipient.country")}
          value={getCountryName(recipient.country, language)}
          onPress={() => setPickerOpen(true)}
          disabled={disabled}
          testID="invoice-recipient-country"
        />
      </View>
      {onAssistant ? (
        <View style={styles.assistant}>
          <Button
            variant="text"
            size="sm"
            icon="wand-magic-sparkles"
            fullWidth={false}
            onPress={onAssistant}
            disabled={disabled}
            testID="invoice-assistant"
          >
            {t("invoices.recipient.assistant")}
          </Button>
        </View>
      ) : null}
      <CountryPicker
        title={t("invoices.recipient.country")}
        visible={pickerOpen}
        value={recipient.country}
        suggested={suggestedCountry}
        onSelect={(country) => onChange({ country })}
        onClose={() => setPickerOpen(false)}
      />
    </View>
  );

  if (!desktop) return form;
  return (
    <View style={styles.desktop}>
      {form}
      <PdfPreview
        recipient={recipient}
        countryName={getCountryName(recipient.country, language)}
        focused={pickerOpen ? "country" : focused}
        businessName={businessName}
        business={business}
        today={today}
      />
    </View>
  );
}

/**
 * The first page of the PDF as the merchant types (desktop), laid out as the PDF is
 * (invoice-html.ts): the business's name, its address and numbers under it (business-details.ts);
 * on its right, "Billed to" and the recipient's lines; "Invoice" (no number: it is given when the
 * invoice is created), today's date; what the next steps fill (the due date, the lines, the totals,
 * the notices, the payment's box) as grey bars. Nothing moves while the merchant types: each line
 * of the address keeps its box, a grey bar while it is empty, the text in its place once typed; the
 * line being typed is highlighted in apricot, its bar or its text.
 */
function PdfPreview({
  recipient,
  countryName,
  focused,
  businessName,
  business,
  today
}: {
  recipient: InvoiceRecipient;
  countryName: string;
  focused: RecipientField | null;
  businessName: string;
  business: BusinessDetails | null;
  today: string;
}) {
  const styles = useStyles();
  const { t, i18n } = useTranslation();
  const cityLine = [recipient.postalCode, recipient.city].filter(Boolean).join(" ");
  const lines: { key: string; text: string; fields: RecipientField[]; bold?: boolean }[] = [
    { key: "name", text: recipient.name, fields: ["name"], bold: true },
    { key: "street", text: recipient.street, fields: ["street"] },
    { key: "city", text: cityLine, fields: ["postalCode", "city"] },
    { key: "country", text: countryName, fields: ["country"] }
  ];
  const from = businessAddressLines(business?.businessAddress ?? null, i18n.language as Language);
  const numbers = business ? businessNumbers(business, t) : [];
  return (
    <View style={styles.preview} aria-hidden testID="invoice-pdf-preview">
      <Text style={styles.previewLabel}>{t("invoices.preview.title")}</Text>
      {/* The page as it prints: paper in both themes, as the PDF (invoice-html.ts). */}
      <ThemeContext value={lightTheme}>
        <PdfPage
          lines={lines}
          from={from}
          numbers={numbers}
          focused={focused}
          businessName={businessName}
          today={today}
        />
      </ThemeContext>
    </View>
  );
}

/** PdfPreview's page, in the theme it is given (the light one). */
function PdfPage({
  lines,
  from,
  numbers,
  focused,
  businessName,
  today
}: {
  lines: { key: string; text: string; fields: RecipientField[]; bold?: boolean }[];
  from: string[];
  numbers: BusinessNumber[];
  focused: RecipientField | null;
  businessName: string;
  today: string;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  return (
    <View style={styles.page}>
      <View style={styles.pageTop}>
        <View style={styles.sender}>
          <Text style={styles.pageBusiness} numberOfLines={2}>
            {businessName}
          </Text>
          {from.map((line, index) => (
            <Text key={`from-${index}`} style={styles.senderLine} numberOfLines={1}>
              {line}
            </Text>
          ))}
          {numbers.length > 0 ? (
            <View style={styles.numbers}>
              {numbers.map(({ label, value }) => (
                <View key={label}>
                  <Text style={[styles.caps, styles.numberLabel]} numberOfLines={1}>
                    {label}
                  </Text>
                  <Text style={styles.senderLine} numberOfLines={1}>
                    {value}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
        <View style={styles.address}>
          <Text style={styles.caps}>{t("invoices.pdf.billedTo")}</Text>
          {lines.map((line) => {
            const highlighted = focused !== null && line.fields.includes(focused);
            return (
              <View key={line.key} style={styles.addressRow}>
                {line.text === "" ? (
                  <Bar width={line.key === "name" ? 130 : 96} highlighted={highlighted} />
                ) : (
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.addressLine,
                      line.bold && styles.addressName,
                      highlighted && styles.highlight
                    ]}
                  >
                    {line.text}
                  </Text>
                )}
              </View>
            );
          })}
        </View>
      </View>
      <View style={styles.titleRow}>
        <Text style={styles.pageInvoice}>{t("invoices.preview.invoice")}</Text>
        <Bar width={78} height={9} />
      </View>
      {/* The dates under their labels, without a rule, as on the PDF. */}
      <View style={styles.dates}>
        <View style={styles.dateCell}>
          <Text style={styles.caps}>{t("invoices.preview.date")}</Text>
          <Text style={styles.dateValue}>{today}</Text>
        </View>
        <View style={styles.dateCell}>
          <Text style={styles.caps}>{t("invoices.preview.due")}</Text>
          <Bar width={56} />
        </View>
      </View>
      <View style={styles.table}>
        <View style={styles.tableHead}>
          <Bar width={70} height={5} />
          <Bar width={36} height={5} />
        </View>
        {[180, 140, 160].map((width) => (
          <View key={width} style={styles.tableRow}>
            <Bar width={width} />
            <Bar width={44} />
          </View>
        ))}
        <View style={styles.totals}>
          <View style={styles.totalRow}>
            <Bar width={90} />
            <Bar width={40} />
          </View>
          <View style={[styles.totalRow, styles.grandTotal]}>
            <Bar width={60} height={8} />
            <Bar width={70} height={8} />
          </View>
        </View>
      </View>
      <View style={styles.notices}>
        <Bar width={140} height={5} />
        <Bar width={140} height={5} />
      </View>
      <View style={styles.pay}>
        <View style={styles.payCode} />
        <View style={styles.payText}>
          <Bar width={110} height={8} />
          <Bar width={150} height={5} />
        </View>
      </View>
    </View>
  );
}

function Bar({
  width,
  height = 6,
  highlighted = false
}: {
  width: number;
  height?: number;
  highlighted?: boolean;
}) {
  const styles = useStyles();
  return <View style={[styles.bar, { width, height }, highlighted && styles.barHighlighted]} />;
}

const useStyles = makeStyles(({ colors, shadow }) => ({
  // The form takes what the preview leaves of the wizard's width (WIZARD_DESKTOP_WIDTH).
  desktop: { flexDirection: "row", gap: 40, alignItems: "flex-start" },
  formDesktop: { flex: 1, minWidth: 0 },
  fields: { gap: 10, marginTop: 18 },
  fieldsDesktop: { gap: 14, marginTop: 26 },
  row: { flexDirection: "row", gap: 10 },
  rowDesktop: { gap: 14 },
  postal: { width: 104 },
  postalDesktop: { width: 130 },
  city: { flex: 1 },
  assistant: { marginTop: 18, alignItems: "flex-start" },
  preview: { width: 440, flexShrink: 0, gap: 10 },
  previewLabel: {
    ...sans(600),
    fontSize: type.fieldLabel,
    color: colors.text.secondary
  },
  page: {
    height: 622,
    backgroundColor: colors.background.surface,
    borderRadius: radius.sm,
    boxShadow: shadow.card,
    paddingTop: 34,
    paddingHorizontal: 36,
    paddingBottom: 30
  },
  // As the PDF's: the business on the left, the recipient where it stands without it.
  pageTop: { flexDirection: "row", alignItems: "flex-start" },
  sender: { width: 196, paddingRight: 12, gap: 1 },
  pageBusiness: {
    ...sans(700),
    fontSize: 13,
    color: colors.text.primary,
    marginBottom: 3
  },
  senderLine: { ...sans(400), fontSize: 8.5, lineHeight: 12, color: colors.text.primary },
  // Each number under its name in small capitals, as on the PDF.
  numbers: { flexDirection: "row", flexWrap: "wrap", columnGap: 12, rowGap: 4, marginTop: 6 },
  numberLabel: { marginBottom: 1 },
  pageInvoice: {
    ...sans(700),
    fontSize: 20,
    color: colors.text.primary
  },
  // The labels in small capitals, as the PDF's.
  caps: {
    ...sans(600),
    fontSize: 7,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: colors.text.secondary,
    marginBottom: 3
  },
  address: { flex: 1, minWidth: 0, marginTop: 34, gap: 2 },
  // One line of the address: the same box, empty (a bar) or typed.
  addressRow: { height: 18, justifyContent: "center", alignItems: "flex-start" },
  addressLine: {
    ...sans(500),
    fontSize: 12,
    lineHeight: 18,
    color: colors.text.primary,
    alignSelf: "flex-start"
  },
  addressName: { ...sans(700) },
  highlight: {
    backgroundColor: colors.background.accentSubtle,
    borderRadius: 4,
    paddingHorizontal: 4,
    marginHorizontal: -4,
    overflow: "hidden"
  },
  titleRow: { marginTop: 22, flexDirection: "row", alignItems: "center", gap: 8 },
  dates: { marginTop: 14, flexDirection: "row" },
  dateCell: { flex: 1, gap: 2 },
  dateValue: { ...sans(600), fontSize: 10.5, color: colors.text.primary },
  table: { marginTop: 24 },
  tableHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.text.primary
  },
  tableRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle
  },
  totals: { alignSelf: "flex-end", width: 186, gap: 8, paddingTop: 12 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  grandTotal: { paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.text.primary },
  notices: { marginTop: 22, flexDirection: "row", gap: 30 },
  // The payment's box, last, as on the PDF: its QR code and its text. Outlined, not sand: two
  // background colours per screen at most (the app's and the page's).
  pay: {
    marginTop: "auto",
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    padding: 12,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border.subtle
  },
  payCode: {
    width: 64,
    height: 64,
    borderRadius: 4,
    backgroundColor: colors.border.subtle
  },
  payText: { gap: 8 },
  bar: { borderRadius: radius.pill, backgroundColor: colors.border.subtle },
  barHighlighted: { backgroundColor: colors.background.accentSubtle }
}));
