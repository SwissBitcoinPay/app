import { useState } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, View } from "react-native";

import { CountryPicker } from "@/components/CountryPicker";
import { Select } from "@/components/ui/Select";
import {
  businessCountry,
  companyNumberLabel,
  vatNumberLabel
} from "@/features/invoices/business-details";
import type { Language } from "@/i18n/languages";
import { getCountryName } from "@/lib/countries";
import {
  BUSINESS_ADDRESS_FIELD_MAX_LENGTH,
  BUSINESS_NUMBER_MAX_LENGTH,
  type BusinessAddress,
  type MerchantSettings
} from "@/lib/settings/merchant";
import { space } from "@/theme";

import { changeBusinessAddress, changeBusinessNumber } from "./account-settings";
import { LineField, SettingBlock } from "./fields";
import { useSettingsFailure, useSettingsSaved } from "./parts";

/*
 * Who issues the business's invoices, in "Settings › Business":
 * "Business address", then "Business numbers" (BusinessNumbersSetting), written under
 * its name on its invoices' PDF (src/features/invoices/invoice-html.ts) and its preview. The
 * address's lines as an invoice's recipient's (RecipientStep.tsx: the
 * street, the postal code beside the city, the country picked), each field saved when left, as
 * every field of "Settings" (fields.tsx). The country is the account's detected one until
 * another is picked.
 */

const KEY = "settings-address";

export function BusinessAddressSetting({ settings }: { settings: MerchantSettings }) {
  const { t, i18n } = useTranslation();
  const fail = useSettingsFailure();
  const saved = useSettingsSaved();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [countryBusy, setCountryBusy] = useState(false);
  const address = settings.businessAddress;
  const country = address?.country ?? settings.detectedCountry;

  const save = async (line: keyof BusinessAddress, value: string) => {
    await changeBusinessAddress(line, value);
    saved(KEY, t("settings.address.savedTitle"));
  };
  const line = (name: "street" | "postalCode" | "city") => ({
    text: address?.[name] ?? "",
    label: t(`settings.address.${name}`),
    maxLength: BUSINESS_ADDRESS_FIELD_MAX_LENGTH,
    onSave: (value: string) => save(name, value),
    onFail: (error: unknown) => fail(error, KEY),
    testID: `business-address-${name}`
  });
  const pickCountry = (code: string) => {
    if (code === country) return;
    setCountryBusy(true);
    save("country", code)
      .catch((error: unknown) => fail(error, KEY))
      .finally(() => setCountryBusy(false));
  };

  return (
    <SettingBlock
      title={t("settings.address.title")}
      description={t("settings.address.description")}
      testID="business-address"
    >
      <View style={styles.fields}>
        <LineField autoComplete="street-address" {...line("street")} />
        <View style={styles.row}>
          <LineField autoComplete="postal-code" style={styles.postal} {...line("postalCode")} />
          <LineField style={styles.city} {...line("city")} />
        </View>
        <Select
          label={t("settings.address.country")}
          value={country ? getCountryName(country, i18n.language as Language) : null}
          onPress={() => setPickerOpen(true)}
          busy={countryBusy}
          testID="business-address-country"
        />
      </View>
      <CountryPicker
        title={t("settings.address.country")}
        visible={pickerOpen}
        value={country}
        suggested={settings.detectedCountry}
        onSelect={pickCountry}
        onClose={() => setPickerOpen(false)}
      />
    </SettingBlock>
  );
}

/**
 * "Business numbers": the company number and the VAT number,
 * written on the invoices under the address, each named as the business's country names it
 * (business-details.ts: "UID number", "SIRET number"…); their names change with the country.
 */
export function BusinessNumbersSetting({ settings }: { settings: MerchantSettings }) {
  const { t } = useTranslation();
  const fail = useSettingsFailure();
  const saved = useSettingsSaved();
  const country = businessCountry(settings);
  const field = (which: "companyNumber" | "vatNumber", label: string) => ({
    text: settings[which],
    label,
    maxLength: BUSINESS_NUMBER_MAX_LENGTH,
    onSave: async (value: string) => {
      await changeBusinessNumber(which, value);
      saved(NUMBERS_KEY, t("settings.numbers.savedTitle"));
    },
    onFail: (error: unknown) => fail(error, NUMBERS_KEY),
    testID: `business-${which}`
  });
  return (
    <SettingBlock
      title={t("settings.numbers.title")}
      description={t("settings.numbers.description")}
      testID="business-numbers"
    >
      <View style={styles.fields}>
        <LineField {...field("companyNumber", companyNumberLabel(t, country))} />
        <LineField {...field("vatNumber", vatNumberLabel(t, country))} />
      </View>
    </SettingBlock>
  );
}

const NUMBERS_KEY = "settings-numbers";

const styles = StyleSheet.create({
  fields: { maxWidth: 480, gap: space[4] },
  row: { flexDirection: "row", gap: space[4] },
  postal: { width: 120 },
  city: { flex: 1 }
});
