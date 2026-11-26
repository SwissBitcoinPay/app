import { Redirect, useIsFocused, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Platform, Text, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Lead, ScreenTitle } from "@/components/ui/Heading";
import { TextField } from "@/components/ui/TextField";
import { hasMainWallet } from "@/features/account/main-wallet";
import { getAccountSettings, getAccountWalletId } from "@/features/account/session";
import { isAccountWalletOpen, useAccountWallet } from "@/features/account/wallet-access";
import { MigrationFrame } from "@/features/migration/MigrationFrame";
import { TransferStatus } from "@/features/migration/TransferStatus";
import { useLegacyTransfer, useMigrationAmount } from "@/features/migration/useLegacyTransfer";
import { shieldScreen, unshieldScreen } from "@/features/settings/screen-shield";
import { makeStyles, sans, type } from "@/theme";

/**
 * "Your old wallet": the v2 wallet's money moved with the 12 words its owner noted when the v2
 * app created it, where this device does not hold them (another phone, the web app, the v2 app
 * logged out) or cannot open them (biometrics enrolled since). Opened from "Your account is up to
 * date", from a transfer the phone could not do, and from "Wallet"'s notice.
 *
 * The words are checked before anything connects (12 English BIP-39 words, their checksum), then
 * forgotten: the field empties as the transfer starts, transfer.ts empties its copy. Screen capture
 * is blocked while the screen shows (screen-shield.ts: the words typed show as a recovery phrase
 * does; the web cannot). The keyboard is asked not to learn them (no correction, no suggestion).
 *
 * Only for an open account with a wallet of its own (a merchant's): otherwise, the launch screen.
 */
export default function MigrationWordsScreen() {
  const [allowed] = useState(() => getAccountWalletId() !== null && hasMainWallet());
  const settings = getAccountSettings();
  if (!allowed || !settings) return <Redirect href="/" />;
  return <TypedWords currency={settings.displayCurrency} />;
}

function TypedWords({ currency }: { currency: string }) {
  const { t } = useTranslation();
  const styles = useStyles();
  const router = useRouter();
  const focused = useIsFocused();
  const wallet = useAccountWallet();
  const { state, startTyped } = useLegacyTransfer(async () => {
    await wallet.open();
    return isAccountWalletOpen();
  });
  const amount = useMigrationAmount(currency);
  const [typed, setTyped] = useState("");

  useEffect(() => {
    if (!focused) return;
    void shieldScreen();
    return () => {
      void unshieldScreen();
    };
  }, [focused]);

  const back = () => (router.canGoBack() ? router.back() : router.replace("/"));
  const submit = () => {
    // Forgotten as soon as they are taken; kept to be corrected otherwise.
    if (startTyped(typed)) setTyped("");
  };
  const running = state.phase === "running";
  // A transfer that did not move the money (the network, the explorer) is typed again.
  const finished = state.phase === "done" && state.outcome.status !== "failed";

  return (
    <MigrationFrame testID="migration-words">
      <ScreenTitle>{t("migration.words.title")}</ScreenTitle>
      <Lead>{t("migration.words.lead")}</Lead>
      <Callout tone="warning" testID="migration-words-only">
        {t("migration.words.only")}
      </Callout>
      {finished || running ? null : (
        <TextField
          label={t("migration.words.label")}
          value={typed}
          onChangeText={setTyped}
          multiline={4}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          // Android's keyboards learn and suggest what is typed, but in a password's field.
          keyboardType={Platform.OS === "android" ? "visible-password" : "default"}
          error={
            state.phase !== "invalid"
              ? null
              : t(
                  state.reason === "words"
                    ? "migration.words.invalid"
                    : state.reason === "mismatch"
                      ? "migration.words.mismatch"
                      : "migration.words.unused"
                )
          }
          testID="migration-words-field"
        />
      )}
      <TransferStatus state={state} amount={amount} />
      {finished ? (
        <Button icon="check" onPress={back} testID="migration-words-done">
          {t("migration.words.done")}
        </Button>
      ) : (
        <View style={styles.actions}>
          <Button
            icon="arrow-right"
            onPress={submit}
            disabled={running || typed.trim() === ""}
            testID="migration-words-submit"
          >
            {t("migration.words.submit")}
          </Button>
          <Button
            variant="text"
            size="md"
            onPress={back}
            disabled={running}
            testID="migration-words-back"
          >
            {t("common.back")}
          </Button>
        </View>
      )}
      <Text style={styles.note}>{t("migration.words.note")}</Text>
    </MigrationFrame>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  actions: { gap: 10 },
  note: {
    ...sans(500),
    fontSize: type.caption,
    lineHeight: type.caption * 1.5,
    color: colors.text.secondary,
    textAlign: "center"
  }
}));
