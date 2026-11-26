import { Redirect } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, View } from "react-native";

import { isPayoutCurrency } from "@/config/payout-currencies";
import { StepScreen } from "@/components/layout/StepScreen";
import { useIsDesktop } from "@/components/layout/useIsDesktop";
import { Button } from "@/components/ui/Button";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { Lead, ScreenTitle } from "@/components/ui/Heading";
import { getAccountSettings } from "@/features/account/session";
import { BankDetailsFields } from "@/features/bank/BankDetailsFields";
import { bankDetailsComplete } from "@/features/bank/bank-details";
import {
  MtpConnected,
  MtpIntro,
  MtpLoginActions,
  registerAtMtPelerin,
  useMtpGate
} from "@/features/onboarding/mtp-gate";
import { hasFiatShare, useOnboarding } from "@/features/onboarding/state";
import { accountRoutes } from "@/features/onboarding/steps";
import { useFinishSignUp } from "@/features/onboarding/useFinishSignUp";
import { signUpMtpAccess } from "@/features/sell/account-flow";
import type { SellFailureKind } from "@/features/sell/flow";
import { Waiting } from "@/features/sell/parts";
import { formatPercent } from "@/lib/locale/format";

/**
 * The bank details step. Only reached from 1 % in fiat. The title repeats
 * the chosen share and currency, so the merchant knows why an IBAN is needed.
 *
 * The share sold goes through Mt Pelerin: its sale is made there
 * (src/lib/mtpelerin/), and the bank account it wires to is registered there. So, before the
 * bank details, the step says so and asks for the merchant's Mt Pelerin login, in a panel
 * (mtp-gate.tsx: "Create my Mt Pelerin account" or "I already have one", the same login: the
 * number and the SMS code, the account's key on dev/test, then the e-mail); an
 * account already logged in (a sign-up that resumes) goes to the details at once. "Start
 * accepting payments" registers the account at Mt Pelerin first (as "Settings › Bank account": one it
 * has already is not sent again, its holder and address changed there when typed otherwise), then
 * saves the settings with its id only, never its details: refused
 * there, nothing is saved. A
 * session refused meanwhile leads back to the login. Nothing is sold here: the app offers each sale
 * of the share, the merchant makes it (no automatic sale), after
 * "Sell" has proven the Lightning address by 1 sat.
 *
 * An IBAN is required whatever the currency and the country.
 * The country is the holder's country of residence, indicative only: it closes
 * the address instead of sitting next to the IBAN, so that it does not read as the bank's country.
 * No address complement nor transfer reference: Mt Pelerin takes neither, and
 * nothing of the account is kept by the app.
 * Its fields are BankDetailsFields, as everywhere bank details are typed: who holds the account,
 * a person or a company, asked first.
 */

/** What stopped "Start accepting payments" at Mt Pelerin (the field tells "Duplicate account"). */
type Refusal = { kind: "ibanTaken" } | { kind: "failure"; failure: SellFailureKind };

export default function BankScreen() {
  const { t } = useTranslation();
  const desktop = useIsDesktop();
  const { bitcoinPercent, payoutCurrency, detectedCountry, device, bank, updateBank } =
    useOnboarding();
  const { finish, saving, failed, errorKey } = useFinishSignUp();
  const hasFiat = hasFiatShare(bitcoinPercent);
  // A merchant's sign-up ("Create my account", or its split saved it so).
  const [access] = useState(signUpMtpAccess);
  const gate = useMtpGate(access, hasFiat);
  const [registering, setRegistering] = useState(false);
  const [refusal, setRefusal] = useState<Refusal | null>(null);

  if (!hasFiat) return <Redirect href="/onboarding/split" />;
  // Not a merchant's sign-up (a card holder's, opened by a link): where its account stands.
  if (!access || !gate) {
    const settings = getAccountSettings();
    return <Redirect href={(settings && accountRoutes(settings).at(-1)) || "/"} />;
  }

  const busy = registering || saving;
  const complete = bankDetailsComplete(bank);
  const currency = isPayoutCurrency(payoutCurrency)
    ? t(`currencies.${payoutCurrency}`)
    : // A currency removed from the payout currencies since: its code.
      payoutCurrency;

  /** The account registered at Mt Pelerin, then the sign-up finished (useFinishSignUp). */
  const submit = async () => {
    if (busy || !complete) return;
    setRefusal(null);
    setRegistering(true);
    const registration = await registerAtMtPelerin(gate.accounts, bank, payoutCurrency);
    setRegistering(false);
    switch (registration.kind) {
      case "registered":
        // Only its id is saved: its details are Mt Pelerin's.
        finish(registration.accountId);
        return;
      case "ibanTaken":
        setRefusal({ kind: "ibanTaken" });
        return;
      case "lost":
        gate.lost();
        return;
      case "failure":
        setRefusal({ kind: "failure", failure: registration.failure });
    }
  };

  const footer =
    gate.connection === "checking" ? null : gate.connection === "signedOut" ? (
      <MtpLoginActions gate={gate} />
    ) : (
      <>
        {refusal?.kind === "failure" ? (
          <ErrorMessage style={styles.error}>{t(`sell.failures.${refusal.failure}`)}</ErrorMessage>
        ) : failed ? (
          <ErrorMessage style={styles.error}>{t(errorKey)}</ErrorMessage>
        ) : null}
        <Button
          disabled={!complete}
          loading={busy}
          onPress={() => void submit()}
          testID="bank-submit"
        >
          {t("common.startCharging")}
        </Button>
      </>
    );

  return (
    <StepScreen footer={footer}>
      <ScreenTitle size={desktop ? undefined : 24}>
        {t("bank.title", {
          percent: formatPercent(100 - bitcoinPercent, device.languageTag),
          currency
        })}
      </ScreenTitle>

      {gate.connection === "checking" ? (
        <View style={styles.status}>
          <Waiting label={t("sell.busy.reading")} testID="mtpelerin-checking" />
        </View>
      ) : gate.connection === "signedOut" ? (
        <MtpIntro gate={gate} environment={access.environment} />
      ) : (
        <>
          <Lead style={styles.lead}>
            {desktop
              ? `${t("bank.transferSchedule")} ${t("bank.editableLater")}`
              : t("bank.transferSchedule")}
          </Lead>
          <MtpConnected />
          <View style={[styles.fields, desktop && styles.fieldsDesktop]}>
            <BankDetailsFields
              value={bank}
              onChange={(patch) => {
                if (patch.iban !== undefined && refusal?.kind === "ibanTaken") setRefusal(null);
                updateBank(patch);
              }}
              disabled={busy}
              ibanError={refusal?.kind === "ibanTaken" ? t("sell.failures.ibanTaken") : null}
              suggestedCountry={detectedCountry}
            />
          </View>
        </>
      )}

      {gate.sheet}
    </StepScreen>
  );
}

const styles = StyleSheet.create({
  lead: { marginTop: 8 },
  status: { marginTop: 24 },
  fields: { gap: 8, marginTop: 10, paddingBottom: 6 },
  fieldsDesktop: { gap: 12, marginTop: 24, paddingBottom: 0 },
  error: { marginBottom: 14 }
});
