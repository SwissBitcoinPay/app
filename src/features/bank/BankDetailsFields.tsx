import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";

import { CountryPicker } from "@/components/CountryPicker";
import { useIsDesktop } from "@/components/layout/useIsDesktop";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Select } from "@/components/ui/Select";
import { TextField } from "@/components/ui/TextField";
import type { Language } from "@/i18n/languages";
import { getCountryName } from "@/lib/countries";
import { formatIban, isValidIban } from "@/lib/iban";
import { makeStyles, sans, type } from "@/theme";

import type { BankDetails, BankHolderKind } from "./bank-details";

/**
 * The bank details' fields, the same wherever the app asks for them: the sign-up's bank step,
 * "Settings › Bank account" and "Sell"'s bank accounts. Who holds the account first, always asked:
 * a person (first and last names) or a company (its name); then the IBAN, the address, the holder's
 * country of residence: what Mt Pelerin registers, nothing else (no address complement nor
 * transfer reference: Mt Pelerin takes neither). The country is picked in CountryPicker, this
 * component's own, or the caller's (`onPickCountry`: a panel opens it over itself, Sheet's `over`).
 */
export function BankDetailsFields({
  value,
  onChange,
  disabled = false,
  ibanError,
  ibanLocked = false,
  suggestedCountry = null,
  onPickCountry,
  testID = "bank"
}: {
  value: BankDetails;
  onChange: (patch: Partial<BankDetails>) => void;
  disabled?: boolean;
  /** The IBAN refused by a check of the caller's, said in place of the field's own. */
  ibanError?: string | null;
  /** The IBAN shown, not to change (an account's edit: another IBAN is another account). */
  ibanLocked?: boolean;
  /** Listed first by the country picker (the detected country). */
  suggestedCountry?: string | null;
  onPickCountry?: () => void;
  testID?: string;
}) {
  const styles = useStyles();
  const { t, i18n } = useTranslation();
  const desktop = useIsDesktop();
  const [ibanTouched, setIbanTouched] = useState(false);
  const [picking, setPicking] = useState(false);
  const ownIbanError =
    ibanTouched && value.iban !== "" && !isValidIban(value.iban) ? t("bank.ibanInvalid") : null;

  return (
    <View style={[styles.fields, desktop && styles.fieldsDesktop]}>
      <View style={styles.holder}>
        <Text style={styles.label}>{t("bank.holderKind")}</Text>
        <SegmentedControl<BankHolderKind>
          label={t("bank.holderKind")}
          options={[
            { value: "person", label: t("bank.person") },
            { value: "company", label: t("bank.company") }
          ]}
          value={value.holderKind}
          onChange={(holderKind) => onChange({ holderKind })}
          stretch
          disabled={disabled}
          testID={`${testID}-holder`}
        />
      </View>
      {value.holderKind === "company" ? (
        <TextField
          label={t("bank.companyName")}
          value={value.companyName}
          onChangeText={(companyName) => onChange({ companyName })}
          autoComplete="organization"
          disabled={disabled}
          testID={`${testID}-company`}
        />
      ) : value.holderKind === "person" ? (
        <View style={styles.row}>
          <TextField
            label={t("bank.firstname")}
            value={value.firstname}
            onChangeText={(firstname) => onChange({ firstname })}
            autoComplete="given-name"
            disabled={disabled}
            style={styles.flex}
            testID={`${testID}-firstname`}
          />
          <TextField
            label={t("bank.lastname")}
            value={value.lastname}
            onChangeText={(lastname) => onChange({ lastname })}
            autoComplete="family-name"
            disabled={disabled}
            style={styles.flex}
            testID={`${testID}-lastname`}
          />
        </View>
      ) : null}
      <TextField
        label={t("bank.iban")}
        value={value.iban}
        onChangeText={(iban) => onChange({ iban: formatIban(iban) })}
        onBlur={() => setIbanTouched(true)}
        error={ibanError ?? ownIbanError}
        autoCapitalize="characters"
        autoCorrect={false}
        autoComplete="off"
        disabled={disabled || ibanLocked}
        testID={`${testID}-iban`}
      />
      <TextField
        label={t("bank.address")}
        value={value.address}
        onChangeText={(address) => onChange({ address })}
        placeholder={t("bank.addressPlaceholder")}
        autoComplete="street-address"
        disabled={disabled}
        testID={`${testID}-address`}
      />
      <View style={styles.row}>
        <TextField
          label={t("bank.postalCode")}
          value={value.postalCode}
          onChangeText={(postalCode) => onChange({ postalCode })}
          placeholder={t("bank.postalCodePlaceholder")}
          autoComplete="postal-code"
          disabled={disabled}
          style={desktop ? styles.postalDesktop : styles.postal}
          testID={`${testID}-postal-code`}
        />
        <TextField
          label={t("bank.city")}
          value={value.city}
          onChangeText={(city) => onChange({ city })}
          placeholder={t("bank.cityPlaceholder")}
          disabled={disabled}
          style={styles.flex}
          testID={`${testID}-city`}
        />
      </View>
      <Select
        label={t("bank.country")}
        value={value.country ? getCountryName(value.country, i18n.language as Language) : null}
        placeholder={t("countryPicker.search")}
        onPress={onPickCountry ?? (() => setPicking(true))}
        disabled={disabled}
        testID={`${testID}-country`}
      />
      {onPickCountry ? null : (
        <CountryPicker
          title={t("bank.country")}
          visible={picking}
          value={value.country}
          suggested={suggestedCountry}
          onSelect={(country) => onChange({ country })}
          onClose={() => setPicking(false)}
        />
      )}
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  fields: { gap: 8 },
  fieldsDesktop: { gap: 12 },
  holder: { gap: 8 },
  label: { ...sans(600), fontSize: type.fieldLabel, color: colors.text.secondary },
  row: { flexDirection: "row", gap: 12 },
  flex: { flex: 1 },
  postal: { width: 130 },
  postalDesktop: { width: 150 }
}));
