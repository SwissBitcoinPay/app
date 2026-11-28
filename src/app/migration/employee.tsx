import { Redirect, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

import { Button } from "@/components/ui/Button";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { Lead, ScreenTitle } from "@/components/ui/Heading";
import { WaitingIndicator } from "@/components/ui/WaitingIndicator";
import { accountFailureMessage } from "@/features/account/usePasskeyAccount";
import { isHandheld } from "@/lib/handheld";
import { useLegacyState } from "@/features/migration/legacy-state";
import { MigrationFrame } from "@/features/migration/MigrationFrame";
import { migrationProgressKey } from "@/features/migration/progress";
import { useMigrationAccount } from "@/features/migration/useMigrationAccount";
import { useTerminalProfile } from "@/features/terminal/profile-cache";
import { makeStyles } from "@/theme";

/**
 * "Swiss Bitcoin Pay becomes sattle.me" for a till of the v2 app (employees are invited again):
 * it has no account nor money of its own, only the team it joins
 * (src/app/join.tsx), once its owner moved to sattle.me and invited it. "I already have a
 * sattle.me account" asks the passkey at once, as the welcome screen's "Log in": an owner whose
 * device the v2 app took for a till (its role absent, or a till's: store.ts, readLegacyState),
 * who migrated elsewhere. The v2 app's session is forgotten once logged in (useMigrationAccount).
 * Not offered when the v2 wallet's words are on this device: they go to no account opened this way
 * (wallet-owner.ts), and only the owner's migration then offers to move their money.
 * "I am the manager of this business" leads to the owner's migration (an owner who had logged in
 * as a till), which reads the v2 account and opens an account migrated before.
 *
 * Only for such a device: opened otherwise, it leads to the launch screen.
 */
export default function MigrationEmployeeScreen() {
  const { t } = useTranslation();
  const styles = useStyles();
  const router = useRouter();
  const passkey = useMigrationAccount();
  const profile = useTerminalProfile({ follow: false });
  const legacy = useLegacyState(profile === null);
  if (profile === undefined || (profile === null && legacy === undefined)) {
    return <View style={styles.blank} />;
  }
  if (profile || !legacy) return <Redirect href="/" />;
  const business = legacy.account?.name ?? null;
  const busy = passkey.progress !== null;
  return (
    <MigrationFrame testID="migration-employee">
      <ScreenTitle>{t("migration.employee.title")}</ScreenTitle>
      <Lead>
        {business
          ? t("migration.employee.leadBusiness", { business })
          : t("migration.employee.lead")}
      </Lead>
      {passkey.progress ? (
        <WaitingIndicator label={t(migrationProgressKey(passkey.progress))} />
      ) : passkey.failure ? (
        <ErrorMessage testID="migration-employee-failure">
          {accountFailureMessage(passkey.failure, t)}
        </ErrorMessage>
      ) : null}
      <Button
        icon={isHandheld() ? "qrcode" : "link"}
        onPress={() => router.push("/join")}
        disabled={busy}
        testID="migration-employee-join"
      >
        {t("migration.employee.join")}
      </Button>
      {/* The passkey's prompt right on the tap, nothing awaited before it (Safari). */}
      {legacy.hasWallet ? null : (
        <Button
          variant="secondary"
          icon="key"
          onPress={passkey.logIn}
          disabled={busy}
          testID="migration-employee-login"
        >
          {t("migration.employee.logIn")}
        </Button>
      )}
      <Button
        variant="text"
        size="md"
        onPress={() => router.push({ pathname: "/migration", params: { owner: "1" } })}
        disabled={busy}
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
