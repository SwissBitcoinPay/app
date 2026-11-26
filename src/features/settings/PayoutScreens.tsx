import { Redirect, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

import { CurrencyPicker } from "@/components/CurrencyPicker";
import { StepHeader } from "@/components/layout/StepHeader";
import { StepScreen } from "@/components/layout/StepScreen";
import { useIsDesktop } from "@/components/layout/useIsDesktop";
import { AddAction } from "@/components/ui/AddAction";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Lead, ScreenTitle } from "@/components/ui/Heading";
import { Icon } from "@/components/ui/Icon";
import { OptionCard } from "@/components/ui/OptionCard";
import { isPayoutCurrency } from "@/config/payout-currencies";
import { getAccountSettings } from "@/features/account/session";
import { BankDetailsFields } from "@/features/bank/BankDetailsFields";
import {
  bankAccountInputOf,
  bankDetailsComplete,
  emptyBankDetails
} from "@/features/bank/bank-details";
import { useDockArea } from "@/features/navigation/dock-area";
import { useNotifications } from "@/features/notifications/NotificationsProvider";
import { SplitBar } from "@/features/onboarding/SplitBar";
import { SplitFees } from "@/features/onboarding/SplitFees";
import { MtpIntro, MtpLoginActions, useMtpGate } from "@/features/onboarding/mtp-gate";
import { accountMtpAccess, merchantProfileMtpAccess } from "@/features/sell/account-flow";
import { sellFailureKind, type SellFailureKind } from "@/features/sell/flow";
import { Failure, Waiting } from "@/features/sell/parts";
import { usePos } from "@/features/terminal/pos";
import { getDeviceLocale } from "@/lib/locale/device";
import { formatPercent } from "@/lib/locale/format";
import { logFailure } from "@/lib/log/log";
import { hasIncompleteAddress, maskedIban, ownerNameText } from "@/lib/mtpelerin/accounts";
import { isSellCurrency } from "@/lib/mtpelerin/sale";
import type { MtpBankAccount } from "@/lib/mtpelerin/types";
import { isCardHolderProfile } from "@/lib/terminal/model";
import { makeStyles, useTheme } from "@/theme";

import { changeSplit } from "./account-settings";
import { verifyBankAccount } from "./bank-check";
import { useCreateMerchantProfile } from "./merchant-profile";
import { useSettingsFailure } from "./parts";
import {
  bankDetailsOfAccount,
  ownerComplete,
  payoutAccountsIn,
  type PayoutAccountRegistration,
  type PayoutAccounts,
  type PayoutAccountsRead
} from "./payout-accounts";
import { usePayoutDraft } from "./payout-draft";

/*
 * "Split" and "Bank account" from the settings: the
 * sign-up's screens as they are, over the whole window, with their step header (a second dot only
 * with a fiat share). At 0 % in fiat, "Save" saves at once; otherwise "Continue" leads
 * to the bank account, whose "Save" checks the details first (bank-check.ts), every field
 * and the back button greyed meanwhile, then saves. Back on "Settings", a success notification.
 *
 * The bank account is Mt Pelerin's: the settings keep only its id
 * (`payoutAccountId`), never its IBAN, holder nor address, which are read from Mt Pelerin. So
 * "Bank account" asks for the Mt Pelerin login first when the account holds no session
 * (mtp-gate.tsx, as the sign-up), then offers the bank accounts the merchant has there in the
 * currency chosen (payout-accounts.ts; the settings' one selected),
 * "Edit this account" (the form on the account chosen, its IBAN
 * not to change; saved, its holder and address change at Mt Pelerin first) and "Add an
 * account" (the form, registered at Mt Pelerin as it is saved). Without any such account, the form
 * at once. While Mt Pelerin is read, the wait says so, and when it did not answer, "Try again"
 * (never the form, as if it had no account), with the settings' account to keep as it is meanwhile
 * (a change of the split is not held up by Mt Pelerin). Refused
 * there, nothing is saved. The choices are OptionCards, as
 * "Bitcoin node"'s, and "Add an account" the form's own AddAction.
 *
 * "Create my merchant profile" (`merchant`, /settings/merchant then /settings/merchant-bank:
 * as the sign-up, opened by "Settings"'s button): the same screens with the merchant sign-up's
 * texts,
 * ending with "Start accepting payments", which makes the card holder's account a merchant's
 * (useCreateMerchantProfile), then prepares this device's point of sale and opens it. As at the
 * sign-up, a fiat share asks for the Mt Pelerin login before the bank details (mtp-gate.tsx,
 * PayoutBankScreen), then the accounts it has there are offered as everywhere, the one typed
 * registered there before the profile is created; Mt Pelerin unanswered, nothing is created. A
 * device that is no card holder's has nothing to create: "Settings".
 */

