import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Lead } from "@/components/ui/Heading";
import type { AccountMtpAccess } from "@/features/sell/account-flow";
import { sellFailureKind, type SellFailureKind } from "@/features/sell/flow";
import { PoweredByMtPelerin } from "@/features/sell/MtPelerinLogo";
import { Card } from "@/features/sell/parts";
import { Item } from "@/features/sell/SetupPage";
import { bankAccountInputOf, type BankDetails } from "@/features/bank/bank-details";
import { payoutAccounts, type PayoutAccounts } from "@/features/settings/payout-accounts";
import { logFailure } from "@/lib/log/log";
import { isSellCurrency } from "@/lib/mtpelerin/sale";
import { makeStyles } from "@/theme";

import { MtpLoginSheet, type MtpLoginIntent } from "./MtpLoginSheet";

/*
 * Mt Pelerin before the bank details of an account becoming a merchant's: the sign-up's bank step
 * (src/app/onboarding/bank.tsx) and "Create my merchant
 * profile"'s (PayoutScreens.tsx). The share sold goes through Mt Pelerin, which wires it to the
 * bank account registered there: the screen first says so (MtpIntro, Mt Pelerin named once, as
 * sattle.me's partner) and asks for the login, by its two buttons and "Powered by"
 * (MtpLoginActions), in a panel (MtpLoginSheet); logged in (or already, a screen opened again), the
 * bank details. The account is registered at Mt Pelerin before the settings are saved
 * (registerAtMtPelerin): refused, unanswered or the session lost, nothing is saved.
 */

/** Whether the account holds a Mt Pelerin session: read, then told by the login. */
export type MtpConnection = "checking" | "signedOut" | "signedIn";

export type MtpGate = {
  connection: MtpConnection;
  /** The account's Mt Pelerin bank accounts, made again after each login (an older one holds no token). */
  accounts: PayoutAccounts;
  /** Bumped with `accounts`: a screen that reads them keys on it. */
  generation: number;
  /** The session was refused meanwhile: the explanation says so. */
  sessionLost: boolean;
  /** The login's panel, opened by the button of `intent` (MtpLoginActions). */
  openLogin(intent: MtpLoginIntent): void;
  /** Mt Pelerin refused the session (`notConnected`): back to the login. */
  lost(): void;
  /** The login's panel, rendered by the screen. */
  sheet: ReactNode;
};

/** The gate over `access` (null: no Mt Pelerin for this account); `enabled`: a fiat share chosen. */
export function useMtpGate(access: AccountMtpAccess | null, enabled: boolean): MtpGate | null {
  const [accounts, setAccounts] = useState(() => (access ? payoutAccounts(access) : null));
  const [generation, setGeneration] = useState(0);
  const [connection, setConnection] = useState<MtpConnection>("checking");
  const [sessionLost, setSessionLost] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  // Kept once closed: the panel says it while it slides out.
  const [intent, setIntent] = useState<MtpLoginIntent>("create");

  useEffect(() => {
    if (!accounts || !enabled) return;
    let live = true;
    accounts.connected().then(
      (connected) => {
        if (live) setConnection(connected ? "signedIn" : "signedOut");
      },
      (error: unknown) => {
        logFailure("Reading the Mt Pelerin session failed", error);
        if (live) setConnection("signedOut");
      }
    );
    return () => {
      live = false;
    };
  }, [accounts, enabled]);

  const signedIn = useCallback(() => {
    setLoginOpen(false);
    setSessionLost(false);
    setConnection("signedIn");
    if (access) setAccounts(payoutAccounts(access));
    setGeneration((count) => count + 1);
  }, [access]);

  if (!access || !accounts) return null;
  return {
    connection,
    accounts,
    generation,
    sessionLost,
    openLogin: (opened) => {
      setIntent(opened);
      setLoginOpen(true);
    },
    lost: () => {
      setSessionLost(true);
      setConnection("signedOut");
      setAccounts(payoutAccounts(access));
      setGeneration((count) => count + 1);
    },
    sheet: (
      <MtpLoginSheet
        access={access}
        visible={loginOpen}
        onClose={() => setLoginOpen(false)}
        onSignedIn={signedIn}
        intent={intent}
      />
    )
  };
}

/**
 * What the screen says before the login, in place of the bank details: why Mt Pelerin, what its
 * login asks (the number and an SMS code in the production app; the account's key on Mt Pelerin's
 * dev/test, in the staging app), that the bank account is registered there, and that nothing is
 * sold without the merchant.
 */
