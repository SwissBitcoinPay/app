import { Redirect, useLocalSearchParams } from "expo-router";
import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { Lead, ScreenTitle } from "@/components/ui/Heading";
import { Icon } from "@/components/ui/Icon";
import { WaitingIndicator } from "@/components/ui/WaitingIndicator";
import { accountFailureMessage } from "@/features/account/usePasskeyAccount";
import {
  currentPlan,
  forgetLegacyAccount,
  getMigration,
  legacyAccountCopy,
  legacySessionPending,
  legacySessionUnreachable,
  migrationEmail,
  readLegacyAccount,
  readLegacySessionOnce,
  resumeMigration,
  retryLegacySession
} from "@/features/migration/flow";
import { LegacyPasswordForm } from "@/features/migration/LegacyPasswordForm";
import { useLegacyState } from "@/features/migration/legacy-state";
import { MigrationAccountCard } from "@/features/migration/MigrationAccountCard";
import { MigrationBadge } from "@/features/migration/MigrationBadge";
import { MigrationFrame } from "@/features/migration/MigrationFrame";
import { migrationProgressKey } from "@/features/migration/progress";
import { useMigrationAccount } from "@/features/migration/useMigrationAccount";
import { useTerminalProfile } from "@/features/terminal/profile-cache";
import { formatDate } from "@/lib/locale/date";
import { getDeviceLocale } from "@/lib/locale/device";
import type { LegacyState } from "@/lib/legacy-v2/store";
import { makeStyles, sans, type, useTheme } from "@/theme";

/**
 * The first screen of a device the v2 app's owner used, in place of the welcome screen: its
 * account's card at once, and one button, "Migrate". Composed of the app's pieces.
 *
 * What the v2 app left (its copy of the account: the business, its e-mail, its currency) shows as
 * the screen opens; the v2 account is read on the v2 server with the v2 app's session meanwhile,
 * without a tap (flow.ts, readLegacySessionOnce), and its payouts join the card: the split, the bank
 * account. "Migrate" then asks for the passkey at once, which creates the account with them: one
 * tap, which a browser (Safari) requires right before a passkey, nothing awaited in between. When
 * the session no longer serves, or nothing of the v2 app is on the device, the password reads the
 * account on this very screen (LegacyPasswordForm), then "Migrate". "This is not my account"
 * forgets the account shown and asks the e-mail and password of another. A v2 account migrated
 * before (on another device) is said, and its passkey opens the account: a second account is never
 * created.
 *
 * Only for such a device: opened otherwise (a link), it leads to the launch screen. A till's device
 * comes here when its user says they are the business's owner (`owner`, employee.tsx: an owner who
 * had logged in as a till). The welcome screen's "Migrate my Swiss Bitcoin Pay account" (`manual`)
 * brings any other device here, the web app's included: nothing of the v2
 * app on it, the password reads the v2 account, and the v2 wallet's words are typed at the end
 * when the v2 server lists a wallet the v2 app created (done.tsx).
 */
export default function MigrationScreen() {
  const styles = useStyles();
  const { owner, manual } = useLocalSearchParams<{ owner?: string; manual?: string }>();
  const profile = useTerminalProfile({ follow: false });
  const legacy = useLegacyState(profile === null);
  // Read from the device's storage and keychain: an instant.
  if (profile === undefined || (profile === null && legacy === undefined)) {
    return <View style={styles.blank} />;
  }
  if (profile) return <Redirect href="/" />;
  // What the v2 app left on this device first: its session spares the password.
  if (!legacy) return manual === "1" ? <OwnerMigration legacy={MANUAL} /> : <Redirect href="/" />;
  if (legacy.role !== "owner" && owner !== "1") return <Redirect href="/" />;
  return <OwnerMigration legacy={legacy} />;
}

/** A migration without the v2 app on this device: its owner says who they are by the password. */
const MANUAL: LegacyState = { role: "owner", account: null, tokens: null, hasWallet: false };