function useBackToSettings() {
  const router = useRouter();
  return () => router.dismissTo("/settings");
}

/**
 * Whether the screen opened on a card holder's device, read once: the device becomes a point of
 * sale as "Create my merchant profile" ends, while its screen still shows.
 */
function useOpenedForCardHolder(): boolean {
  const { profile } = usePos();
  const [cardHolder] = useState(() => isCardHolderProfile(profile));
  return cardHolder;
}

/** The split. */
export function PayoutSplitScreen({ merchant = false }: { merchant?: boolean } = {}) {
  const styles = useStyles();
  const { t } = useTranslation();
  const cardHolder = useOpenedForCardHolder();
  const finishMerchant = useCreateMerchantProfile();
  const router = useRouter();
  const desktop = useIsDesktop();
  const { notify } = useNotifications();
  const fail = useSettingsFailure();
  const backToSettings = useBackToSettings();
  const { draft, start, update } = usePayoutDraft();
  const [device] = useState(getDeviceLocale);
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);
  // The shell keeps the band below its hidden dock (dock-area.tsx).
  const dockBelow = useDockArea() !== null;
  // From the account's settings each time the split opens (not when coming back from the bank).
  useEffect(() => start(), [start]);
  const hasFiat = draft.bitcoinPercent < 100;
  const fiatPercent = 100 - draft.bitcoinPercent;
  const percent = (value: number) => formatPercent(value, device.languageTag);
  const currencyName = t(`currencyNames.${draft.payoutCurrency}`);

  const next = () => {
    if (hasFiat) {
      router.push(merchant ? "/settings/merchant-bank" : "/settings/bank");
      return;
    }
    setSaving(true);
    if (merchant) {
      void finishMerchant({
        bitcoinPercent: 100,
        payoutCurrency: draft.payoutCurrency,
        payoutAccountId: null
      }).then((opened) => {
        if (!opened) setSaving(false);
      });
      return;
    }
    changeSplit({
      bitcoinPercent: 100,
      payoutCurrency: draft.payoutCurrency,
      payoutAccountId: null
    }).then(
      () => {
        notify({
          tone: "success",
          title: t("settings.splitSavedTitle"),
          body: t("settings.splitSavedBitcoin"),
          key: "settings"
        });
        backToSettings();
      },
      (error: unknown) => {
        setSaving(false);
        fail(error);
      }
    );
  };

  if (merchant && !cardHolder) return <Redirect href="/settings" />;
  return (
    <View style={styles.frame}>
      <StepHeader
        steps={{ count: hasFiat ? 2 : 1, current: 0 }}
        onBack={() => (router.canGoBack() ? router.back() : backToSettings())}
        backDisabled={saving}
      />
      <StepScreen
        insetBelow={dockBelow}
        footer={
          <Button onPress={next} loading={saving} testID="split-continue">
            {hasFiat
              ? t("common.continue")
              : merchant
                ? t("common.startCharging")
                : t("settings.save")}
          </Button>
        }
      >
        <ScreenTitle>{t("split.title")}</ScreenTitle>
        <Lead style={desktop ? styles.leadDesktop : undefined}>
          {t(merchant ? "split.description" : "settings.splitLead")}
        </Lead>
        <SplitBar
          bitcoinPercent={draft.bitcoinPercent}
          onChange={(bitcoinPercent) => update({ bitcoinPercent })}
          currency={draft.payoutCurrency}
          onPickCurrency={() => setPicking(true)}
          languageTag={device.languageTag}
          bitcoinLabel={t("split.bitcoin")}
          accessibilityLabel={t("split.sliderLabel")}
          accessibilityValueText={t("split.sliderValue", {
            bitcoin: percent(draft.bitcoinPercent),
            fiat: percent(fiatPercent),
            currency: t(`currencies.${draft.payoutCurrency}`)
          })}
          currencyLabel={t("split.currencyButton", { currency: currencyName })}
          testID="split-slider"
        />
        <SplitFees
          payoutCurrency={draft.payoutCurrency}
          hasFiat={hasFiat}
          languageTag={device.languageTag}
        />
        <CurrencyPicker
          visible={picking}
          value={draft.payoutCurrency}
          onSelect={(payoutCurrency) => update({ payoutCurrency })}
          onClose={() => setPicking(false)}
        />
      </StepScreen>
    </View>
  );
}

