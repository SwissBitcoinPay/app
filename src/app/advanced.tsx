import { Redirect } from "expo-router";
import { useTranslation } from "react-i18next";
import { StyleSheet, View } from "react-native";

import { CountryDetectionSetting } from "@/features/account/CountryDetectionSetting";
import { RescueEntrySetting } from "@/features/rescue/RescueEntrySetting";
import { DeviceRelaysScreen } from "@/features/relays/DeviceRelaysScreen";
import { useTerminalProfile } from "@/features/terminal/profile-cache";
import { space } from "@/theme";

/**
 * "Advanced settings" of the welcome screen: the relays this device
 * works with before any sign-in, where the login looks for the account's backup and where a new
 * account is created, and whether its sign-up may ask country.is its country. Once signed in, the account's relays replace them. A device that takes
 * payments (a link of the web app opens this address too) goes to its point of sale: its list is
 * its account's or its business's, and an employee's device would no longer find its channel.
 */
export default function AdvancedSettings() {
  const { t } = useTranslation();
  const profile = useTerminalProfile({ follow: false });
  // Read from the device's storage: an instant.
  if (profile === undefined) return null;
  if (profile) return <Redirect href="/pos" />;
  return (
    <DeviceRelaysScreen
      title={t("relays.advanced")}
      lead={t("relays.advancedLead")}
      // "Sign-up": whether the sign-up may ask country.is.
      below={
        <View style={styles.below}>
          <CountryDetectionSetting />
          {/* "Open with my 12 words". */}
          <RescueEntrySetting />
        </View>
      }
      testID="advanced"
    />
  );
}

const styles = StyleSheet.create({ below: { gap: space[8] } });
