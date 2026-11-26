import { useRouter } from "expo-router";
import type { TFunction } from "i18next";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";

import { CurrencyPicker } from "@/components/CurrencyPicker";
import { useIsDesktop } from "@/components/layout/useIsDesktop";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Select } from "@/components/ui/Select";
import { StatusPill } from "@/components/ui/StatusPill";
import { Switch } from "@/components/ui/Switch";
import { standardVatRate } from "@/config/invoices";
import { isPayoutCurrency } from "@/config/payout-currencies";
import { InstallSetting } from "@/features/install/InstallSetting";
import { useAppLockSwitch } from "@/features/app-lock/useAppLockSwitch";
import type { ThemePreference } from "@/features/appearance/theme-format";
import { vatText } from "@/features/invoices/form";
import { vatLabel } from "@/features/invoices/format";
import { rememberImage, useImageUri } from "@/features/media/images";
import { pickSquareImage } from "@/features/media/pick-image";
import { useNotifications } from "@/features/notifications/NotificationsProvider";
import {
  BITCOIN_FEE_PERCENT,
  bitcoinFeeFreeUntilText,
  bitcoinFeeWaived,
  mtPelerinFeeRangeText
} from "@/features/onboarding/SplitFees";
import { ReadOnlyRelays, useTestOnce } from "@/features/relays/RelaysEditor";
import { RelaysDialog } from "@/features/relays/RelaysPanel";
import { accountMtpAccess } from "@/features/sell/account-flow";
import { usePos } from "@/features/terminal/pos";
import { useLightningMax } from "@/features/terminal/useLightningMax";
import { useWalletFormat } from "@/features/wallet/format";
import { formatIban } from "@/lib/iban";
import { isPlainHttp } from "@/lib/onchain/node";
import { parseVatRate } from "@/lib/invoice/amounts";
import { formatPercent } from "@/lib/locale/format";
import { logFailure } from "@/lib/log/log";
import type { MerchantSettings } from "@/lib/settings/merchant";
import { formatBtc } from "@/lib/terminal/amount";
import { isCardHolderProfile } from "@/lib/terminal/model";
import { currencyColors } from "@/theme/currency-colors";
import { makeStyles, palette, radius, sans, space, type } from "@/theme";

import {
  changeBusinessName,
  changeDisplayCurrency,
  changeLogo,
  changeOnchainPayments,
  changeOnchainTolerance,
  changeProductLookup,
  changeVatRate,
  SettingsError
} from "./account-settings";
import { useAccountRelaysSave, useIntegrationsRelaysNotice } from "./AccountRelaysScreen";
import { BitcoinNodeDialog } from "./BitcoinNodeScreen";
import { BusinessAddressSetting, BusinessNumbersSetting } from "./BusinessDetailsSettings";
import { saveAmountUnit, useAmountUnitChoice } from "./amount-unit";
import type { AmountUnit } from "./amount-unit-format";
import { DeleteAccount } from "./DeleteAccount";
import { LegacyFreezeSetting } from "@/features/migration/LegacyFreezeSetting";
import { LegacyHistorySetting } from "@/features/migration/LegacyHistorySetting";
import { NameField, SettingBlock, TextSetting } from "./fields";
import { ThemeSetting, themeSummary } from "./ThemeSetting";
import {
  AvatarBusy,
  SettingsCard,
  SettingsRow,
  useLanguageTag,
  useSettingsErrorMessage,
  useSettingsFailure,
  useSettingsSaved
} from "./parts";
import { payoutAccounts } from "./payout-accounts";
import { usePayoutDraft } from "./payout-draft";
import { signOut } from "./sign-out";
import { parseToleranceText, toleranceLabel, toleranceText } from "./tolerance";

/*
 * The rubrics of the owner's "Settings": each one a tab on a computer, a page on a phone, the same
 * settings in both. Saved live: each change goes to the account at once
 * (account-settings.ts), then to this device's point of sale and to the employees' devices; a
 * notification says it is saved, or why not (the field back to the value before). Each field's
 * notifications replace each other only (their `key`).
 *
 * A card holder's account has no business: neither its name and
 * logo, nor what takes payments and pays out, nor a recovery phrase (its words are the main
 * wallet's, which such an account never has: main-wallet.ts), nor the app's lock. It keeps the
 * display currency (its cards' amounts), the relays, "Help", the session and the deletion, and
 * gets "Create my merchant profile" (MerchantProfileBlock).
 */