/** What "Bank account" knows of Mt Pelerin's accounts (payout-accounts.ts). */
type AccountsRead =
  | { state: "reading" }
  /** Mt Pelerin did not answer: nothing is told of its accounts. */
  | { state: "unread"; failure: SellFailureKind }
  | { state: "read"; read: PayoutAccountsRead };

/** The screen's part: Mt Pelerin's accounts, or the form (a new account, one to complete or change). */
type BankView = "accounts" | "form";

/**
 * The bank account, the settings' and "Create my merchant profile"'s: the bank account is
 * Mt Pelerin's, the settings keep only its id. So what Mt Pelerin
 * is for and its login first when the account holds no session (mtp-gate.tsx), then the accounts it
 * has there (BankAccountScreen), over that session; its session refused meanwhile, back to the
 * login.
 */
export function PayoutBankScreen({ merchant = false }: { merchant?: boolean } = {}) {
  const styles = useStyles();
  const { t } = useTranslation();
  const router = useRouter();
  const desktop = useIsDesktop();
  const cardHolder = useOpenedForCardHolder();
  const backToSettings = useBackToSettings();
  const { draft } = usePayoutDraft();
  const [device] = useState(getDeviceLocale);
  // A card holder's account becoming a merchant's, else the merchant's own (main-wallet.ts).
  const [access] = useState(merchant ? merchantProfileMtpAccess : accountMtpAccess);
  const hasFiat = draft.bitcoinPercent < 100;
  const gate = useMtpGate(access, hasFiat);
  // The shell keeps the band below its hidden dock (dock-area.tsx).
  const dockBelow = useDockArea() !== null;

  if ((merchant && !cardHolder) || !access || !gate) return <Redirect href="/settings" />;
  if (!hasFiat) return <Redirect href={merchant ? "/settings/merchant" : "/settings/split"} />;
  if (gate.connection === "signedIn") {
    return (
      <>
        <BankAccountScreen
          key={gate.generation}
          merchant={merchant}
          mtp={gate.accounts}
          onSessionLost={gate.lost}
        />
        {gate.sheet}
      </>
    );
  }
  const currency = isPayoutCurrency(draft.payoutCurrency)
    ? t(`currencies.${draft.payoutCurrency}`)
    : draft.payoutCurrency;
  return (
    <View style={styles.frame}>
      <StepHeader
        steps={{ count: 2, current: 1 }}
        onBack={() => (router.canGoBack() ? router.back() : backToSettings())}
      />
      <StepScreen
        insetBelow={dockBelow}
        footer={gate.connection === "checking" ? null : <MtpLoginActions gate={gate} />}
      >
        <ScreenTitle size={desktop ? undefined : 24}>
          {t("bank.title", {
            percent: formatPercent(100 - draft.bitcoinPercent, device.languageTag),
            currency
          })}
        </ScreenTitle>
        {gate.connection === "checking" ? (
          <View style={styles.status}>
            <Waiting label={t("sell.busy.reading")} testID="mtpelerin-checking" />
          </View>
        ) : (
          <MtpIntro gate={gate} environment={access.environment} />
        )}
      </StepScreen>
      {gate.sheet}
    </View>
  );
}

/**
 * The bank account of the split, among Mt Pelerin's (`mtp`, over the session just read or opened):
 * those in the currency chosen (the settings' one selected), "Edit this account" and "Add an
 * account"; without any, the form at once. Saved, the settings keep the account's id only. A
 * session Mt Pelerin refuses leads back to the login (`onSessionLost`); while it does not answer,
 * "Try again", with the settings' account to keep as it is meanwhile (a change of the split is
 * not held up by Mt Pelerin), never for a profile being created
 * (`merchant`: its account must be Mt Pelerin's).
 */