/**
 * What the screen draws of the migration under way (flow.ts, module state): read again after each
 * of its steps (`sync`), never during a render, so that the screen shows what it last knew.
 */
function snapshot() {
  const account = readLegacyAccount();
  return {
    // `reading`: the v2 app's session reads the account; `password`: the password must.
    phase: account
      ? ("read" as const)
      : legacySessionPending()
        ? ("reading" as const)
        : ("password" as const),
    account,
    copy: legacyAccountCopy(),
    plan: account ? currentPlan() : null,
    notMine: getMigration()?.notMine ?? false,
    // The session's read ended without the v2 server's answer: it may still serve.
    unreachable: legacySessionUnreachable(),
    // The e-mail the password goes with ("Forgot your password?" may have changed it).
    email: migrationEmail()
  };
}

function OwnerMigration({ legacy }: { legacy: LegacyState }) {
  const { t } = useTranslation();
  const styles = useStyles();
  const passkey = useMigrationAccount();
  const [view, setView] = useState(() => {
    resumeMigration(legacy);
    return snapshot();
  });
  const sync = () => setView(snapshot());
  const { phase, account, copy, plan } = view;
  const patch = plan?.patch ?? null;
  const busy = passkey.progress !== null;

  // The v2 app's session reads the account as the card shows, without a tap: its owner sees their
  // account at once, and "Migrate" asks for the passkey right away.
  const reading = phase === "reading";
  useEffect(() => {
    if (!reading) return;
    let active = true;
    void readLegacySessionOnce().then(() => {
      if (active) setView(snapshot());
    });
    return () => {
      active = false;
    };
  }, [reading]);

  // The account exists already (its point of sale's preparation failed): its passkey opens it, as
  // "Log in" does; never a second account.
  const migrate = () => (getMigration()?.createdWalletId ? passkey.logIn() : passkey.create());

  const notMine = () => {
    forgetLegacyAccount();
    sync();
  };

  // The v2 server did not answer the session's read (offline, a timeout): asked again on a tap,
  // the password still possible meanwhile.
  const retrySession = () => {
    retryLegacySession();
    sync();
  };

  const status = passkey.progress ? (
    <WaitingIndicator label={t(migrationProgressKey(passkey.progress))} />
  ) : passkey.failure ? (
    <ErrorMessage testID="migration-failure">
      {accountFailureMessage(passkey.failure, t)}
    </ErrorMessage>
  ) : null;

  const name = patch?.businessName ?? account?.name ?? copy?.name ?? null;
  const email = account?.email ?? copy?.email ?? null;

  if (account && account.migratedAt !== null) {
    return (
      <Migrated
        business={name ?? email ?? ""}
        migratedAt={account.migratedAt}
        status={status}
        busy={busy}
        onLogIn={passkey.logIn}
        onNotMine={notMine}
      />
    );
  }

  const known = account !== null || copy !== null;
  const title = name
    ? t("migration.home.title", { business: name })
    : known
      ? t("migration.home.titleUnnamed")
      : t("migration.home.titleManual");
  const lead =
    phase === "password"
      ? t(known ? "migration.home.leadPassword" : "migration.home.leadManual")
      : t("migration.home.leadFound");

  return (
    <MigrationFrame testID="migration-home">
      <MigrationBadge />
      <ScreenTitle>{title}</ScreenTitle>
      <Lead>{lead}</Lead>
      {known ? (
        <MigrationAccountCard
          name={name}
          email={email}
          currency={copy?.currency ?? null}
          payouts={
            plan ? { kind: "read", plan } : { kind: phase === "reading" ? "reading" : "password" }
          }
          footer={
            <>
              {patch ? (
                <Check testID="migration-home-read">{t("migration.home.read")}</Check>
              ) : null}
              {legacy.hasWallet && !view.notMine ? (
                <Check testID="migration-home-money">{t("migration.home.money")}</Check>
              ) : null}
            </>
          }
        />
      ) : null}
      {phase === "password" ? (
        <>
          {view.unreachable ? (
            <>
              <Callout tone="warning" testID="migration-session-unreachable">
                {t("migration.login.errors.unreachable")}
              </Callout>
              <Button
                variant="secondary"
                icon="arrows-rotate"
                onPress={retrySession}
                testID="migration-session-retry"
              >
                {t("migration.home.retry")}
              </Button>
            </>
          ) : null}
          {/* Drawn again for another account: its e-mail asked, nothing kept of the one before.
              The e-mail is the card's only when the password goes with that very address. */}
          <LegacyPasswordForm
            key={copy ? "copy" : "other"}
            emailKnown={copy?.email != null && view.email === copy.email}
            onRead={sync}
          />
        </>
      ) : (
        <>
          {patch ? (
            <Callout tone="warning" testID="migration-confirm-freeze">
              {t("migration.confirm.freeze")}
            </Callout>
          ) : null}
          {status}
          <Button
            icon="fingerprint"
            onPress={migrate}
            disabled={busy || patch === null}
            testID="migration-migrate"
          >
            {t("migration.home.migrate")}
          </Button>
        </>
      )}
      {/* Not while the session reads: the account it reads would join a migration said not its. */}
      {known && !reading ? (
        <Button
          variant="text"
          size="md"
          onPress={notMine}
          disabled={busy}
          testID="migration-confirm-other"
        >
          {t("migration.confirm.notMine")}
        </Button>
      ) : null}
      {phase === "password" ? null : <Text style={styles.note}>{t("account.passkeyWarning")}</Text>}
    </MigrationFrame>
  );
}

