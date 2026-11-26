import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";

import { useIsDesktop } from "@/components/layout/useIsDesktop";
import { AddAction } from "@/components/ui/AddAction";
import { TextField } from "@/components/ui/TextField";
import { INVOICE_TEXT_MAX_LENGTH, REDIRECT_URL_MAX_LENGTH } from "@/config/invoices";
import { isRedirectUrl } from "@/lib/invoice/record";
import { makeStyles, sans, space, type } from "@/theme";

import { StepTitle } from "./WizardFrame";

/** Whether the redirection typed can be saved: none, or an https URL. */
export function redirectValid(url: string | null): boolean {
  return url === null || url.trim() === "" || isRedirectUrl(url.trim());
}

/**
 * Step 4, the notices: the payment conditions and the legal notice, multi-line texts. They start
 * empty and are not kept from one invoice to the next (only the VAT rate is). The redirection URL,
 * which almost nobody uses, stays a ghost action: the payer's page offers to go there once paid,
 * which the hint below the field says.
 */
export function TermsStep({
  terms,
  legal,
  redirectUrl,
  redirectOpen,
  onChange,
  onOpenRedirect,
  disabled
}: {
  terms: string;
  legal: string;
  redirectUrl: string | null;
  redirectOpen: boolean;
  onChange: (patch: { terms?: string; legal?: string; redirectUrl?: string | null }) => void;
  onOpenRedirect: () => void;
  disabled: boolean;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  const desktop = useIsDesktop();
  const redirectError = !redirectValid(redirectUrl) ? t("invoices.terms.redirectInvalid") : null;
  return (
    <View>
      <StepTitle>{t("invoices.terms.title")}</StepTitle>
      <View style={[styles.fields, desktop && styles.fieldsDesktop]}>
        <TextField
          label={t("invoices.terms.conditions")}
          value={terms}
          onChangeText={(value) => onChange({ terms: value.slice(0, INVOICE_TEXT_MAX_LENGTH) })}
          multiline={3}
          disabled={disabled}
          testID="invoice-terms"
        />
        <TextField
          label={t("invoices.terms.legal")}
          value={legal}
          onChangeText={(value) => onChange({ legal: value.slice(0, INVOICE_TEXT_MAX_LENGTH) })}
          multiline={3}
          disabled={disabled}
          testID="invoice-legal"
        />
        {redirectOpen ? (
          <View style={styles.redirect}>
            <TextField
              label={t("invoices.terms.redirect")}
              value={redirectUrl ?? ""}
              onChangeText={(value) =>
                onChange({
                  redirectUrl: value === "" ? null : value.slice(0, REDIRECT_URL_MAX_LENGTH)
                })
              }
              placeholder="https://"
              keyboardType="url"
              autoCapitalize="none"
              autoComplete="url"
              autoFocus={redirectUrl === null}
              error={redirectError}
              disabled={disabled}
              testID="invoice-redirect"
            />
            <Text style={styles.hint}>{t("invoices.terms.redirectHint")}</Text>
          </View>
        ) : null}
      </View>
      {redirectOpen ? null : (
        <View style={styles.add}>
          <AddAction
            label={t("invoices.terms.addRedirect")}
            onPress={onOpenRedirect}
            testID="invoice-add-redirect"
          />
        </View>
      )}
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  fields: { marginTop: 20, gap: 14 },
  fieldsDesktop: { marginTop: 26, gap: 16 },
  redirect: { gap: 6 },
  hint: { ...sans(500), fontSize: type.caption, color: colors.text.secondary },
  add: { marginTop: space[5] }
}));
