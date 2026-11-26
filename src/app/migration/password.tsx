import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { Lead, ScreenTitle } from "@/components/ui/Heading";
import { Icon } from "@/components/ui/Icon";
import { TextField } from "@/components/ui/TextField";
import { WaitingIndicator } from "@/components/ui/WaitingIndicator";
import { getMigration, passwordChanged } from "@/features/migration/flow";
import { MigrationFrame } from "@/features/migration/MigrationFrame";
import { useUrlFragment } from "@/features/linking/useUrlFragment";
import { logFailure } from "@/lib/log/log";
import { LegacyServerError, passwordChecks, resetLegacyPassword } from "@/lib/legacy-v2/server";
import { makeStyles, proseLineHeight, sans, type, useTheme } from "@/theme";

/** The reset link's code: the v2 server's `_password_reset_codes` id, a UUID. */
const CODE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * "New password" of the v2 account (as the v2 dashboard's
 * page `/reset-password`): opened by the link the v2 server e-mails (forgot.tsx), its code in the
 * fragment (`/migration/password#<code>`: never sent to the web app's host, never logged). The new
 * password, checked against the v2 server's rules as it is typed, is sent once with the code; the
 * v2 server then closes the account's sessions. Then the migration goes on with it (the password's
 * screen, or the migration's start when the app was opened by the link).
 *
 * Any device may open it: the code is all the v2 server asks, and it changes nothing of this app.
 */
export default function MigrationPasswordScreen() {
  const fragment = useUrlFragment();
  const code = fragment.replace(/^#/, "");
  return <NewPassword code={CODE.test(code) ? code.toLowerCase() : null} />;
}

type Outcome = "idle" | "saving" | "done" | "expired" | "rejected" | "failed";

function NewPassword({ code }: { code: string | null }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useStyles();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [outcome, setOutcome] = useState<Outcome>(code ? "idle" : "expired");
  // A ref: a double tap must not send the code twice (the second would say it expired).
  const running = useRef(false);
  const checks = passwordChecks(password);
  const valid = checks.length && checks.letter && checks.digit;

  const save = async () => {
    if (running.current || !code || !valid) return;
    running.current = true;
    setOutcome("saving");
    try {
      await resetLegacyPassword(code, password);
      // Forgotten as soon as it served: typed again on the password's screen.
      setPassword("");
      passwordChanged();
      setOutcome("done");
    } catch (error) {
      const reason = error instanceof LegacyServerError ? error.code : null;
      if (reason === "expired") setOutcome("expired");
      else if (reason === "rejected") setOutcome("rejected");
      else {
        logFailure("Setting the v2 account's new password failed", error, false);
        setOutcome("failed");
      }
    } finally {
      running.current = false;
    }
  };

  // The migration under way goes on at its card, the password asked there; else it starts again
  // (the app opened by the link): its first screen leads there.
  const goOn = () => router.replace(getMigration() ? "/migration" : "/migration?manual=1");
  const askAgain = () =>
    router.replace(getMigration() ? "/migration/forgot" : "/migration?manual=1");

  if (outcome === "done") {
    return (
      <MigrationFrame testID="migration-password">
        <ScreenTitle>{t("migration.password.doneTitle")}</ScreenTitle>
        <Callout tone="success" testID="migration-password-done">
          {t("migration.password.done")}
        </Callout>
        <Button icon="arrow-right" onPress={goOn} testID="migration-password-continue">
          {t("common.continue")}
        </Button>
      </MigrationFrame>
    );
  }

  if (outcome === "expired") {
    return (
      <MigrationFrame testID="migration-password">
        <ScreenTitle>{t("migration.password.title")}</ScreenTitle>
        <Callout tone="warning" testID="migration-password-expired">
          {t("migration.password.expired")}
        </Callout>
        <Button icon="envelope" onPress={askAgain} testID="migration-password-again">
          {t("migration.password.again")}
        </Button>
      </MigrationFrame>
    );
  }

  const rules = [
    { key: "length", met: checks.length, text: t("migration.password.rules.length") },
    { key: "letter", met: checks.letter, text: t("migration.password.rules.letter") },
    { key: "digit", met: checks.digit, text: t("migration.password.rules.digit") }
  ];

  return (
    <MigrationFrame testID="migration-password">
      <ScreenTitle>{t("migration.password.title")}</ScreenTitle>
      <Lead>{t("migration.password.lead")}</Lead>
      <TextField
        label={t("migration.password.label")}
        value={password}
        onChangeText={setPassword}
        icon="key"
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="go"
        onSubmitEditing={() => void save()}
        disabled={outcome === "saving"}
        error={outcome === "rejected" ? t("migration.password.rejected") : null}
        testID="migration-password-field"
      />
      <View style={styles.rules} accessibilityRole="list">
        {rules.map(({ key, met, text }) => (
          <View
            key={key}
            style={styles.rule}
            testID={`migration-password-rule-${key}${met ? "-met" : ""}`}
            accessible
            accessibilityLabel={`${text} : ${t(met ? "migration.password.met" : "migration.password.unmet")}`}
          >
            <Icon
              name={met ? "circle-check" : "circle-xmark"}
              size={16}
              color={met ? colors.success.solid : colors.text.secondary}
            />
            <Text style={[styles.ruleText, met ? styles.ruleMet : null]}>{text}</Text>
          </View>
        ))}
      </View>
      {outcome === "saving" ? <WaitingIndicator label={t("migration.password.saving")} /> : null}
      {outcome === "failed" ? (
        <ErrorMessage testID="migration-password-failed">
          {t("migration.password.failed")}
        </ErrorMessage>
      ) : null}
      <Button
        icon="check"
        onPress={() => void save()}
        disabled={outcome === "saving" || !valid}
        testID="migration-password-save"
      >
        {t("migration.password.save")}
      </Button>
    </MigrationFrame>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  rules: { gap: 8 },
  rule: { flexDirection: "row", alignItems: "center", gap: 10 },
  ruleText: {
    ...sans(500),
    flex: 1,
    fontSize: type.prose,
    lineHeight: proseLineHeight,
    color: colors.text.secondary
  },
  ruleMet: { color: colors.text.primary }
}));