export type OwnerRubric =
  "business" | "display" | "charging" | "payouts" | "network" | "security" | "help" | "account";

/** "CH93 … 5295 7": the IBAN's first group and its last two. */
export function shortIban(iban: string): string {
  const groups = formatIban(iban).split(" ");
  return groups.length <= 3 ? groups.join(" ") : `${groups[0]} … ${groups.slice(-2).join(" ")}`;
}

function currencyNameOf(t: TFunction, code: string): string {
  return isPayoutCurrency(code) ? t(`currencyNames.${code}`) : code;
}

/** What a rubric's card says of it on a phone ("Settings"): what it holds now. */
export function rubricSummary(
  t: TFunction,
  rubric: OwnerRubric,
  settings: MerchantSettings,
  languageTag: string,
  device: { cardHolder: boolean; theme: ThemePreference | null }
): string | undefined {
  const percent = (value: number) => formatPercent(value, languageTag);
  switch (rubric) {
    case "business":
      return `${settings.businessName} · ${settings.displayCurrency}`;
    case "display":
      // A card holder's: its display currency; a merchant's (whose currency is in "Business"):
      // its device's "Theme".
      return device.cardHolder
        ? `${settings.displayCurrency} — ${currencyNameOf(t, settings.displayCurrency)}`
        : themeSummary(t, device.theme);
    case "charging":
      return settings.onchainPayments
        ? t("settings.rubrics.chargingBoth")
        : t("settings.onchainSavedOff");
    case "payouts":
      return settings.bitcoinPercent < 100
        ? t("settings.splitShort", {
            percent: percent(100 - settings.bitcoinPercent),
            currency: settings.payoutCurrency
          })
        : t("settings.allBitcoin");
    case "network":
      return t("settings.relaysCount", { count: settings.relays.length });
    case "security":
      return t("settings.recovery.title");
    case "help":
      return t("settings.support.contact");
    default:
      return undefined;
  }
}