function BankAccountScreen({
  merchant,
  mtp,
  onSessionLost
}: {
  merchant: boolean;
  mtp: PayoutAccounts;
  onSessionLost: () => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const finishMerchant = useCreateMerchantProfile();
  const router = useRouter();
  const desktop = useIsDesktop();
  const { notify } = useNotifications();
  const fail = useSettingsFailure();
  const backToSettings = useBackToSettings();
  const { draft, updateBank } = usePayoutDraft();
  const { bank } = draft;
  const [device] = useState(getDeviceLocale);
  const [refused, setRefused] = useState<"checksum" | "taken" | null>(null);
  const [checking, setChecking] = useState(false);
  const [read, setRead] = useState<AccountsRead>({ state: "reading" });
  const [reads, setReads] = useState(0);
  const [view, setView] = useState<BankView>("accounts");
  const [chosenId, setChosenId] = useState<string | null>(null);
  // The IBAN of Mt Pelerin's account the form changes ("Edit this account", or its lines to
  // complete): shown, not changed; null for "Add an account".
  const [editingIban, setEditingIban] = useState<string | null>(null);
  // The settings' account as the screen opened (its id only): the one Mt Pelerin's list starts on.
  const [saved] = useState(() => {
    const settings = getAccountSettings();
    return {
      accountId: settings?.payoutAccountId ?? null,
      payoutCurrency: settings?.payoutCurrency ?? null
    };
  });
  // The shell keeps the band below its hidden dock (dock-area.tsx).
  const dockBelow = useDockArea() !== null;

  useEffect(() => {
    let live = true;
    mtp.read().then(
      (next) => {
        if (live) setRead({ state: "read", read: next });
      },
      (error: unknown) => {
        logFailure("Reading the Mt Pelerin bank accounts failed", error, false);
        if (live) setRead({ state: "unread", failure: sellFailureKind(error) });
      }
    );
    return () => {
      live = false;
    };
  }, [mtp, reads]);

  // A session Mt Pelerin no longer takes leads back to its login, once.
  const sessionRefused = read.state === "read" && !read.read.connected;
  const toldLost = useRef(false);
  useEffect(() => {
    if (!sessionRefused || toldLost.current) return;
    toldLost.current = true;
    onSessionLost();
  }, [sessionRefused, onSessionLost]);

  const fiatPercent = 100 - draft.bitcoinPercent;
  const currency = isPayoutCurrency(draft.payoutCurrency)
    ? t(`currencies.${draft.payoutCurrency}`)
    : draft.payoutCurrency;
  const percentText = formatPercent(fiatPercent, device.languageTag);
  // Mt Pelerin's accounts once read, null while not read.
  const mtpAccounts = read.state === "read" && read.read.connected ? read.read.accounts : null;
  const unreadable = read.state === "read" && read.read.connected ? read.read.unreadable : 0;
  // Those that wire the share in the currency chosen: the title asks where it goes.
  const accounts = mtpAccounts ? payoutAccountsIn(mtpAccounts, draft.payoutCurrency) : [];
  // No account of Mt Pelerin's in that currency: the form.
  const listed = accounts.length > 0;
  const shown: "reading" | "unread" | BankView =
    view === "form" ? "form" : read.state !== "read" ? read.state : listed ? "accounts" : "form";
  const chosen =
    accounts.find((account) => account.id === chosenId) ??
    accounts.find((account) => account.id === saved.accountId) ??
    null;
  // Mt Pelerin unread: the settings' account may still be kept as it is, in the same currency
  // (another currency is another account), nothing sent to Mt Pelerin; without one, nothing to save
  // until it answers. Never for a profile being created.
  const keepable =
    shown === "unread" && !merchant && saved.payoutCurrency === draft.payoutCurrency
      ? saved.accountId
      : null;
  const complete =
    shown === "form"
      ? bankDetailsComplete(bank)
      : shown === "unread"
        ? keepable !== null
        : chosen !== null;

  /** The split saved with the Mt Pelerin account `accountId`; back on "Settings". */
  const finish = async (accountId: string) => {
    if (merchant) {
      const opened = await finishMerchant({
        bitcoinPercent: draft.bitcoinPercent,
        payoutCurrency: draft.payoutCurrency,
        payoutAccountId: accountId
      });
      if (!opened) setChecking(false);
      return;
    }
    await changeSplit({
      bitcoinPercent: draft.bitcoinPercent,
      payoutCurrency: draft.payoutCurrency,
      payoutAccountId: accountId
    });
    notify({
      tone: "success",
      title: t("settings.splitSavedTitle"),
      body: t("settings.splitSavedBank", { percent: percentText, currency }),
      key: "settings"
    });
    backToSettings();
  };

  /** Mt Pelerin's refusal or silence, said; nothing saved. */
  const notSaved = (body: string) => {
    setChecking(false);
    notify({ tone: "error", title: t("settings.saveFailedTitle"), body, key: "settings" });
  };

  /**
   * The form's account, its IBAN checked, then registered at Mt Pelerin (payout-accounts.ts: created,
   * or the one it has changed when typed otherwise), so that the split's sale goes to it; refused
   * there, nothing is saved.
   */
  const saveForm = async () => {
    // The form stays, whatever Mt Pelerin's list read again after this save says.
    setView("form");
    setChecking(true);
    setRefused(null);
    const input = isSellCurrency(draft.payoutCurrency)
      ? bankAccountInputOf(bank, draft.payoutCurrency)
      : null;
    if (input === null || !isSellCurrency(draft.payoutCurrency)) {
      // Every payout currency is one Mt Pelerin wires and the form is complete: not expected.
      logFailure("The bank account cannot be registered at Mt Pelerin");
      notSaved(t("sell.failures.refused"));
      return;
    }
    const check = await verifyBankAccount(input.iban);
    if (check.status === "ibanRefused") {
      setRefused("checksum");
      setChecking(false);
      return;
    }
    let registration: PayoutAccountRegistration;
    try {
      registration = await mtp.register({ ...input, currency: draft.payoutCurrency });
    } catch (error) {
      logFailure("Registering the bank account at Mt Pelerin failed", error, false);
      notSaved(t(`sell.failures.${sellFailureKind(error)}`));
      return;
    }
    switch (registration.kind) {
      case "ibanTaken":
        setRefused("taken");
        setChecking(false);
        return;
      case "unchanged":
        // Mt Pelerin refused, or kept, the holder or address: not what each transfer would carry.
        notSaved(t("sell.failures.accountUnchanged"));
        return;
      case "notConnected":
        setChecking(false);
        onSessionLost();
        return;
    }
    try {
      await finish(registration.accountId);
    } catch (error) {
      // Registered but not saved: Mt Pelerin's list read again, where the account now is.
      setReads((count) => count + 1);
      setChecking(false);
      fail(error);
    }
  };

  /** Mt Pelerin unread: the settings' account kept as it is, with the split changed. */
  const saveCurrent = async () => {
    if (keepable === null) return;
    setChecking(true);
    try {
      await finish(keepable);
    } catch (error) {
      setChecking(false);
      fail(error);
    }
  };

  /** The form on `account` (its IBAN shown, not changed): its lines as Mt Pelerin has them. */
  const openAccount = (account: MtpBankAccount) => {
    updateBank(bankDetailsOfAccount(account, draft.detectedCountry));
    setEditingIban(account.iban);
    setRefused(null);
    setView("form");
  };

  /** The account chosen among Mt Pelerin's; one it lacks a line of opens the form, to complete. */
  const saveChosen = async () => {
    if (chosen === null) return;
    if (!ownerComplete(chosen)) {
      openAccount(chosen);
      return;
    }
    setChecking(true);
    try {
      await finish(chosen.id);
    } catch (error) {
      setChecking(false);
      fail(error);
    }
  };

  /**
   * "Edit this account": the form with the
   * chosen account's holder and address as Mt Pelerin has them; saved, Mt Pelerin's account changes
   * (payout-accounts.ts `register`).
   */
  const editAccount = () => {
    if (chosen !== null) openAccount(chosen);
  };

  const addAccount = () => {
    updateBank(emptyBankDetails(draft.detectedCountry));
    setEditingIban(null);
    setRefused(null);
    setView("form");
  };

  const back = () => {
    // The form opened from Mt Pelerin's accounts: back to them.
    if (shown === "form" && view === "form" && listed) {
      setRefused(null);
      setEditingIban(null);
      setView("accounts");
      return;
    }
    if (router.canGoBack()) router.back();
    else backToSettings();
  };

  return (
    <View style={styles.frame}>
      <StepHeader steps={{ count: 2, current: 1 }} onBack={back} backDisabled={checking} />
      <StepScreen
        insetBelow={dockBelow}
        footer={
          shown === "reading" || (shown === "unread" && keepable === null) ? null : (
            <Button
              disabled={!complete}
              loading={checking}
              onPress={() =>
                void (shown === "form"
                  ? saveForm()
                  : shown === "unread"
                    ? saveCurrent()
                    : saveChosen())
              }
              testID="bank-submit"
            >
              {merchant ? t("common.startCharging") : t("settings.save")}
            </Button>
          )
        }
      >
        <ScreenTitle size={desktop ? undefined : 24}>
          {t("bank.title", { percent: percentText, currency })}
        </ScreenTitle>
        <Lead style={styles.lead}>{t("bank.transferSchedule")}</Lead>
        {/* Accounts Mt Pelerin listed that the app cannot read (guards.ts): not offered, said
            so. */}
        {unreadable > 0 && (shown === "accounts" || shown === "form") ? (
          <Callout tone="warning" testID="bank-accounts-unreadable">
            {t("sell.accounts.unreadable", { count: unreadable })}
          </Callout>
        ) : null}
        {shown === "reading" ? (
          <View style={styles.status}>
            <Waiting label={t("sell.busy.reading")} testID="bank-accounts-reading" />
          </View>
        ) : shown === "unread" && read.state === "unread" ? (
          <View style={styles.status}>
            <Failure
              failure={{
                kind: read.failure,
                retry: () => {
                  setRead({ state: "reading" });
                  setReads((count) => count + 1);
                }
              }}
              testID="bank-accounts-unread"
            />
            {keepable ? (
              <View
                style={styles.choices}
                accessibilityRole="radiogroup"
                accessibilityLabel={t("sell.accounts.title")}
              >
                <OptionCard
                  // Its holder and IBAN are Mt Pelerin's, which does not answer: not shown.
                  title={t("bank.currentAccount")}
                  description={t("bank.currentAccountSub")}
                  leading={<Icon name="landmark" size={18} color={colors.text.accent} />}
                  selected
                  disabled={checking}
                  // The only account offered: chosen already.
                  onPress={() => undefined}
                  testID="bank-account-current"
                />
              </View>
            ) : null}
          </View>
        ) : shown === "accounts" ? (
          <View style={[styles.accounts, desktop && styles.fieldsDesktop]}>
            <View
              style={styles.choices}
              accessibilityRole="radiogroup"
              accessibilityLabel={t("sell.accounts.title")}
            >
              {accounts.map((account) => (
                <OptionCard
                  key={account.id}
                  title={ownerNameText(account.owner.name)}
                  description={[
                    maskedIban(account.iban),
                    ...(account.status === "active" ? [] : [t("sell.accounts.pending")]),
                    // Offered all the same, said so.
                    ...(hasIncompleteAddress(account) ? [t("sell.accounts.incompleteAddress")] : [])
                  ].join(" · ")}
                  leading={<Icon name="landmark" size={18} color={colors.text.accent} />}
                  selected={chosen?.id === account.id}
                  disabled={checking}
                  onPress={() => setChosenId(account.id)}
                  testID={`bank-account-${account.id}`}
                />
              ))}
            </View>
            <AddAction
              label={t("bank.editAccount")}
              icon="pen"
              onPress={editAccount}
              disabled={checking || chosen === null}
              testID="bank-account-edit"
            />
            <AddAction
              label={t("sell.accounts.add")}
              onPress={addAccount}
              disabled={checking}
              testID="bank-account-add"
            />
          </View>
        ) : (
          <View style={[styles.fields, desktop && styles.fieldsDesktop]}>
            <BankDetailsFields
              value={bank}
              onChange={(patch) => {
                if (patch.iban !== undefined) setRefused(null);
                updateBank(patch);
              }}
              disabled={checking}
              ibanLocked={editingIban !== null}
              ibanError={
                refused === "checksum"
                  ? t("settings.ibanRefused")
                  : refused === "taken"
                    ? t("sell.failures.ibanTaken")
                    : null
              }
              suggestedCountry={draft.detectedCountry}
            />
          </View>
        )}
      </StepScreen>
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  frame: { flex: 1, backgroundColor: colors.background.app },
  leadDesktop: { marginTop: 12, fontSize: 15, lineHeight: 15 * 1.5 },
  lead: { marginTop: 8 },
  fields: { gap: 8, marginTop: 10, paddingBottom: 6 },
  accounts: { gap: 8, marginTop: 10, paddingBottom: 6 },
  choices: { gap: 10 },
  status: { gap: 16, marginTop: 24 },
  fieldsDesktop: { gap: 12, marginTop: 24, paddingBottom: 0 }
}));
