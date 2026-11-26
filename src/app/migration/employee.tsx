import { Redirect, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

import { Button } from "@/components/ui/Button";
import { Lead, ScreenTitle } from "@/components/ui/Heading";
import { isHandheld } from "@/lib/handheld";
import { useLegacyState } from "@/features/migration/legacy-state";
import { MigrationFrame } from "@/features/migration/MigrationFrame";
import { useTerminalProfile } from "@/features/terminal/profile-cache";
import { makeStyles } from "@/theme";

/**
 * "Swiss Bitcoin Pay becomes sattle.me" for a till of the v2 app (employees are invited again):
 * it has no account nor money of its own, only the team it joins
 * (src/app/join.tsx), once its owner moved to sattle.me and invited it. "I am the manager of this
 * business" leads to the owner's migration (an owner who had logged in as a till).
 *
 * Only for such a device: opened otherwise, it leads to the launch screen.
 */
export default function MigrationEmployeeScreen() {
  const { t } = useTranslation();
  const styles = useStyles();
  const router = useRouter();
  const profile = useTerminalProfile({ follow: false });
  const legacy = useLegacyState(profile === null);
  if (profile === undefined || (profile === null && legacy === undefined)) {
    return <View style={styles.blank} />;
  }
  if (profile || !legacy) return <Redirect href="/" />;
  const business = legacy.account?.name ?? null;
  return (
    <MigrationFrame testID="migration-employee">
      <ScreenTitle>{t("migration.employee.title")}</ScreenTitle>
      <Lead>
        {business
          ? t("migration.employee.leadBusiness", { business })
          : t("migration.employee.lead")}
      </Lead>
      <Button
        icon={isHandheld() ? "qrcode" : "link"}
        onPress={() => router.push("/join")}
        testID="migration-employee-join"
      >
        {t("migration.employee.join")}
      </Button>
      <Button
        variant="text"
        size="md"
        onPress={() => router.push({ pathname: "/migration", params: { owner: "1" } })}
        testID="migration-employee-owner"
      >
        {t("migration.employee.owner")}
      </Button>
    </MigrationFrame>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  blank: { flex: 1, backgroundColor: colors.background.app }
}));