/** The display currency: its field, its list, the loader while a choice is saved. */
function CurrencySetting({
  settings,
  cardHolder
}: {
  settings: MerchantSettings;
  cardHolder: boolean;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  const fail = useSettingsFailure();
  const saved = useSettingsSaved();
  const [picking, setPicking] = useState(false);
  // The currency being saved: its field waits.
  const [saving, setSaving] = useState(false);
  const pick = (code: string) => {
    // The same currency: nothing to save.
    if (code === settings.displayCurrency) return;
    setSaving(true);
    changeDisplayCurrency(code)
      .then(
        (changed) =>
          saved(
            "settings-currency",
            t("settings.currencySavedTitle"),
            `${changed.displayCurrency} — ${currencyNameOf(t, changed.displayCurrency)}`
          ),
        (error: unknown) => fail(error, "settings-currency")
      )
      .finally(() => setSaving(false));
  };
  return (
    <SettingBlock
      title={t("settings.displayCurrency")}
      description={t(
        cardHolder
          ? "settings.displayCurrencyCardDescription"
          : "settings.displayCurrencyDescription"
      )}
    >
      <Select
        value={`${settings.displayCurrency} — ${currencyNameOf(t, settings.displayCurrency)}`}
        onPress={() => setPicking(true)}
        busy={saving}
        style={styles.select}
        testID="display-currency"
      />
      <CurrencyPicker
        title={t("settings.displayCurrency")}
        visible={picking}
        value={settings.displayCurrency}
        onSelect={pick}
        onClose={() => setPicking(false)}
      />
    </SettingBlock>
  );
}

/**
 * "Currency shown first": this device's
 * choice of what the lists of movements write first (amount-unit.ts), the display currency or the
 * sats, under the display currency it names. Saved at once, on this device only; not read yet, or
 * being saved, the control waits.
 */
function AmountUnitSetting({ currency }: { currency: string }) {
  const styles = useStyles();
  const { t } = useTranslation();
  const saved = useSettingsSaved();
  const { notify } = useNotifications();
  const stored = useAmountUnitChoice();
  const [saving, setSaving] = useState<AmountUnit | null>(null);
  const shown = saving ?? stored;
  const label = (unit: AmountUnit) => (unit === "fiat" ? currency : t("settings.amountUnit.sats"));
  const pick = (unit: AmountUnit) => {
    if (unit === stored || saving !== null) return;
    setSaving(unit);
    saveAmountUnit(unit)
      .then(
        () => saved("settings-amount-unit", t("settings.amountUnit.savedTitle"), label(unit)),
        (error: unknown) => {
          logFailure("Saving the amounts' unit failed", error);
          notify({
            tone: "error",
            title: t("settings.saveFailedTitle"),
            body: t("settings.amountUnit.saveFailed"),
            key: "settings-amount-unit"
          });
        }
      )
      .finally(() => setSaving(null));
  };
  return (
    <SettingBlock
      title={t("settings.amountUnit.title")}
      description={t("settings.amountUnit.description")}
      testID="amount-unit-block"
    >
      <SegmentedControl<AmountUnit>
        label={t("settings.amountUnit.title")}
        options={[
          { value: "fiat", label: label("fiat") },
          { value: "sats", label: label("sats") }
        ]}
        value={shown}
        onChange={pick}
        disabled={shown === null || saving !== null}
        style={styles.unitControl}
        testID="amount-unit"
      />
    </SettingBlock>
  );
}

/**
 * "Business": the logo and the name the customers see, the address and the numbers on the
 * invoices, the display currency, the default VAT.
 */
export function BusinessRubric({ settings }: { settings: MerchantSettings }) {
  const styles = useStyles();
  const { t } = useTranslation();
  const languageTag = useLanguageTag();
  const fail = useSettingsFailure();
  const saved = useSettingsSaved();
  const failureMessage = useSettingsErrorMessage();
  const { notify } = useNotifications();
  const logo = useImageUri(settings.logo);
  // A logo being sent, until a relay took its reference too: the loader,
  // and no other change meanwhile. Only then: a logo picked while the account syncs is saved once
  // it did (changeLogo).
  const [logoBusy, setLogoBusy] = useState(false);

  const pickLogo = async () => {
    if (logoBusy) return;
    try {
      const bytes = await pickSquareImage();
      if (!bytes) return;
      setLogoBusy(true);
      const changed = await changeLogo(bytes);
      if (changed.logo) rememberImage(changed.logo, bytes);
      saved("settings-logo", t("settings.logoSavedTitle"));
    } catch (error) {
      fail(error, "settings-logo");
    } finally {
      setLogoBusy(false);
    }
  };
  const saveName = async (value: string) => {
    const changed = await changeBusinessName(value);
    saved("settings-name", t("settings.nameSavedTitle"), changed.businessName, { verbatim: true });
  };
  // "Default VAT": the account's rate, else the standard rate of its country (null).
  const standardRate = standardVatRate(settings.detectedCountry);
  const vatValue = (rate: number | null) =>
    rate !== null
      ? vatLabel(rate, languageTag)
      : t("settings.vatStandard", { rate: vatLabel(standardRate, languageTag) });
  /** Saves the rate typed: "" for the country's standard rate. */
  const saveVat = async (text: string) => {
    const rate = text === "" ? null : parseVatRate(text);
    if (text !== "" && rate === null) throw new SettingsError("invalid", "Not a VAT rate");
    // Unchanged: nothing to save.
    if (rate === settings.vatRate) return;
    const changed = await changeVatRate(rate);
    saved("settings-vat", t("settings.vatSavedTitle"), vatValue(changed.vatRate));
  };
  const vatFailure = (error: unknown) =>
    error instanceof SettingsError && error.code === "invalid"
      ? t("settings.vatInvalid")
      : failureMessage(error);

  return (
    <>
      <SettingBlock description={t("settings.businessDescription")}>
        <View style={styles.logoRow}>
          <View>
            <Avatar
              name={settings.businessName}
              image={logo}
              size={72}
              badge
              onPress={() => void pickLogo()}
              disabled={logoBusy}
              accessibilityLabel={t("settings.changeLogo")}
              testID="business-logo"
            />
            {logoBusy ? <AvatarBusy size={72} /> : null}
          </View>
          <Button
            variant="secondary"
            size="md"
            icon="image"
            fullWidth={false}
            onPress={() => void pickLogo()}
            disabled={logoBusy}
            testID="change-logo"
          >
            {t("settings.logoChange")}
          </Button>
        </View>
        <View style={styles.nameField}>
          <NameField
            name={settings.businessName}
            label={t("settings.businessName")}
            onSave={saveName}
            onFail={(error) => fail(error, "settings-name")}
          />
        </View>
      </SettingBlock>
      <BusinessAddressSetting settings={settings} />
      <BusinessNumbersSetting settings={settings} />
      <CurrencySetting settings={settings} cardHolder={false} />
      <AmountUnitSetting currency={settings.displayCurrency} />
      <SettingBlock title={t("settings.vatRate")} description={t("settings.vatRateDescription")}>
        <TextSetting
          text={settings.vatRate === null ? "" : vatText(settings.vatRate, languageTag)}
          label={t("settings.vatRateField")}
          placeholder={vatText(standardRate, languageTag)}
          hint={t("settings.vatRateHint", { rate: vatLabel(standardRate, languageTag) })}
          maxLength={7}
          onSave={saveVat}
          onFail={(error) =>
            notify({
              tone: "error",
              title: t("settings.saveFailedTitle"),
              body: vatFailure(error),
              key: "settings-vat"
            })
          }
          testID="vat-rate"
        />
      </SettingBlock>
    </>
  );
}

/**
 * "Display": a card holder's, the display currency (its cards' amounts), what its lists write
 * first, then its device's "Theme"; a merchant's, the "Theme"
 * (its currency and its unit are in "Business").
 */
export function DisplayRubric({
  settings,
  cardHolder
}: {
  settings: MerchantSettings;
  cardHolder: boolean;
}) {
  // "Install the app" after this device's theme (the web only: src/features/install/).
  return cardHolder ? (
    <>
      <CurrencySetting settings={settings} cardHolder />
      <AmountUnitSetting currency={settings.displayCurrency} />
      <ThemeSetting />
      <InstallSetting />
    </>
  ) : (
    <>
      <ThemeSetting />
      <InstallSetting />
    </>
  );
}

/**
 * "Create my merchant profile", a card holder's: the screen's one filled button. It opens the
 * split (as a new merchant's sign-up: PayoutScreens.tsx), then,
 * with a fiat share, Mt Pelerin's login and the bank details; "Start accepting payments" there
 * creates the profile (useCreateMerchantProfile).
 */
export function MerchantProfileBlock() {
  const styles = useStyles();
  const { t } = useTranslation();
  const router = useRouter();
  const desktop = useIsDesktop();
  return (
    <SettingBlock
      title={t("settings.merchant.section")}
      description={t("settings.merchant.description")}
    >
      <View style={styles.buttonRow}>
        <Button
          icon="store"
          size="md"
          fullWidth={!desktop}
          onPress={() => router.push("/settings/merchant")}
          testID="merchant-create"
        >
          {t("settings.merchant.create")}
        </Button>
      </View>
    </SettingBlock>
  );
}

/** "Payments": Lightning, on-chain payments, the tolerance of on-chain underpayments. */
export function ChargingRubric({ settings }: { settings: MerchantSettings }) {
  const { t } = useTranslation();
  const languageTag = useLanguageTag();
  const fail = useSettingsFailure();
  const saved = useSettingsSaved();
  const failureMessage = useSettingsErrorMessage();
  const { notify } = useNotifications();
  // The value being saved, shown meanwhile: the switch waits.
  const [onchain, setOnchain] = useState<boolean | null>(null);
  const toggleOnchain = (value: boolean) => {
    // Shown at once; back to the saved value when it could not be saved.
    setOnchain(value);
    changeOnchainPayments(value)
      .then(
        (changed) =>
          saved(
            "settings-onchain",
            t("settings.onchainSavedTitle"),
            changed.onchainPayments ? t("settings.onchainSavedOn") : t("settings.onchainSavedOff")
          ),
        (error: unknown) => fail(error, "settings-onchain")
      )
      .finally(() => setOnchain(null));
  };
  const onchainSaving = onchain !== null;
  // Lightning's ceiling: the most the Lightning address accepts per
  // invoice, read from it (useLightningMax), with its value at the hour's point of the display
  // currency, for scale (rounded down: a ceiling), none without a point for the present. Above it,
  // a sale shows its on-chain address alone, or is refused while on-chain payments are off
  // (useSale.ts).
  const { profile } = usePos();
  const lightningMax = useLightningMax(
    isCardHolderProfile(profile) ? null : profile.lightningAddress
  );
  const { fiat: fiatValue } = useWalletFormat();
  const beyond = t(
    (onchain ?? settings.onchainPayments)
      ? "settings.rubrics.lightningBeyond.onchain"
      : "settings.rubrics.lightningBeyond.refused"
  );
  const lightningCaption = (() => {
    if (lightningMax === undefined || lightningMax === null || lightningMax <= 0n) {
      return t("settings.rubrics.lightningCaptionUnknown", { beyond });
    }
    const btc = `${formatBtc(lightningMax, languageTag)} BTC`;
    const fiat = fiatValue(lightningMax, "", "down");
    return t("settings.rubrics.lightningCaption", {
      limit: fiat === null ? btc : t("settings.rubrics.lightningLimitFiat", { btc, fiat }),
      beyond
    });
  })();
  // "Underpayment tolerance": "None" at 0.
  const toleranceValue = (tolerance: number) =>
    toleranceLabel(tolerance, languageTag) ?? t("settings.toleranceNone");
  /** Saves the tolerance typed, in percent by tenths: "" for none. */
  const saveTolerance = async (text: string) => {
    const tolerance = parseToleranceText(text);
    if (tolerance === null) throw new SettingsError("invalid", "Not a tolerance");
    // Unchanged: nothing to save.
    if (tolerance === settings.onchainTolerance) return;
    const changed = await changeOnchainTolerance(tolerance);
    saved(
      "settings-tolerance",
      t("settings.toleranceSavedTitle"),
      changed.onchainTolerance === 0
        ? t("settings.toleranceSavedNone")
        : t("settings.toleranceSaved", { rate: toleranceValue(changed.onchainTolerance) })
    );
  };
  const toleranceFailure = (error: unknown) =>
    error instanceof SettingsError && error.code === "invalid"
      ? t("settings.toleranceInvalid")
      : failureMessage(error);

  return (
    <>
      <SettingBlock
        title={t("settings.rubrics.methods")}
        description={t("settings.rubrics.chargingDescription")}
      >
        <SettingsCard>
          <SettingsRow
            icon="bolt"
            label={t("settings.rubrics.lightning")}
            caption={lightningCaption}
            separated
            wrap
            testID="lightning-row"
          />
          <SettingsRow
            icon="bitcoin"
            label={t("settings.onchain")}
            caption={t("settings.onchainDescription")}
            trailing={
              <Switch
                value={onchain ?? settings.onchainPayments}
                onValueChange={toggleOnchain}
                label={t("settings.onchain")}
                loading={onchainSaving}
                testID="onchain-switch"
              />
            }
            wrap
            testID="onchain-row"
          />
        </SettingsCard>
      </SettingBlock>
      <SettingBlock
        title={t("settings.tolerance")}
        description={t("settings.toleranceDescription")}
      >
        <TextSetting
          text={toleranceText(settings.onchainTolerance, languageTag)}
          label={t("settings.toleranceField")}
          placeholder="0"
          hint={t("settings.toleranceHint")}
          maxLength={5}
          onSave={saveTolerance}
          onFail={(error) =>
            notify({
              tone: "error",
              title: t("settings.saveFailedTitle"),
              body: toleranceFailure(error),
              key: "settings-tolerance"
            })
          }
          testID="tolerance"
        />
      </SettingBlock>
    </>
  );
}

/**
 * The IBAN of the split's bank account (`payoutAccountId`), as Mt Pelerin has it now: the settings
 * keep only its id. Null while it is not read, without a session,
 * when Mt Pelerin does not answer or no longer has it: the row then says where it is, never a
 * former IBAN.
 */
function usePayoutAccountIban(accountId: string | null): string | null {
  const [read, setRead] = useState<{ id: string; iban: string | null } | null>(null);
  useEffect(() => {
    const access = accountId === null ? null : accountMtpAccess();
    if (accountId === null || access === null) return;
    let live = true;
    payoutAccounts(access)
      .read()
      .then(
        (next) => {
          const found = next.connected
            ? next.accounts.find((account) => account.id === accountId)
            : undefined;
          if (live) setRead({ id: accountId, iban: found?.iban ?? null });
        },
        (error: unknown) => {
          logFailure("Reading the Mt Pelerin bank accounts failed", error, false);
        }
      );
    return () => {
      live = false;
    };
  }, [accountId]);
  return read !== null && read.id === accountId ? read.iban : null;
}

/**
 * "Payouts": the split of each sale between bitcoin and the payout currency, drawn, then the
 * split and the bank account, each opening its own steps (/settings/split, /settings/bank). The
 * bank account's IBAN is read from Mt Pelerin (usePayoutAccountIban), "At Mt Pelerin" until
 * then.
 */
export function PayoutsRubric({ settings }: { settings: MerchantSettings }) {
  const styles = useStyles();
  const { t } = useTranslation();
  const router = useRouter();
  const languageTag = useLanguageTag();
  const { start: startPayoutDraft } = usePayoutDraft();
  const percent = (value: number) => formatPercent(value, languageTag);
  const hasFiat = settings.bitcoinPercent < 100;
  const fiatPercent = 100 - settings.bitcoinPercent;
  const iban = usePayoutAccountIban(hasFiat ? settings.payoutAccountId : null);
  const fiatFill = isPayoutCurrency(settings.payoutCurrency)
    ? currencyColors[settings.payoutCurrency].fill
    : palette.ink;
  const openSplit = () => router.push("/settings/split");
  // Straight to the bank account: the draft starts from the account's settings, as the split does
  // when it opens (not an earlier visit's abandoned split, nor settings changed since).
  const openBank = () => {
    startPayoutDraft();
    router.push(hasFiat ? "/settings/bank" : "/settings/split");
  };
  return (
    <SettingBlock
      description={t(
        bitcoinFeeWaived() ? "settings.splitDescriptionFree" : "settings.splitDescription",
        {
          bitcoin: percent(BITCOIN_FEE_PERCENT),
          free: percent(0),
          date: bitcoinFeeFreeUntilText(languageTag),
          fiat: mtPelerinFeeRangeText(t, languageTag)
        }
      )}
    >
      <View
        style={styles.bar}
        accessible
        accessibilityLabel={
          hasFiat
            ? t("settings.rubrics.splitLabel", {
                bitcoin: percent(settings.bitcoinPercent),
                fiat: percent(fiatPercent),
                currency: settings.payoutCurrency
              })
            : t("settings.allBitcoin")
        }
        testID="split-summary"
      >
        {settings.bitcoinPercent > 0 ? (
          <View style={[styles.block, { flex: settings.bitcoinPercent }]}>
            <Text numberOfLines={1} style={styles.blockText}>
              {percent(settings.bitcoinPercent)} {t("split.bitcoin").toLocaleLowerCase()}
            </Text>
          </View>
        ) : null}
        {hasFiat ? (
          <View
            style={[
              styles.block,
              styles.fiatBlock,
              { flex: fiatPercent, backgroundColor: fiatFill }
            ]}
          >
            <Text numberOfLines={1} style={styles.blockText}>
              {percent(fiatPercent)} {settings.payoutCurrency}
            </Text>
          </View>
        ) : null}
      </View>
      <SettingsCard>
        <SettingsRow
          icon="circle-half-stroke"
          label={t("settings.split")}
          value={
            hasFiat
              ? t("settings.splitShort", {
                  percent: percent(fiatPercent),
                  currency: settings.payoutCurrency
                })
              : t("settings.allBitcoin")
          }
          onPress={openSplit}
          separated
          testID="split-row"
        />
        <SettingsRow
          icon="landmark"
          label={t("settings.bankAccount")}
          value={
            iban !== null
              ? shortIban(iban)
              : hasFiat && settings.payoutAccountId !== null
                ? t("settings.bankAtMtPelerin")
                : t("settings.noBankAccount")
          }
          onPress={openBank}
          testID="bank-row"
        />
      </SettingsCard>
    </SettingBlock>
  );
}

/**
 * "Network": the relays with their lights, the Bitcoin node, the product lookup. A phone edits the
 * relays and the node on pages of their own, a computer in dialogs.
 */
export function NetworkRubric({
  settings,
  cardHolder
}: {
  settings: MerchantSettings;
  cardHolder: boolean;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  const router = useRouter();
  const desktop = useIsDesktop();
  const [editing, setEditing] = useState(false);
  const [editingNode, setEditingNode] = useState(false);
  // The lights of the saved relays: tested once when shown.
  useTestOnce(settings.relays);
  const saveRelays = useAccountRelaysSave();
  const notice = useIntegrationsRelaysNotice(editing);
  const node = settings.bitcoinNode;
  return (
    <>
      <SettingBlock title={t("settings.relays")} description={t("settings.relaysDescription")}>
        <ReadOnlyRelays
          relays={settings.relays}
          rowHeight={28}
          style={styles.relays}
          testID="relays-summary"
        />
        <View style={styles.buttonRow}>
          <Button
            variant="secondary"
            size="md"
            icon="pen"
            fullWidth={false}
            // A phone edits them on a screen of their own, a computer in a dialog.
            onPress={() => (desktop ? setEditing(true) : router.push("/settings/relays"))}
            testID="edit-relays"
          >
            {t("settings.rubrics.editRelays")}
          </Button>
        </View>
        <RelaysDialog
          visible={editing}
          onClose={() => setEditing(false)}
          saved={settings.relays}
          onSave={saveRelays}
          notice={notice}
        />
      </SettingBlock>
      {/* A merchant's: a card holder's account has no point of
          sale whose payments a node follows, nor a catalogue. */}
      {cardHolder ? null : (
        <SettingBlock title={t("settings.node.title")} description={t("settings.node.description")}>
          <SettingsCard>
            <SettingsRow
              icon={node ? "server" : "globe"}
              label={node ? t("settings.node.ownTitle") : t("settings.node.mempoolTitle")}
              caption={node ? hostOf(node.url) : t("settings.node.mempoolCaption")}
              trailing={
                node && isPlainHttp(node.url) ? (
                  <StatusPill state="underpaid" label="HTTP" size="sm" sign="warning" />
                ) : undefined
              }
              // A phone opens its page, a computer a dialog, as the relays.
              onPress={() => (desktop ? setEditingNode(true) : router.push("/settings/node"))}
              testID="node-row"
            />
          </SettingsCard>
          <BitcoinNodeDialog
            visible={editingNode}
            onClose={() => setEditingNode(false)}
            saved={node}
          />
        </SettingBlock>
      )}
      {cardHolder ? null : <ProductLookupSetting settings={settings} />}
    </>
  );
}

/** The node's address without its scheme, as the row shows it: "192.168.1.20:3006". */
function hostOf(url: string): string {
  return url.replace(/^https?:\/\//, "");
}

/**
 * "Look up scanned products": whether a product scanned
 * into the catalogue is looked up on Open Food Facts. Saved live, as "On-chain payments".
 */
function ProductLookupSetting({ settings }: { settings: MerchantSettings }) {
  const { t } = useTranslation();
  const fail = useSettingsFailure();
  const saved = useSettingsSaved();
  // The value being saved, shown meanwhile: the switch waits.
  const [lookup, setLookup] = useState<boolean | null>(null);
  const toggle = (value: boolean) => {
    setLookup(value);
    changeProductLookup(value)
      .then(
        (changed) =>
          saved(
            "settings-product-lookup",
            t("settings.productLookup.savedTitle"),
            t(
              changed.productLookup
                ? "settings.productLookup.savedOn"
                : "settings.productLookup.savedOff"
            )
          ),
        (error: unknown) => fail(error, "settings-product-lookup")
      )
      .finally(() => setLookup(null));
  };
  return (
    <SettingBlock title={t("settings.productLookup.section")}>
      <SettingsCard>
        <SettingsRow
          icon="barcode"
          label={t("settings.productLookup.title")}
          caption={t("settings.productLookup.caption")}
          trailing={
            <Switch
              value={lookup ?? settings.productLookup}
              onValueChange={toggle}
              label={t("settings.productLookup.title")}
              loading={lookup !== null}
              testID="product-lookup-switch"
            />
          }
          wrap
          testID="product-lookup-row"
        />
      </SettingsCard>
    </SettingBlock>
  );
}

/**
 * "Security": the wallet's recovery phrase and its yearly check ("Check my 12 words"), then the
 * app's own lock (the apps only; never a card holder's).
 */
export function SecurityRubric({ cardHolder = false }: { cardHolder?: boolean }) {
  const styles = useStyles();
  const { t } = useTranslation();
  const router = useRouter();
  const desktop = useIsDesktop();
  // "Ask for biometrics to unlock the app", this device's choice (app-lock/).
  const appLock = useAppLockSwitch(usePos().profile, true);
  return (
    <>
      <SettingBlock
        title={t("settings.recovery.title")}
        description={t("settings.recovery.description")}
      >
        <View style={desktop ? styles.securityButtonsDesktop : styles.securityButtons}>
          <Button
            variant="secondary"
            size="md"
            icon="key"
            fullWidth={!desktop}
            onPress={() => router.push("/settings/recovery")}
            testID="recovery-open"
          >
            {t("settings.recovery.open")}
          </Button>
          <Button
            variant="secondary"
            size="md"
            icon="circle-check"
            fullWidth={!desktop}
            onPress={() => router.push("/settings/recovery-check")}
            testID="recovery-check-open"
          >
            {t("recoveryCheck.banner.action")}
          </Button>
        </View>
      </SettingBlock>
      {appLock.visible && !cardHolder ? (
        <SettingBlock
          title={t("settings.unlock.section")}
          description={t("settings.unlock.description")}
        >
          <SettingsCard>
            <SettingsRow
              icon="fingerprint"
              label={t("settings.unlock.title")}
              caption={appLock.caption}
              trailing={appLock.control}
              wrap
              testID="unlock-asks-row"
            />
          </SettingsCard>
        </SettingBlock>
      ) : null}
    </>
  );
}

/**
 * "Log out", confirmed. A computer: at the right of "Settings"' title, where the till's
 * "Unlock" is; a phone: at the bottom of "Settings", under "Account".
 */
export function LogoutButton({ cardHolder }: { cardHolder: boolean }) {
  const { t } = useTranslation();
  const desktop = useIsDesktop();
  const { notify } = useNotifications();
  const [confirming, setConfirming] = useState(false);
  // "Ask for biometrics…" is one of the device's choices "Log out" loses (the apps).
  const appLock = useAppLockSwitch(usePos().profile, true);
  const logout = () => {
    setConfirming(false);
    signOut().catch((error: unknown) => {
      logFailure("Signing out failed", error);
      notify({
        tone: "error",
        title: t("settings.failedTitle"),
        body: t("settings.errors.logoutFailed"),
        key: "settings"
      });
    });
  };
  return (
    <>
      <Button
        variant="destructiveSolid"
        size="md"
        icon="arrow-right-from-bracket"
        fullWidth={!desktop}
        onPress={() => setConfirming(true)}
        testID="logout"
      >
        {t("settings.logout")}
      </Button>
      <ConfirmDialog
        visible={confirming}
        title={t("settings.logoutTitle")}
        body={t(
          cardHolder
            ? "settings.logoutBodyCard"
            : appLock.visible
              ? "settings.logoutBody"
              : "settings.logoutBodyWeb"
        )}
        confirmLabel={t("settings.logoutConfirm")}
        cancelLabel={t("settings.back")}
        onConfirm={logout}
        onCancel={() => setConfirming(false)}
        testID="logout-dialog"
        confirmTestID="logout-confirm"
      />
    </>
  );
}

/**
 * "Account": "Delete account" (DeleteAccount.tsx), after a v2 account's settings. A
 * computer's tab; on a phone, always at the bottom of "Settings".
 * "Log out" is apart (LogoutButton).
 */
export function AccountActions({ cardHolder }: { cardHolder: boolean }) {
  const styles = useStyles();
  const { t } = useTranslation();
  const desktop = useIsDesktop();
  // "Old Swiss Bitcoin Pay account": a v2 account still to freeze (LegacyFreezeSetting.tsx);
  // "Swiss Bitcoin Pay history": a merchant's v2 history to copy (LegacyHistorySetting.tsx).
  const history = cardHolder ? null : (
    <>
      <LegacyFreezeSetting />
      <LegacyHistorySetting />
    </>
  );
  if (!desktop) {
    return (
      <View style={styles.mobileActions}>
        {history}
        <DeleteAccount fullWidth cardHolder={cardHolder} />
      </View>
    );
  }
  return (
    <>
      {history}
      {/* The deletion of the account, last. */}
      <SettingBlock
        title={t("settings.delete.section")}
        description={t(
          cardHolder ? "settings.delete.card.description" : "settings.delete.description"
        )}
      >
        <View style={styles.buttonRow}>
          <DeleteAccount fullWidth={false} cardHolder={cardHolder} style={styles.desktopDelete} />
        </View>
      </SettingBlock>
    </>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  logoRow: { flexDirection: "row", alignItems: "center", gap: space[7] },
  nameField: { maxWidth: 420 },
  select: { maxWidth: 420 },
  // As wide as its two segments, at the left as the field above it.
  unitControl: { alignSelf: "flex-start" },
  buttonRow: { flexDirection: "row" },
  securityButtons: { gap: 10 },
  securityButtonsDesktop: { flexDirection: "row", gap: 10 },
  bar: {
    flexDirection: "row",
    height: 56,
    borderRadius: radius.md,
    overflow: "hidden"
  },
  block: {
    justifyContent: "center",
    paddingHorizontal: space[6],
    backgroundColor: palette.orange
  },
  fiatBlock: { alignItems: "flex-end" },
  blockText: { ...sans(700), fontSize: type.body, color: colors.text.onAccent },
  relays: { paddingVertical: 10, paddingHorizontal: 18 },
  mobileActions: { gap: space[6] },
  desktopDelete: { minWidth: 260 }
}));
