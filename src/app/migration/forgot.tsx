import { Redirect, useRouter } from "expo-router";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Text } from "react-native";

import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { Lead, ScreenTitle } from "@/components/ui/Heading";
import { TextField } from "@/components/ui/TextField";
import { WaitingIndicator } from "@/components/ui/WaitingIndicator";
import { getMigration, migrationEmail, rememberMigrationEmail } from "@/features/migration/flow";
import { MigrationFrame } from "@/features/migration/MigrationFrame";
import { logFailure } from "@/lib/log/log";
import { LegacyServerError, requestLegacyPasswordReset } from "@/lib/legacy-v2/server";
import { makeStyles, sans, type } from "@/theme";

/**
 * "Forgot your password" of the v2 account (as the v2 dashboard's password reset): the e-mail,
 * then the v2 server sends it a link to this app's "New password" (password.tsx), valid 15 minutes. It answers the same for an
 * e-mail it does not know: the screen says an e-mail leaves only if an account has that address.
 *
 * Only during a migration (index.tsx): opened otherwise, it leads there.
 */
export default function MigrationForgotScreen() {
  const [migration] = useState(getMigration);
  if (!migration) return <Redirect href="/migration" />;
  return <Forgot />;
}

type Sending = "idle" | "sending" | "sent" | "rejected" | "failed";

function Forgot() {
  const { t, i18n } = useTranslation();
  const styles = useStyles();
  const router = useRouter();
  const [email, setEmail] = useState(migrationEmail);
  const [sending, setSending] = useState<Sending>("idle");
  // A ref: a double tap must not send two e-mails before the re-render.
  const running = useRef(false);

  const send = async () => {
    const typed = email.trim();
    if (running.current || typed === "") return;
    running.current = true;
    setSending("sending");
    rememberMigrationEmail(typed);
    try {
      await requestLegacyPasswordReset(typed, i18n.language.slice(0, 2));
      setSending("sent");
    } catch (error) {
      if (error instanceof LegacyServerError && error.code === "rejected") {
        setSending("rejected");
      } else {
        logFailure("Asking the v2 password's reset failed", error, false);
        setSending("failed");
      }
    } finally {
      running.current = false;
    }
  };

  const back = () => (router.canGoBack() ? router.back() : router.replace("/migration"));

  if (sending === "sent") {
    return (
      <MigrationFrame testID="migration-forgot">
        <ScreenTitle>{t("migration.forgot.sentTitle")}</ScreenTitle>
        <Callout tone="success" testID="migration-forgot-sent">
          {t("migration.forgot.sent", { email: email.trim() })}
        </Callout>
        <Text style={styles.note}>{t("migration.forgot.sentNote")}</Text>
        <Button variant="secondary" onPress={back} testID="migration-forgot-back">
          {t("common.back")}
        </Button>
      </MigrationFrame>
    );
  }

  return (
    <MigrationFrame testID="migration-forgot">
      <ScreenTitle>{t("migration.forgot.title")}</ScreenTitle>
      <Lead>{t("migration.forgot.lead")}</Lead>
      <TextField
        label={t("migration.login.email")}
        value={email}
        onChangeText={setEmail}
        icon="envelope"
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="username"
        returnKeyType="send"
        onSubmitEditing={() => void send()}
        disabled={sending === "sending"}
        error={sending === "rejected" ? t("migration.forgot.invalidEmail") : null}
        testID="migration-forgot-email"
      />
      {sending === "sending" ? <WaitingIndicator label={t("migration.forgot.sending")} /> : null}
      {sending === "failed" ? (
        <ErrorMessage testID="migration-forgot-failed">{t("migration.forgot.failed")}</ErrorMessage>
      ) : null}
      <Button
        icon="envelope"
        onPress={() => void send()}
        disabled={sending === "sending" || email.trim() === ""}
        testID="migration-forgot-send"
      >
        {t("migration.forgot.send")}
      </Button>
      <Button variant="text" size="md" onPress={back} testID="migration-forgot-cancel">
        {t("common.back")}
      </Button>
    </MigrationFrame>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  note: {
    ...sans(500),
    fontSize: type.caption,
    lineHeight: type.caption * 1.5,
    color: colors.text.secondary,
    textAlign: "center"
  }
}));