/** A line under the card, its green tick before it: what is proven of the account. */
function Check({ children, testID }: { children: string; testID: string }) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.check} testID={testID}>
      <Icon name="check" size={14} color={colors.state.settled.dot} />
      <Text style={styles.checkText}>{children}</Text>
    </View>
  );
}

/**
 * A v2 account migrated before (on another device: `migratedAt`), never migrated again: its passkey
 * opens the sattle.me account instead ("Log in"), so that a second account is never created.
 */
function Migrated({
  business,
  migratedAt,
  status,
  busy,
  onLogIn,
  onNotMine
}: {
  business: string;
  migratedAt: number;
  status: ReactNode;
  busy: boolean;
  onLogIn: () => void;
  onNotMine: () => void;
}) {
  const { t } = useTranslation();
  const [languageTag] = useState(() => getDeviceLocale().languageTag);
  const day = formatDate(new Date(migratedAt * 1000), languageTag, {
    day: "numeric",
    month: "long",
    year: "numeric"
  });
  return (
    <MigrationFrame testID="migration-home">
      <ScreenTitle>{t("migration.confirm.migratedTitle")}</ScreenTitle>
      <Callout tone="warning" testID="migration-confirm-migrated">
        {t("migration.confirm.migrated", { business, date: day })}
      </Callout>
      {status}
      <Button icon="fingerprint" onPress={onLogIn} disabled={busy} testID="migration-confirm-login">
        {t("migration.confirm.logIn")}
      </Button>
      <Button
        variant="text"
        size="md"
        onPress={onNotMine}
        disabled={busy}
        testID="migration-confirm-other"
      >
        {t("migration.confirm.notMine")}
      </Button>
    </MigrationFrame>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  blank: { flex: 1, backgroundColor: colors.background.app },
  check: { flexDirection: "row", alignItems: "center", gap: 6 },
  checkText: {
    ...sans(500),
    flexShrink: 1,
    fontSize: type.caption,
    lineHeight: type.caption * 1.5,
    color: colors.state.settled.fg
  },
  note: {
    ...sans(500),
    fontSize: type.caption,
    lineHeight: type.caption * 1.5,
    color: colors.text.secondary,
    textAlign: "center"
  }
}));