export function MtpIntro({ gate, environment }: { gate: MtpGate; environment: string }) {
  const styles = useStyles();
  const { t } = useTranslation();
  return (
    <>
      <Lead style={styles.lead}>{t("bank.mtPelerin.lead")}</Lead>
      {gate.sessionLost ? (
        <View style={styles.block}>
          <Callout tone="warning">{t("sell.sessionLost")}</Callout>
        </View>
      ) : null}
      <View style={styles.block}>
        <Card testID="mtpelerin-intro">
          <Item
            icon="mobile-screen-button"
            title={t("bank.mtPelerin.accountTitle")}
            sub={t(
              environment === "production"
                ? "bank.mtPelerin.accountSms"
                : "bank.mtPelerin.accountKey"
            )}
          />
          <Item
            icon="landmark"
            title={t("bank.mtPelerin.bankTitle")}
            sub={t("bank.mtPelerin.bankSub")}
          />
          <Item
            icon="fingerprint"
            title={t("bank.mtPelerin.saleTitle")}
            sub={t("bank.mtPelerin.saleSub")}
          />
        </Card>
      </View>
    </>
  );
}

/**
 * The intro's buttons, the screen's footer: a new Mt Pelerin account, or the one the merchant has.
 * Both open the same login (MtpLoginSheet: an account at that number is resumed), each with its own
 * heading. Then "Powered by" and Mt Pelerin's logo, as under "Sell"'s panels.
 */
export function MtpLoginActions({ gate }: { gate: MtpGate }) {
  const styles = useStyles();
  const { t } = useTranslation();
  return (
    <View style={styles.actions}>
      <Button wrap onPress={() => gate.openLogin("create")} testID="mtpelerin-create">
        {t("bank.mtPelerin.create")}
      </Button>
      <Button
        variant="secondary"
        size="md"
        wrap
        onPress={() => gate.openLogin("existing")}
        testID="mtpelerin-existing"
      >
        {t("bank.mtPelerin.existing")}
      </Button>
      <View style={styles.poweredBy}>
        <PoweredByMtPelerin />
      </View>
    </View>
  );
}

/** Logged in: where the bank details go. */
export function MtpConnected() {
  const styles = useStyles();
  const { t } = useTranslation();
  return (
    <View style={styles.block}>
      <Callout tone="success" testID="mtpelerin-connected">
        {t("bank.mtPelerin.connected")}
      </Callout>
    </View>
  );
}

/** What registering the bank account at Mt Pelerin did. */
export type MtpRegistration =
  /**
   * Registered, or Mt Pelerin had it already (same IBAN and currency), its holder and address
   * changed there when they differed (payout-accounts.ts): `accountId`, Mt Pelerin's id of it, is
   * what the settings keep.
   */
  | { kind: "registered"; accountId: string }
  /** "Duplicate account": the IBAN is another profile's. */
  | { kind: "ibanTaken" }
  /** The session was refused: log in again. */
  | { kind: "lost" }
  | { kind: "failure"; failure: SellFailureKind };

/**
 * The account typed (`details`) registered at Mt Pelerin in `currency` (payout-accounts.ts), unless
 * it has it already; then its holder and address changed there when they differ.
 */
export async function registerAtMtPelerin(
  accounts: PayoutAccounts,
  details: BankDetails,
  currency: string
): Promise<MtpRegistration> {
  const input = isSellCurrency(currency) ? bankAccountInputOf(details, currency) : null;
  if (input === null || !isSellCurrency(currency)) {
    // Every payout currency is one Mt Pelerin wires (mtpelerin-sale.test.ts), and the forms are
    // complete before this: not expected.
    logFailure("The bank account cannot be registered at Mt Pelerin");
    return { kind: "failure", failure: "refused" };
  }
  try {
    const registration = await accounts.register({ ...input, currency });
    switch (registration.kind) {
      case "ibanTaken":
        return { kind: "ibanTaken" };
      case "notConnected":
        return { kind: "lost" };
      case "unchanged":
        // Had with another holder or address, and refused or kept there: the details typed are
        // not what each transfer would carry.
        return { kind: "failure", failure: "accountUnchanged" };
      default:
        return { kind: "registered", accountId: registration.accountId };
    }
  } catch (error) {
    logFailure("Registering the bank account at Mt Pelerin failed", error, false);
    return { kind: "failure", failure: sellFailureKind(error) };
  }
}

const useStyles = makeStyles(() => ({
  lead: { marginTop: 8 },
  block: { marginTop: 16 },
  actions: { gap: 10 },
  poweredBy: { marginTop: 4 }
}));
