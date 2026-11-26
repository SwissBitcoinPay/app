import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { Switch } from "@/components/ui/Switch";
import { SettingBlock } from "@/features/settings/fields";
import { SettingsCard, SettingsRow } from "@/features/settings/parts";
import { logFailure } from "@/lib/log/log";

import { DEFAULT_COUNTRY_DETECTION } from "./country-detection-format";
import { readCountryDetection, writeCountryDetection } from "./country-detection-store";

/**
 * "Sign-up" of "Advanced settings": whether the sign-up may ask country.is the country of this
 * device's IP address (detection.ts). This device's choice, saved as it is switched; no
 * notification before the sign-in: a failure is said under it.
 */
export function CountryDetectionSetting() {
  const { t } = useTranslation();
  // null while read.
  const [detect, setDetect] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let current = true;
    void readCountryDetection().then((saved) => {
      if (current) setDetect(saved ?? DEFAULT_COUNTRY_DETECTION);
    });
    return () => {
      current = false;
    };
  }, []);

  const toggle = (value: boolean) => {
    const before = detect;
    setDetect(value);
    setSaving(true);
    setFailed(false);
    writeCountryDetection(value)
      .catch((error: unknown) => {
        logFailure("Saving the country detection's choice failed", error);
        setDetect(before);
        setFailed(true);
      })
      .finally(() => setSaving(false));
  };

  return (
    <SettingBlock title={t("relays.countryDetection.section")}>
      <SettingsCard>
        <SettingsRow
          icon="globe"
          label={t("relays.countryDetection.title")}
          caption={t("relays.countryDetection.caption")}
          trailing={
            <Switch
              value={detect ?? DEFAULT_COUNTRY_DETECTION}
              onValueChange={toggle}
              label={t("relays.countryDetection.title")}
              loading={detect === null || saving}
              testID="country-detection-switch"
            />
          }
          wrap
          testID="country-detection-row"
        />
      </SettingsCard>
      {failed ? (
        <ErrorMessage testID="country-detection-failed">
          {t("relays.countryDetection.saveFailed")}
        </ErrorMessage>
      ) : null}
    </SettingBlock>
  );
}
