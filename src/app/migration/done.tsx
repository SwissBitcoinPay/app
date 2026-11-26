import { Redirect, useRouter, type Href } from "expo-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { ScreenTitle } from "@/components/ui/Heading";
import { getAccountSettings, getAccountWalletId } from "@/features/account/session";
import { isAccountWalletOpen, useAccountWallet } from "@/features/account/wallet-access";
import {
  accountStep,
  freezeStep,
  historyStep,
  walletStep,
  type LegacyWordsSkip
} from "@/features/migration/end-steps";
import {
  endMigration,
  getMigration,
  migrationCreated,
  migrationHoldsDeviceWallet
} from "@/features/migration/flow";
import { useHistoryImport } from "@/features/migration/history-import";
import {
  LegacyTransferSheet,
  type LegacyTransferChoice
} from "@/features/migration/LegacyTransferSheet";
import { MigrationFrame } from "@/features/migration/MigrationFrame";
import { MigrationTimeline, type TimelineStep } from "@/features/migration/MigrationTimeline";
import { useLegacyFreeze } from "@/features/migration/useLegacyFreeze";
import { eraseLegacyWallet } from "@/features/migration/transfer";
import {
  useLegacyTransfer,
  useMigrationAmount,
  useMigrationSats
} from "@/features/migration/useLegacyTransfer";
import {
  legacyWordsNeeded,
  listedWalletBalance,
  type WordsNeeded
} from "@/features/migration/words-needed";
import { getDeviceLocale } from "@/lib/locale/device";
import { logFailure } from "@/lib/log/log";
import type { MerchantSettings } from "@/lib/settings/merchant";
import { makeStyles, proseLineHeight, sans, type } from "@/theme";

/**
 * "Your account is up to date": the end of a v2 owner's migration. The business is ready; the v2
 * account is frozen, its money to come to the new account (useLegacyFreeze), then its history
 * copied; the v2 wallet, when this device holds its words, is offered for transfer at once
 * (LegacyTransferSheet.tsx): "Move" asks the device's biometrics (the v2 app put them on its words)
 * and moves its money to the account's wallet, after which its words are erased from the phone
 * (transfer.ts); "Don't move", confirmed, erases them without a transfer. The screen says where it
 * stands. Without the words on this device (or words of another v2 account than the one migrated:
 * "This is not my account"), or when it cannot open them, its owner may type them
 * ("Type my 12 words"); then what is left for the owner to do, which only they can (their
 * employees, their online shop: two buttons, their labels on several lines; the cards are
 * "Cards"'s), and "What changes". "Start accepting payments" opens the point of sale.
 *
 * The steps one under the other (MigrationTimeline, end-steps.tsx), titled "Updating your
 * account" while one runs. Nothing to press while a step runs (a business's history copies in a
 * few seconds): neither what is left to do, nor "Start accepting payments", nor a step's "Try
 * again" or "Type my 12 words";
 * only where each step stands. Every step ends on its own (each call has its timeout), in success
 * or failure, and then everything shows, under "Your account is up to date".
 *
 * Only at the end of a migration on this device: opened otherwise, it leads to the launch screen.
 */
export default function MigrationDoneScreen() {
  const [migration] = useState(getMigration);
  const settings = getAccountSettings();
  // The account the migration created only: never another opened since.
  if (!migration || !migrationCreated(getAccountWalletId()) || settings?.signUp !== "done") {
    return <Redirect href="/" />;
  }
  return <Done settings={settings} />;
}

