import { useIsFocused } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Platform, Text, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { Lead, ScreenTitle } from "@/components/ui/Heading";
import { TextField } from "@/components/ui/TextField";
import { WaitingIndicator } from "@/components/ui/WaitingIndicator";
import { AccountError } from "@/features/account/session";
import { shieldScreen, unshieldScreen } from "@/features/settings/screen-shield";
import { WalletError } from "@/lib/breez/errors";
import { holdActivity } from "@/lib/activity";
import { logFailure } from "@/lib/log/log";
import { makeStyles, sans, type } from "@/theme";

import {
  RECOVERY_WORD_COUNT,
  openRescue,
  readRecoveryWords,
  wordsProblem,
  type RescueOpening
} from "./rescue";

/**
 * The words of "Open with my 12 words" (one field, as "Your old wallet" takes the v2 wallet's
 * words,
 * src/app/migration/words.tsx, rather than a grid of 12). Screen capture is blocked while
 * it shows (screen-shield.ts; the web cannot), the keyboard is asked not to learn them. They are
 * counted as they are typed; what is wrong with 12 words is said once 12 are there. Once they open
 * the account (or its wallet alone), the field forgets them: the account holds the seed (session.ts),
 * nothing else. Whether a word is typed is told (`onTyping`): from then, RescueScreen closes the
 * rescue after a while without activity, `idleClosed` then (said until a word is typed again).
 */
export function RescueWords({
  idleClosed,
  onTyping,
  onOpened
}: {
  idleClosed: boolean;
  onTyping: (typing: boolean) => void;
  onOpened: (opening: RescueOpening) => void;
}) {
  const { t } = useTranslation();
  const styles = useStyles();
  const focused = useIsFocused();
  const [typed, setTyped] = useState("");
  const [opening, setOpening] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  // A ref: a double tap must not open twice before the re-render.
  const running = useRef(false);

  const typing = typed !== "";
  const latestOnTyping = useRef(onTyping);
  useEffect(() => {
    latestOnTyping.current = onTyping;
  });
  useEffect(() => {
    latestOnTyping.current(typing);
  }, [typing]);

  useEffect(() => {
    if (!focused) return;
    void shieldScreen();
    return () => {
      void unshieldScreen();
    };
  }, [focused]);

  const words = readRecoveryWords(typed);
  const problem = wordsProblem(words);
  // Fewer than 12 words: still being typed, counted; from 12 on, what is wrong, or that they hold.
  const status =
    problem?.code === "count" && problem.count < RECOVERY_WORD_COUNT ? (
      problem.count === 0 ? null : (
        <Text style={styles.count} testID="rescue-words-count">
          {t("rescue.words.count", { count: problem.count })}
        </Text>
      )
    ) : problem ? (
      <ErrorMessage testID="rescue-words-problem">
        {problem.code === "count"
          ? t("rescue.words.count", { count: problem.count })
          : problem.code === "unknown"
            ? t("rescue.words.unknown", { position: problem.position })
            : t("rescue.words.checksum")}
      </ErrorMessage>
    ) : (
      <Text style={styles.valid} testID="rescue-words-valid">
        {t("rescue.words.valid")}
      </Text>
    );

  const submit = async () => {
    if (running.current || problem !== null) return;
    running.current = true;
    setFailure(null);
    setOpening(true);
    // The user waits on the app: no time without activity counts until the words opened it.
    const release = holdActivity();
    try {
      const opened = await openRescue(words, t("merchantSettings.businessNameWord"));
      // Forgotten as soon as they opened it.
      setTyped("");
      onOpened(opened);
    } catch (error) {
      logFailure("Opening the account with its words failed", error);
      setFailure(
        error instanceof AccountError && error.code === "settingsTooNew"
          ? t("account.errors.settingsTooNew")
          : error instanceof WalletError && error.code === "notConfigured"
            ? t("account.errors.notConfigured")
            : t("rescue.words.failed")
      );
    } finally {
      release();
      running.current = false;
      setOpening(false);
    }
  };

  return (
    <View style={styles.section} testID="rescue-words">
      <ScreenTitle>{t("rescue.words.title")}</ScreenTitle>
      <Lead>{t("rescue.words.lead")}</Lead>
      {idleClosed && !typing ? (
        <Callout tone="warning" testID="rescue-idle-closed">
          {t("rescue.idle.closed")}
        </Callout>
      ) : null}
      <Callout tone="warning" testID="rescue-words-only">
        {t("rescue.words.only")}
      </Callout>
      {opening ? (
        <View style={styles.waiting}>
          <WaitingIndicator label={t("rescue.words.opening")} />
        </View>
      ) : (
        <>
          <TextField
            label={t("rescue.words.label")}
            value={typed}
            onChangeText={(text) => {
              setFailure(null);
              setTyped(text);
            }}
            multiline={4}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            // Android's keyboards learn and suggest what is typed, but in a password's field.
            keyboardType={Platform.OS === "android" ? "visible-password" : "default"}
            testID="rescue-words-field"
          />
          {status}
          {failure ? <ErrorMessage testID="rescue-words-failed">{failure}</ErrorMessage> : null}
          <Button
            icon="arrow-right"
            onPress={() => void submit()}
            disabled={problem !== null}
            testID="rescue-words-submit"
          >
            {t("rescue.words.submit")}
          </Button>
        </>
      )}
      <Text style={styles.note}>{t("rescue.words.note")}</Text>
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  section: { gap: 16 },
  waiting: { paddingVertical: 12 },
  count: { ...sans(500), fontSize: type.caption, color: colors.text.secondary },
  valid: { ...sans(600), fontSize: type.caption, color: colors.success.fg },
  note: {
    ...sans(500),
    fontSize: type.caption,
    lineHeight: type.caption * 1.5,
    color: colors.text.secondary,
    textAlign: "center"
  }
}));
