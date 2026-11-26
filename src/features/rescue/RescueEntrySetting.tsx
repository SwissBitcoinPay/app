import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";

import { SettingBlock } from "@/features/settings/fields";
import { SettingsCard, SettingsRow } from "@/features/settings/parts";

/**
 * "Open with my 12 words" in "Advanced settings" of the welcome screen (src/app/advanced.tsx):
 * reached there too, not only after a passkey failed.
 */
export function RescueEntrySetting() {
  const { t } = useTranslation();
  const router = useRouter();
  return (
    <SettingBlock title={t("rescue.section")}>
      <SettingsCard>
        <SettingsRow
          icon="key"
          label={t("rescue.entry")}
          caption={t("rescue.entryLead")}
          onPress={() => router.push("/rescue")}
          wrap
          testID="rescue-entry-row"
        />
      </SettingsCard>
    </SettingBlock>
  );
}