function Done({ settings }: { settings: MerchantSettings }) {
  // The words the v2 app left here, of the v2 account migrated (flow.ts): read once.
  const [hasWallet] = useState(migrationHoldsDeviceWallet);
  const { t } = useTranslation();
  const styles = useStyles();
  const router = useRouter();
  const wallet = useAccountWallet();
  const { state, start } = useLegacyTransfer(async () => {
    await wallet.open();
    return isAccountWalletOpen();
  });
  const amount = useMigrationAmount(settings.displayCurrency);
  const sats = useMigrationSats(settings.displayCurrency);
  // The v2 account frozen first, with the session that read it; then its history follows, in the
  // background, with that session (history-import.ts). Without one, the relays only say it is to be
  // copied: "Settings" offers to, the v2 password asked then. This device keeps it owed until
  // the relays say so.
  const { freeze, historyCopy, retry, release } = useLegacyFreeze();
  const history = useHistoryImport();
  const [languageTag] = useState(() => getDeviceLocale().languageTag);
  // Without the words on this device: whether they would move money (words-needed.ts), once.
  const [wordsNeeded, setWordsNeeded] = useState<WordsNeeded | null>(
    hasWallet ? { status: "none" } : null
  );
  useEffect(() => {
    if (hasWallet) return;
    let live = true;
    void legacyWordsNeeded().then(
      (needed) => {
        if (live) setWordsNeeded(needed);
      },
      // Never rejects; were it to, a wallet not proven empty: its words asked, the screen never
      // left waiting.
      (error: unknown) => {
        logFailure("Checking the v2 wallet's words failed", error);
        if (live) setWordsNeeded({ status: "unknown" });
      }
    );
    return () => {
      live = false;
    };
  }, [hasWallet]);

  // The offer of the v2 wallet's transfer, with what it holds by the v2 server's index (undefined
  // while read: the panel waits for it; null when not proven, none said).
  const [choice, setChoice] = useState<LegacyTransferChoice | null>(hasWallet ? "offer" : null);
  const [balance, setBalance] = useState<bigint | null | undefined>(hasWallet ? undefined : null);
  useEffect(() => {
    if (!hasWallet) return;
    let live = true;
    void listedWalletBalance().then((sats) => {
      if (live) setBalance(sats);
    });
    return () => {
      live = false;
    };
  }, [hasWallet]);
  const [skipped, setSkipped] = useState<LegacyWordsSkip | null>(null);
  // Once at a time: the dialog waits meanwhile (`erasing`), its buttons disabled.
  const erase = () => {
    if (skipped === "erasing") return;
    setSkipped("erasing");
    void eraseLegacyWallet().then((gone) => {
      setSkipped(gone ? "erased" : "failed");
      setChoice(null);
    });
  };

  const go = (href: Href) => router.push(href);
  const finish = () => {
    release();
    endMigration();
    router.dismissTo("/");
    router.replace("/pos");
  };
  // Every step ended (see above): the freeze, the history it hands on, the check of the v2 wallet,
  // its transfer (started as the screen opens when this device holds its words).
  const settled =
    freeze.phase !== "running" &&
    historyCopy !== "running" &&
    history.phase !== "running" &&
    wordsNeeded !== null &&
    state.phase !== "running" &&
    !(hasWallet && state.phase === "idle" && skipped !== "erased" && skipped !== "failed");

  const steps: TimelineStep[] = [
    accountStep(t, settings.businessName),
    freezeStep(t, freeze, settled ? retry : undefined),
    historyStep(t, history, { copy: historyCopy, languageTag })
  ];
  // The v2 wallet: its transfer also once the words typed moved the money (useLegacyTransfer: the
  // words' screen's outcome); without its words on this device (another phone, the web app, the v2
  // app logged out), whether a wallet the v2 app created holds money (or could not be proven empty).
  const walletLine = walletStep(
    t,
    { state, wordsNeeded, showTransfer: hasWallet || state.phase !== "idle", skipped, amount },
    settled ? { retry: start, typeWords: () => go("/migration/words"), eraseAgain: erase } : {}
  );
  if (walletLine) steps.push(walletLine);

  return (
    <MigrationFrame testID="migration-done">
      <View style={styles.header}>
        <ScreenTitle>
          {t(settled ? "migration.done.title" : "migration.done.titleRunning")}
        </ScreenTitle>
        {settled ? null : <Text style={styles.lead}>{t("migration.done.lead")}</Text>}
      </View>
      <MigrationTimeline steps={steps} testID="migration-done-steps" />
      {settled ? <Next go={go} finish={finish} /> : null}
      <LegacyTransferSheet
        choice={balance === undefined ? null : choice}
        amount={balance ? sats(balance) : null}
        erasing={skipped === "erasing"}
        onTransfer={() => {
          setChoice(null);
          start();
        }}
        onSkip={() => setChoice("confirmSkip")}
        onBack={() => setChoice("offer")}
        onErase={erase}
      />
    </MigrationFrame>
  );
}

/** What is left to do, "What changes" and "Start accepting payments": once every step ended. */
function Next({ go, finish }: { go: (href: Href) => void; finish: () => void }) {
  const { t } = useTranslation();
  const styles = useStyles();
  return (
    <>
      <View style={styles.todo} testID="migration-done-next">
        <Text style={styles.heading} accessibilityRole="header">
          {t("migration.done.todoTitle")}
        </Text>
        <Button
          variant="secondary"
          size="sm"
          icon="user-plus"
          wrap
          onPress={() => go("/employees")}
          testID="migration-todo-employees"
        >
          {t("migration.done.employees")}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          icon="link"
          wrap
          onPress={() => go("/integrations")}
          testID="migration-todo-shop"
        >
          {t("migration.done.shop")}
        </Button>
        <Button
          variant="text"
          size="md"
          onPress={() => go("/migration/changes")}
          testID="migration-changes-open"
        >
          {t("migration.done.changes")}
        </Button>
      </View>
      <Button icon="store" onPress={finish} testID="migration-finish">
        {t("common.startCharging")}
      </Button>
    </>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  header: { gap: 6 },
  lead: {
    ...sans(500),
    fontSize: type.prose,
    lineHeight: proseLineHeight,
    color: colors.text.secondary
  },
  todo: { gap: 10, marginTop: 6 },
  heading: {
    ...sans(700),
    fontSize: type.body,
    color: colors.text.primary
  }
}));
