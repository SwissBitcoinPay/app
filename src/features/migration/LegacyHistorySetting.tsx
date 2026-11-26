import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";

import { useIsDesktop } from "@/components/layout/useIsDesktop";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { TextField } from "@/components/ui/TextField";
import { LEGACY_MERCHANT_SERVICE_END } from "@/config/legacy-v2";
import { SettingBlock } from "@/features/settings/fields";
import type { LegacySession } from "@/lib/legacy-v2/server";
import { makeStyles, sans, type } from "@/theme";

import { openLegacySession, passwordStopped, type PasswordFailure } from "./flow";
import { HistoryImportLine } from "./HistoryImportLine";
import {
  readLegacyHistory,
  startLegacyHistoryImport,
  subscribeHistoryChanges,
  useHistoryImport
} from "./history-import";
import { useServiceEnds } from "./TransferStatus";

/**
 * The last moment the v2 server serves the merchants' accounts: the end of its last day in
 * Switzerland (CET in winter).
 */
export const LEGACY_HISTORY_DEADLINE = Date.parse(`${LEGACY_MERCHANT_SERVICE_END}T23:59:59+01:00`);

/**
 * "Swiss Bitcoin Pay history" of "Settings" ("Account"; a fallback to the copy that runs on its own
 * after the migration): the copy of the v2 account's history started again, its owner's v2 password
 * asked once, when the one after the migration was interrupted or the migration went on without the
 * password. Shown until the end of the v2 service, while the account's relays say a copy is to be
 * made and did not finish (written by the migration only: an account that never migrated is never
 * offered it; read by a majority: nothing shown while not read). A setting's block and a panel of
 * "Settings".
 */
export function LegacyHistorySetting({ now = Date.now }: { now?: () => number } = {}) {
  const styles = useStyles();
  const { t } = useTranslation();
  const desktop = useIsDesktop();
  const status = useHistoryImport();
  const ends = useServiceEnds();
  const [offered, setOffered] = useState(false);
  const [asking, setAsking] = useState(false);
  const [writes, setWrites] = useState(0);
  useEffect(() => subscribeHistoryChanges(() => setWrites((count) => count + 1)), []);
  // Read once when shown (and once a copy wrote): the end of the v2 service as it was then.
  const [open] = useState(() => now() <= LEGACY_HISTORY_DEADLINE);
  useEffect(() => {
    if (!open) return;
    let live = true;
    void readLegacyHistory().then((history) => {
      if (live) setOffered(history?.pending === true);
    });
    return () => {
      live = false;
    };
  }, [open, writes]);

  if (!offered && status.phase === "idle") return null;
  const startable = status.phase === "idle" || status.phase === "failed";
  return (
    <SettingBlock
      title={t("migration.history.settingTitle")}
      description={t("migration.history.settingDescription", { date: ends.merchant })}
      testID="legacy-history-setting"
    >
      <HistoryImportLine status={status} />
      {startable && offered ? (
        <View style={styles.row}>
          <Button
            variant="secondary"
            size="md"
            icon="arrow-right-arrow-left"
            fullWidth={!desktop}
            onPress={() => setAsking(true)}
            testID="legacy-history-open"
          >
            {t("migration.history.start")}
          </Button>
        </View>
      ) : null}
      <Sheet
        title={t("migration.history.settingTitle")}
        closeLabel={t("common.cancel")}
        visible={asking}
        onClose={() => setAsking(false)}
      >
        <LegacyPasswordForm
          lead={t("migration.history.lead")}
          submitLabel={t("migration.history.start")}
          testIDPrefix="legacy-history"
          onSession={(session) => {
            // The session goes to the copy, which closes it.
            void startLegacyHistoryImport(session);
            setAsking(false);
          }}
        />
      </Sheet>
    </SettingBlock>
  );
}

/**
 * The e-mail and password of the v2 account, in a panel of "Settings": once they open a session,
 * `onSession` takes it (and closes it once done). Shared by the history's copy and the freeze
 * (LegacyFreezeSetting.tsx); `testIDPrefix` names its parts.
 */
export function LegacyPasswordForm({
  lead,
  submitLabel,
  testIDPrefix,
  onSession
}: {
  lead: string;
  submitLabel: string;
  testIDPrefix: string;
  onSession: (session: LegacySession) => void;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [checking, setChecking] = useState(false);
  const [failure, setFailure] = useState<PasswordFailure | null>(null);
  // A ref: a double tap must not log in twice before the re-render.
  const running = useRef(false);
  const stop = passwordStopped();

  const submit = async () => {
    if (running.current || stop || email.trim() === "" || password === "") return;
    running.current = true;
    setChecking(true);
    setFailure(null);
    try {
      const opened = await openLegacySession(email, password);
      if (!opened.ok) {
        setFailure(opened.failure);
        return;
      }
      // Forgotten as soon as it served.
      setPassword("");
      onSession(opened.session);
    } finally {
      running.current = false;
      setChecking(false);
    }
  };

  if (stop) {
    return (
      <Text style={styles.text} testID={`${testIDPrefix}-stopped`}>
        {t(
          stop === "secondFactor"
            ? "migration.history.errors.secondFactor"
            : "migration.history.errors.stopped"
        )}
      </Text>
    );
  }
  return (
    <View style={styles.form}>
      <Text style={styles.text}>{lead}</Text>
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
        testID={`${testIDPrefix}-email`}
      />
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
            : failure === "secondFactor"
              ? t("migration.history.errors.secondFactor")
              : failure === "unreachable"
                ? t("migration.history.errors.unreachable")
                : null
        }
        testID={`${testIDPrefix}-password`}
      />
      <Button
        icon="arrow-right"
        onPress={() => void submit()}
        loading={checking}
        disabled={email.trim() === "" || password === ""}
        testID={`${testIDPrefix}-submit`}
      >
        {submitLabel}
      </Button>
      <Text style={styles.note}>{t("migration.history.note")}</Text>
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  row: { flexDirection: "row" },
  form: { gap: 14 },
  text: {
    ...sans(500),
    fontSize: type.prose,
    lineHeight: type.prose * 1.45,
    color: colors.text.primary
  },
  note: {
    ...sans(500),
    fontSize: type.caption,
    lineHeight: type.caption * 1.5,
    color: colors.text.secondary
  }
}));
