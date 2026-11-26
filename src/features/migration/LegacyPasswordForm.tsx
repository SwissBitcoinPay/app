import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Text } from "react-native";

import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { TextField } from "@/components/ui/TextField";
import { WaitingIndicator } from "@/components/ui/WaitingIndicator";
import { SUPPORT_EMAIL } from "@/config/support";
import { makeStyles, sans, type } from "@/theme";

import {
  migrationEmail,
  passwordChangeGiven,
  passwordChanged,
  passwordStopped,
  readWithPassword,
  rememberMigrationEmail,
  type PasswordFailure
} from "./flow";

/**
 * The password of the v2 account, on the account's card (src/app/migration/index.tsx) when the v2
 * app's session no longer serves, or where nothing of the v2 app is on the device: the e-mail and
 * password read the v2 account once, then `onRead`. Neither is kept. Never without them (the v2
 * account is frozen at the end, which only its owner can ask): "Forgot your password?" sends a link
 * to choose a new one (forgot.tsx). `emailKnown`: the e-mail is the card's (the v2 app's copy of
 * the account), not asked again.
 */
export function LegacyPasswordForm({
  emailKnown,
  onRead
}: {
  emailKnown: boolean;
  onRead: () => void;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  const router = useRouter();
  const [email, setEmail] = useState(migrationEmail);
  const [password, setPassword] = useState("");
  const [checking, setChecking] = useState(false);
  const [failure, setFailure] = useState<PasswordFailure | null>(null);
  // A ref: a double tap must not log in twice before the re-render.
  const running = useRef(false);
  // "I already chose a new password" (elsewhere: another browser, a computer): its one more try,
  // given here (flow.ts, passwordChanged), the form drawn again.
  const [changed, setChanged] = useState(passwordChangeGiven);
  // Counted for the whole run of the app, whatever screen asked (flow.ts): the v2 server locks the
  // account at the fourth try after three refusals, and the v2 service still runs. Read again at
  // each refusal (`failure`) and each new try given (`changed`).
  const [stop, setStop] = useState(passwordStopped);
  const stopped = stop !== null;

  const submit = async () => {
    if (running.current || checking || stopped) return;
    if (email.trim() === "" || password === "") return;
    running.current = true;
    setChecking(true);
    setFailure(null);
    rememberMigrationEmail(email);
    try {
      const answer = await readWithPassword(email, password);
      if (answer.ok) {
        // Forgotten as soon as it served.
        setPassword("");
        onRead();
        return;
      }
      setFailure(answer.failure);
      setStop(passwordStopped());
    } finally {
      running.current = false;
      setChecking(false);
    }
  };

  const forgotten = () => {
    rememberMigrationEmail(email);
    router.push("/migration/forgot");
  };

  return (
    <>
      {stopped ? (
        <Callout tone="warning" testID="migration-login-stopped">
          {stop === "secondFactor"
            ? t("migration.login.errors.secondFactor", { email: SUPPORT_EMAIL })
            : t("migration.login.errors.stopped")}
        </Callout>
      ) : (
        <>
          {emailKnown ? null : (
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
              disabled={checking}
              testID="migration-email"
            />
          )}
          <TextField
            label={t("migration.login.password")}
            value={password}
            onChangeText={setPassword}
            icon="key"
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={() => void submit()}
            disabled={checking}
            error={
              failure === "refused"
                ? t("migration.login.errors.refused")
                : failure === "unreachable"
                  ? t("migration.login.errors.unreachable")
                  : null
            }
            testID="migration-password"
          />
        </>
      )}
      {checking ? <WaitingIndicator label={t("migration.login.checking")} /> : null}
      {stopped ? null : (
        <Button
          icon="arrow-right"
          onPress={() => void submit()}
          disabled={checking || email.trim() === "" || password === ""}
          testID="migration-login-submit"
        >
          {t("common.continue")}
        </Button>
      )}
      {stop === "secondFactor" ? null : (
        <Button
          variant={stopped ? "primary" : "text"}
          size={stopped ? undefined : "md"}
          onPress={forgotten}
          disabled={checking}
          testID="migration-forgot-open"
        >
          {t(stopped ? "migration.forgot.choose" : "migration.login.forgotten")}
        </Button>
      )}
      {stop === "refused" && !changed ? (
        <Button
          variant="text"
          size="md"
          onPress={() => {
            passwordChanged();
            setChanged(true);
            setStop(passwordStopped());
          }}
          testID="migration-login-changed"
        >
          {t("migration.login.changed")}
        </Button>
      ) : null}
      <Text style={styles.note}>{t("migration.login.note")}</Text>
    </>
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
