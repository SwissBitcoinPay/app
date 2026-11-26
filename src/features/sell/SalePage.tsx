import type { TFunction } from "i18next";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { formatClock } from "@/components/ui/Countdown";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { Lead, ScreenTitle } from "@/components/ui/Heading";
import { Icon } from "@/components/ui/Icon";
import { ListRow } from "@/components/ui/ListRow";
import { TextField } from "@/components/ui/TextField";
import { UnitSwitch } from "@/components/ui/UnitSwitch";
import {
  SELL_ESTIMATE_DELAY_MS,
  SELL_MIN_WIRED_MINOR,
  SELL_RATE_REFRESH_MS,
  SELL_TRANSFER_FEE,
  SPLIT_PAYOUT_THRESHOLD_CHF_MINOR
} from "@/config/mtpelerin";
import { getAccountSettings } from "@/features/account/session";
import { usePos } from "@/features/terminal/pos";
import { fiatPlaceholder, parseFiatMinor, parseSats } from "@/features/wallet/send/amount";
import { formatInteger } from "@/lib/locale/format";
import { logFailure } from "@/lib/log/log";
import { maskedIban, ownerNameText } from "@/lib/mtpelerin/accounts";
import { btcPriceOf, decimalToMinor, minorToSats, type MtpDecimal } from "@/lib/mtpelerin/decimal";
import {
  chfLeftMinor,
  isIdentified,
  limitsFrom,
  MONTH_DAYS,
  productMinor,
  sellLimits,
  type LimitUse,
  type SellLimits
} from "@/lib/mtpelerin/limits";
import { payoutProgress } from "@/lib/mtpelerin/payout";
import { heldMinor, transferFeeMinor, wiresSomething } from "@/lib/mtpelerin/transfer-fee";
import type { MtpBankAccount } from "@/lib/mtpelerin/types";
import { currencyDigits, formatFiat } from "@/lib/terminal/amount";
import { makeStyles, mono, palette, radius, sans, type, useTheme } from "@/theme";

import type { SaleEstimate, SaleQuote, SellFlow, SellReady } from "./flow";
import {
  Card,
  DeferredNote,
  Dual,
  Iban,
  IncompleteAddress,
  Rows,
  SellBody,
  feeTexts,
  transferThresholdText,
  fiatText,
  receivedText,
  salePaymentFailureText,
  satsAtRate,
  satsText,
  timeText
} from "./parts";
import { useSellNav } from "./SellSheet";

/*
 * A sale, in "Sell"'s panel: the amount typed as
 * "Send" types it (in the display currency or in sats), an amount in the display currency
 * being what is sold, worth that at Mt Pelerin's own rate before its fees (its sats rounded up,
 * `useSaleRate`): never at the app's rate, which is not the one Mt Pelerin buys at (a sale of
 * 1.30 CHF at the app's rate was "You receive about 1.32 CHF"). Then Mt Pelerin's estimate
 * of it ("about": its fees in the sale's currency and in sats), Mt Pelerin's transfer
 * fee of a sale wired at once below its threshold (transfer-fee.ts: left out of its estimate,
 * taken from what is received), the bank account ("Change": the
 * accounts, a page of the panel), the "Transfer" chosen (with what Mt Pelerin already holds for the
 * account's deferred sells, `PendingGauge`), what is left to sell without an identity verification
 * the last 30 days and this year (from the orders, limits.ts: `LimitMeter`); then "See the quote":
 * the order created, its
 * rate locked 60 minutes, checked and its invoice prepared (flow.ts), a page over this one.
 * "Sell" asks the passkey, pays, and the panel shows the sale sold (OrderPage). An amount
 * above the balance, or above what the limits leave when the sale is in CHF, is refused at the
 * field. No "Sell everything": the Lightning fees of a sale are known only once its invoice exists.
 * What is typed stays the panel's (`draft`) while the quote or another page shows over it.
 */

/** The last estimate answered, for the amount and account of `key`; null: its call failed. */
type EstimateRead = { key: string; estimate: SaleEstimate | null };

/** Mt Pelerin's price of 1 sat in the display currency, as `useSaleRate` read it. */
type RateRead = { state: "loading" } | { state: "ready"; rate: MtpDecimal } | { state: "failed" };

/**
 * Mt Pelerin's price of 1 sat in `currency` (flow.ts `rate`), read as the sale shows and again
 * every SELL_RATE_REFRESH_MS. A later read that fails keeps the rate read before (the estimate of
 * the amount, and then the order, are read anew anyway: they tell what is sold and received); none
 * read: "failed", and amounts are typed in sats only, as during the app's own rates' outage.
 */
function useSaleRate(flow: SellFlow, currency: string): RateRead {
  const [read, setRead] = useState<{ currency: string; read: RateRead } | null>(null);
  useEffect(() => {
    let live = true;
    const failed = (previous: { currency: string; read: RateRead } | null) =>
      previous?.currency === currency && previous.read.state === "ready"
        ? previous
        : { currency, read: { state: "failed" } as const };
    const load = () => {
      flow.rate(currency).then(
        (rate) => {
          if (rate === null) logFailure("Mt Pelerin's estimate gave no rate");
          if (live) {
            setRead((previous) =>
              rate === null ? failed(previous) : { currency, read: { state: "ready", rate } }
            );
          }
        },
        (error: unknown) => {
          logFailure("Reading Mt Pelerin's rate failed", error, false);
          if (live) setRead(failed);
        }
      );
    };
    load();
    const timer = setInterval(load, SELL_RATE_REFRESH_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [flow, currency]);
  return read?.currency === currency ? read.read : { state: "loading" };
}

/**
 * What Mt Pelerin holds for the sale's bank account from its deferred sells, in its minor
 * units, as read for `accountId`: null while read, "failed" when it could not be.
 */
type HeldRead = { accountId: string; minor: number | "failed" };

/** What the estimate's lines show for the amount typed. */
type Estimate =
  { state: "loading" } | { state: "ready"; estimate: SaleEstimate } | { state: "failed" };

/**
 * The account a sale goes to: the one chosen, else the settings' ("Settings › Bank account"
 * chose it: `payoutAccountId`, Mt Pelerin's id of it), else the first in the settings' payout
 * currency (an account of format 17, whose account is to choose again), else the first.
 */
export function saleAccount(ready: SellReady, chosenId: string | null): MtpBankAccount {
  const settings = getAccountSettings();
  const settingsId = settings?.payoutAccountId ?? null;
  return (
    ready.accounts.find((account) => account.id === chosenId) ??
    ready.accounts.find((account) => account.id === settingsId) ??
    ready.accounts.find((account) => account.currency === settings?.payoutCurrency) ??
    ready.accounts[0]!
  );
}

export function SalePage({ ready }: { ready: SellReady }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { flow, draft, setDraft, push } = useSellNav();
  const { digits, languageTag, profile } = usePos();
  const saleRate = useSaleRate(flow, profile.currency);
  // No rate of Mt Pelerin's to convert francs: sats only (never the app's rate, see above).
  const fiatAvailable = saleRate.state !== "failed";
  const unit = fiatAvailable ? (draft.unit ?? "fiat") : "sats";
  // Francs typed before the rate went: not read as sats.
  const text = unit === (draft.unit ?? unit) ? draft.text : "";
  const account = saleAccount(ready, draft.accountId);
  const identified = isIdentified(ready.person);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [limits, setLimits] = useState<SellLimits | null>(null);
  const [held, setHeld] = useState<HeldRead | null>(null);
  const [estimate, setEstimate] = useState<EstimateRead | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [issue, setIssue] = useState<string | null>(null);

  const fiatMinor = unit === "fiat" ? parseFiatMinor(text, digits) : null;
  const sats: bigint | null =
    unit === "sats"
      ? parseSats(text)
      : fiatMinor !== null && saleRate.state === "ready"
        ? minorToSats(fiatMinor, digits, saleRate.rate)
        : null;
  // An amount typed in the display currency while Mt Pelerin's rate is read: "Calculating…".
  const converting =
    unit === "fiat" && fiatMinor !== null && fiatMinor > 0 && saleRate.state === "loading";
  const key = sats !== null && sats > 0n ? `${sats}:${account.id}` : null;

  // The balance and the year's orders, once: "Available", what is left of the month.
  useEffect(() => {
    let live = true;
    flow.balance().then(
      (read) => live && setBalance(read),
      (error: unknown) => logFailure("Reading the balance to sell failed", error, false)
    );
    // Identified at Mt Pelerin: its limits without an identity verification no longer hold.
    if (!identified) {
      flow.orders(limitsFrom(new Date()) * 1000).then(
        (orders) => live && setLimits(sellLimits(orders, new Date())),
        (error: unknown) => logFailure("Reading the sales' limits failed", error, false)
      );
    }
    return () => {
      live = false;
    };
  }, [flow, identified]);
  const leftMinor = limits === null ? null : chfLeftMinor(limits);

  // What Mt Pelerin already holds for the account's deferred sells ("Deferred"),
  // read for each account chosen: never 0 before it is read.
  useEffect(() => {
    let live = true;
    flow.balances(account).then(
      (balances) =>
        live &&
        setHeld({
          accountId: account.id,
          minor: heldMinor(balances, account.currency) ?? "failed"
        }),
      (error: unknown) => {
        logFailure("Reading the deferred sales' balance failed", error, false);
        if (live) setHeld({ accountId: account.id, minor: "failed" });
      }
    );
    return () => {
      live = false;
    };
  }, [flow, account]);
  const heldNow = held?.accountId === account.id ? held.minor : null;

  // The estimate of the amount typed, once the keys pause; a newer amount drops an older answer.
  const latest = useRef<string | null>(null);
  useEffect(() => {
    latest.current = key;
    if (key === null || sats === null) return;
    const timer = setTimeout(() => {
      flow.estimateSale(sats, account.currency).then(
        (read) => {
          if (latest.current === key) setEstimate({ key, estimate: read });
        },
        (error: unknown) => {
          logFailure("Estimating a sale failed", error, false);
          if (latest.current === key) setEstimate({ key, estimate: null });
        }
      );
    }, SELL_ESTIMATE_DELAY_MS);
    return () => clearTimeout(timer);
    // `sats` and `account.currency` are part of `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, flow]);

  // An answer of another amount or account is no answer: this one's is awaited.
  const shown: Estimate | null = converting
    ? { state: "loading" }
    : key === null
      ? null
      : estimate?.key !== key
        ? { state: "loading" }
        : estimate.estimate === null
          ? { state: "failed" }
          : { state: "ready", estimate: estimate.estimate };
  const sale = shown?.state === "ready" ? shown.estimate : null;
  const read = sale?.estimate ?? null;
  // Mt Pelerin's transfer fee, as "Transfer" is chosen; null: not told (the francs not read).
  const transferFee =
    sale === null
      ? null
      : transferFeeMinor({
          deferred: draft.deferred,
          currency: account.currency,
          rate: sale.estimate.rate,
          chf: sale.chf
        });
  const fees = read
    ? feeTexts(
        read.fees,
        { currency: account.currency, sourceCurrency: read.sourceCurrency, rate: read.rate },
        languageTag
      )
    : null;
  const receiveText =
    read && transferFee !== null
      ? receivedText(read.destAmount, account.currency, transferFee, languageTag)
      : null;
  // What the sale counts against the limits, fees included: CHF only, its sats at the
  // estimate's rate before fees.
  const grossMinor =
    read && account.currency === "CHF" && read.rate !== null
      ? productMinor(read.sourceAmount, read.rate)
      : null;

  const aboveBalance = sats !== null && balance !== null && sats > balance;
  const aboveLimit = grossMinor !== null && leftMinor !== null && grossMinor > leftMinor;
  // A sale leaves the merchant something, never 0 (SELL_MIN_WIRED_MINOR): told from Mt Pelerin's
  // estimate, its fees and the transfer fee taken; the order is checked again before it is paid
  // (checkSellOrder). Said at "You receive about", where its 0 shows, not at the field: the
  // amount typed is not wrong by itself, the transfer fee chosen may take it all.
  const tooSmall =
    read !== null &&
    transferFee !== null &&
    !wiresSomething(read.destAmount, account.currency, transferFee);
  const error = aboveBalance
    ? t("sell.sale.aboveBalance")
    : aboveLimit && leftMinor !== null
      ? t("sell.sale.aboveMax", { amount: fiatText(leftMinor, "CHF", languageTag) })
      : null;
  const canQuote =
    key !== null &&
    read !== null &&
    transferFee !== null &&
    error === null &&
    !tooSmall &&
    !quoting;

  const askQuote = async () => {
    if (sats === null) return;
    setQuoting(true);
    setIssue(null);
    try {
      const result = await flow.quoteSale(sats, account, { deferred: draft.deferred });
      if (result.ok) push({ name: "quote", quote: result.quote });
      else setIssue(quoteIssueText(t, result.issue));
    } catch (failure) {
      logFailure("Quoting a sale failed", failure, false);
      setIssue(t("sell.failures.server"));
    } finally {
      setQuoting(false);
    }
  };

  const switchUnit = () => {
    if (!fiatAvailable) return;
    setDraft({ ...draft, text: "", unit: unit === "fiat" ? "sats" : "fiat" });
  };

  return (
    <SellBody
      footer={
        <Button
          disabled={!canQuote}
          loading={quoting}
          onPress={() => void askQuote()}
          testID="sell-quote"
        >
          {t("sell.sale.quote")}
        </Button>
      }
      testID="sell-sale"
    >
      <View style={styles.amount}>
        <TextField
          label={t("sell.sale.amount")}
          value={text}
          onChangeText={(value) => {
            setIssue(null);
            setDraft({ ...draft, text: value, unit });
          }}
          placeholder={unit === "fiat" ? fiatPlaceholder(digits, languageTag) : "0"}
          keyboardType={unit === "fiat" ? "decimal-pad" : "number-pad"}
          inputMode={unit === "fiat" ? "decimal" : "numeric"}
          error={error}
          trailing={
            <UnitSwitch
              unit={unit === "fiat" ? profile.currency : "sats"}
              label={
                unit === "fiat"
                  ? t("wallet.sendSheet.switchToSats")
                  : t("wallet.sendSheet.switchToFiat", { currency: profile.currency })
              }
              enabled={fiatAvailable}
              onPress={switchUnit}
              testID="sell-unit"
            />
          }
          testID="sell-amount"
        />
        <View style={styles.amountSub}>
          <Text style={styles.caption} testID="sell-equivalent">
            {unit === "fiat" && sats !== null ? satsText(sats, languageTag) : ""}
          </Text>
          {balance !== null ? (
            <Text style={styles.caption} numberOfLines={1} testID="sell-available">
              {t("sell.sale.available", { amount: satsText(balance, languageTag) })}
            </Text>
          ) : null}
        </View>
      </View>

      <Card>
        <ListRow inset={0} onPress={() => push({ name: "chooseAccount" })} testID="sell-account">
          <View style={styles.accountRow}>
            <Icon name="landmark" size={18} color={colors.text.accent} />
            <View style={styles.accountTexts}>
              <Text style={styles.accountName}>{ownerNameText(account.owner.name)}</Text>
              <Iban>{maskedIban(account.iban)}</Iban>
              <IncompleteAddress account={account} />
            </View>
            <Text style={styles.change}>{t("sell.sale.change")}</Text>
          </View>
        </ListRow>
      </Card>

      <TransferChoice
        currency={account.currency}
        deferred={draft.deferred}
        onChange={(deferred) => setDraft({ ...draft, deferred })}
        pending={
          <PendingGauge
            currency={account.currency}
            held={heldNow}
            // What this sale adds, as Mt Pelerin estimates it (its `dest_amount`): only when it is
            // deferred; wired at once, it joins nothing held.
            sale={
              !draft.deferred || read === null
                ? null
                : decimalToMinor(read.destAmount, currencyDigits(account.currency), "down")
            }
          />
        }
      />

      <View style={styles.estimate}>
        <Rows
          rows={[
            {
              label: t("sell.sale.fee"),
              value: estimateValue(shown, t) ?? (
                <Dual fiat={fees?.fiat ?? null} sats={fees?.sats ?? null} />
              ),
              testID: "sell-fee"
            },
            {
              label: t("sell.sale.transferFee"),
              // A deferred sell pays no transfer fee of its own: none to tell, rather than
              // "0.00 CHF".
              value: draft.deferred
                ? "—"
                : (estimateValue(shown, t) ??
                  (transferFee === null
                    ? t("sell.sale.estimateFailed")
                    : fiatText(transferFee, account.currency, languageTag))),
              testID: "sell-transfer-fee"
            },
            {
              label: t("sell.sale.receive"),
              value: estimateValue(shown, t) ?? receiveText ?? t("sell.sale.estimateFailed"),
              danger: tooSmall,
              testID: "sell-receive"
            }
          ]}
        />
        {tooSmall ? (
          <ErrorMessage testID="sell-too-small">
            {t("sell.sale.tooSmall", {
              amount: fiatText(SELL_MIN_WIRED_MINOR, account.currency, languageTag)
            })}
          </ErrorMessage>
        ) : null}
      </View>

      {account.currency === "CHF" && limits !== null ? (
        <View style={styles.limits} testID="sell-sale-limits">
          <Text style={styles.choiceLabel}>{t("sell.sale.limitsTitle")}</Text>
          <LimitMeter
            label={t("sell.limits.month", { days: MONTH_DAYS })}
            use={limits.month}
            testID="sell-sale-limit-month"
          />
          <LimitMeter
            label={t("sell.limits.year")}
            use={limits.year}
            testID="sell-sale-limit-year"
          />
          <Pressable
            accessibilityRole="link"
            onPress={() => push({ name: "limits" })}
            style={styles.limitsLink}
            testID="sell-limits-open"
          >
            <Text style={styles.link}>{t("sell.sale.seeLimits")}</Text>
            <Icon name="arrow-right" size={13} color={colors.text.accent} />
          </Pressable>
        </View>
      ) : null}

      {issue ? <ErrorMessage testID="sell-quote-issue">{issue}</ErrorMessage> : null}
    </SellBody>
  );
}

/**
 * The estimate's line while it is not there: "—", "Calculating…", "Unavailable"; null once read.
 */
function estimateValue(shown: Estimate | null, t: TFunction): string | null {
  if (shown === null) return "—";
  if (shown.state === "loading") return t("sell.sale.estimating");
  if (shown.state === "failed") return t("sell.sale.estimateFailed");
  return null;
}

/** Why an order made for a sale is not paid (flow.ts `quoteSale`), as the panel says it. */
export function quoteIssueText(t: TFunction, issue: string): string {
  if (issue === "unaffordable") return t("sell.quote.unaffordable");
  if (issue === "orderExpired" || issue === "expired") return t("sell.quote.expired");
  if (issue === "nothingWired") return t("sell.quote.nothingWired");
  return t("sell.quote.otherOrder");
}

/** "To which account?": the bank accounts, the one of the sale checked. */
export function ChooseAccountPage() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { state, draft, setDraft, pop, push } = useSellNav();
  if (state.view.name !== "ready") return null;
  const { ready } = state.view;
  const chosen = saleAccount(ready, draft.accountId);
  return (
    <SellBody
      footer={
        <Button
          variant="secondary"
          icon="plus"
          onPress={() => push({ name: "accountForm" })}
          testID="sell-add-account"
        >
          {t("sell.sale.addAccount")}
        </Button>
      }
      testID="sell-choose-account"
    >
      <Card>
        {ready.accounts.map((entry, index) => (
          <ListRow
            inset={0}
            key={entry.id}
            accessibilityRole="radio"
            accessibilityState={{ checked: entry.id === chosen.id }}
            onPress={() => {
              setDraft({ ...draft, accountId: entry.id });
              pop();
            }}
            testID={`sell-account-${index}`}
          >
            <View style={[styles.accountRow, index > 0 && styles.divided]}>
              <Icon name="landmark" size={18} color={colors.text.accent} />
              <View style={styles.accountTexts}>
                <Text style={styles.accountName}>{ownerNameText(entry.owner.name)}</Text>
                <Iban>{`${maskedIban(entry.iban)} · ${entry.currency}`}</Iban>
                <IncompleteAddress account={entry} />
              </View>
              <View style={[styles.radio, entry.id === chosen.id && styles.radioOn]} />
            </View>
          </ListRow>
        ))}
      </Card>
    </SellBody>
  );
}

/**
 * "Transfer": the sale wired
 * at once, with Mt Pelerin's transfer fee below its threshold, or with the bank account's other
 * deferred sells, wired together and without that fee once they reach it. Two rows chosen
 * as "To which account?" chooses.
 */
function TransferChoice({
  currency,
  deferred,
  onChange,
  pending
}: {
  currency: string;
  deferred: boolean;
  onChange: (deferred: boolean) => void;
  /** Under "Deferred": what Mt Pelerin already holds. */
  pending: ReactNode;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  const { languageTag } = usePos();
  const feeThreshold = transferThresholdText(
    t,
    currency,
    languageTag,
    SELL_TRANSFER_FEE.belowChfMinor
  );
  const threshold = transferThresholdText(t, currency, languageTag);
  const fee = (SELL_TRANSFER_FEE.currencies as readonly string[]).includes(currency)
    ? fiatText(SELL_TRANSFER_FEE.minor, currency, languageTag)
    : t("sell.sale.equivalentOf", {
        amount: fiatText(SELL_TRANSFER_FEE.minor, "CHF", languageTag)
      });
  const options = [
    {
      value: false,
      title: t("sell.sale.transferNow"),
      note: t("sell.sale.transferNowNote", { fee, threshold: feeThreshold }),
      testID: "sell-transfer-now"
    },
    {
      value: true,
      title: t("sell.sale.transferLater"),
      note: t("sell.sale.transferLaterNote", { threshold }),
      testID: "sell-transfer-later"
    }
  ];
  return (
    <View style={styles.choice}>
      <Text style={styles.choiceLabel}>{t("sell.sale.transfer")}</Text>
      <Card>
        {options.map((option, index) => (
          <ListRow
            inset={0}
            key={option.testID}
            accessibilityRole="radio"
            accessibilityState={{ checked: option.value === deferred }}
            onPress={() => onChange(option.value)}
            testID={option.testID}
          >
            <View
              style={[
                styles.accountRow,
                index > 0 && styles.divided,
                option.value && styles.optionTop
              ]}
            >
              <View style={styles.accountTexts}>
                <Text style={styles.accountName}>{option.title}</Text>
                <Text style={styles.caption}>{option.note}</Text>
                {option.value ? pending : null}
              </View>
              <View style={[styles.radio, option.value === deferred && styles.radioOn]} />
            </View>
          </ListRow>
        ))}
      </Card>
    </View>
  );
}

/**
 * "Pending": what Mt Pelerin already holds for the
 * account's deferred sells (`held`) and what this sale adds (`sale`, its estimate; null when it is
 * wired at once or not estimated yet: neither drawn nor told), on
 * the way to the threshold of their one transfer (SPLIT_PAYOUT_THRESHOLD_CHF_MINOR). A gauge in
 * CHF only: Mt Pelerin's threshold in another currency is "the equivalent of 50 CHF" at a rate it
 * does not say, so there the amounts are told without it. Not read yet or not readable: said so,
 * never a gauge at 0.
 */
function PendingGauge({
  currency,
  held,
  sale
}: {
  currency: string;
  held: number | "failed" | null;
  sale: number | null;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  const { languageTag } = usePos();
  const digits = currencyDigits(currency);
  const amount = (minor: number) => formatFiat(minor, digits, languageTag);
  const known = typeof held === "number";
  const added = sale ?? 0;
  const total = known ? held + added : 0;
  const threshold = SPLIT_PAYOUT_THRESHOLD_CHF_MINOR;
  // In CHF only (payoutProgress); its shares of the track for its drawing only, never an amount.
  const progress = known ? payoutProgress(held, added, currency) : null;
  const gauge = progress !== null;
  const heldShare = progress?.heldShare ?? 0;
  const saleShare = progress?.saleShare ?? 0;
  const figure =
    held === null
      ? t("sell.sale.estimating")
      : held === "failed"
        ? t("sell.sale.estimateFailed")
        : gauge
          ? `${amount(total)} / ${fiatText(threshold, "CHF", languageTag)}`
          : fiatText(total, currency, languageTag);
  return (
    <View style={styles.pending} testID="sell-pending">
      <View style={styles.pendingLine}>
        <Text style={styles.pendingTitle}>{t("sell.sale.pending")}</Text>
        <Text style={styles.pendingFigure} testID="sell-pending-total">
          {figure}
        </Text>
      </View>
      {gauge && known ? (
        <View
          style={styles.track}
          accessibilityRole="progressbar"
          accessibilityLabel={
            sale === null
              ? t("sell.sale.pendingGaugeHeld", {
                  balance: fiatText(held, currency, languageTag),
                  threshold: fiatText(threshold, "CHF", languageTag)
                })
              : t("sell.sale.pendingGauge", {
                  balance: fiatText(held, currency, languageTag),
                  sale: fiatText(sale, currency, languageTag),
                  threshold: fiatText(threshold, "CHF", languageTag)
                })
          }
          accessibilityValue={{ min: 0, max: threshold, now: Math.min(total, threshold) }}
          testID="sell-pending-gauge"
        >
          <View style={[styles.trackHeld, { width: `${heldShare * 100}%` }]} />
          <View style={[styles.trackSale, { width: `${saleShare * 100}%` }]} />
        </View>
      ) : null}
      {known ? (
        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.swatch, styles.trackHeld]} />
            <Text style={styles.legendText} testID="sell-pending-held">
              {t("sell.sale.pendingBalance", { amount: amount(held) })}
            </Text>
          </View>
          {sale !== null ? (
            <View style={styles.legendItem}>
              <View style={[styles.swatch, styles.trackSale]} />
              <Text style={styles.legendText} testID="sell-pending-sale">
                {t("sell.sale.pendingSale", { amount: amount(sale) })}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/**
 * A period's limit without an identity verification:
 * what is left of it and the limit, its gauge under; "—" when the period cannot be valued in
 * francs (limits.ts), and no gauge then.
 */
function LimitMeter({ label, use, testID }: { label: string; use: LimitUse; testID: string }) {
  const styles = useStyles();
  const { t } = useTranslation();
  const { languageTag } = usePos();
  const { usedMinor, limitMinor } = use;
  const limit = fiatText(limitMinor, "CHF", languageTag);
  return (
    <View style={styles.meter} testID={testID}>
      <View style={styles.pendingLine}>
        <Text style={styles.meterLabel}>{label}</Text>
        <Text style={styles.meterFigure}>
          {usedMinor === null
            ? `— / ${limit}`
            : t("sell.sale.limitLeft", {
                left: fiatText(Math.max(0, limitMinor - usedMinor), "CHF", languageTag),
                limit
              })}
        </Text>
      </View>
      {usedMinor === null ? null : (
        <View
          style={styles.track}
          accessibilityRole="progressbar"
          accessibilityLabel={label}
          accessibilityValue={{ min: 0, max: limitMinor, now: Math.min(usedMinor, limitMinor) }}
        >
          <View
            style={[styles.trackHeld, { width: `${Math.min(1, usedMinor / limitMinor) * 100}%` }]}
          />
        </View>
      )}
    </View>
  );
}

/** Seconds left until `deadline` (Unix seconds), at least 0; ticks every second. */
export function useSecondsLeft(deadline: number): number {
  const [tick, setTick] = useState(() => ({ deadline, seconds: secondsUntil(deadline) }));
  useEffect(() => {
    const timer = setInterval(() => setTick({ deadline, seconds: secondsUntil(deadline) }), 1000);
    return () => clearInterval(timer);
  }, [deadline]);
  // A new deadline (an order just made) is counted at once, never shown with the previous one's
  // seconds until the next tick (0 before any order: "expired" for an order just made).
  return tick.deadline === deadline ? tick.seconds : secondsUntil(deadline);
}

/** The seconds from now to `deadline` (Unix seconds), 0 once passed. */
function secondsUntil(deadline: number): number {
  return Math.max(0, deadline - Math.floor(Date.now() / 1000));
}

/**
 * "Quote": the order's figures, each in the sale's currency and in sats (at the
 * order's rate), locked until its deadline, then "Sell": the passkey, the payment, the panel
 * held meanwhile (`lock`). Paid, the sale sold takes its place.
 */
export function QuotePage({ quote }: { quote: SaleQuote }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { flow, replace, lock, draft, setDraft, onSold } = useSellNav();
  const { languageTag } = usePos();
  const { order, account, sats, payment } = quote;
  const left = useSecondsLeft(order.expiresAt);
  const [paying, setPaying] = useState(false);
  const [renewing, setRenewing] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const over = expired || left === 0;
  const currency = order.destCurrency;
  const { rate } = order;
  const received =
    receivedText(order.destAmount, currency, quote.transferFeeMinor, languageTag) ?? "—";
  const fees = order.estimate
    ? feeTexts(
        order.estimate.fees,
        { currency, sourceCurrency: order.sourceCurrency, rate },
        languageTag
      )
    : null;
  const price =
    rate === null ? null : `${formatInteger(btcPriceOf(rate), languageTag)} ${currency}`;
  const worth = (value: bigint, rounding: "down" | "up") =>
    rate === null ? null : satsAtRate(value, rate, currency, languageTag, rounding);

  const sell = async () => {
    setPaying(true);
    setFailed(null);
    lock(true);
    try {
      const outcome = await flow.paySale(quote);
      if (outcome === "paid") {
        setDraft({ ...draft, text: "" });
        onSold();
        replace({ name: "sold", quote, paidAt: Date.now() });
        return;
      }
      if (outcome === "expired") setExpired(true);
    } catch (error) {
      logFailure("Paying a sale failed", error);
      setFailed(salePaymentFailureText(t, error));
    } finally {
      lock(false);
      setPaying(false);
    }
  };

  // The rate over: a new order for the same sats and account, in this one's place.
  const renew = async () => {
    setRenewing(true);
    setFailed(null);
    try {
      const result = await flow.quoteSale(sats, account, { deferred: quote.deferred });
      if (result.ok) replace({ name: "quote", quote: result.quote });
      else setFailed(quoteIssueText(t, result.issue));
    } catch (error) {
      logFailure("Quoting a sale failed", error, false);
      setFailed(t("sell.failures.server"));
    } finally {
      setRenewing(false);
    }
  };

  return (
    <SellBody
      footer={
        over ? (
          <Button
            icon="arrows-rotate"
            loading={renewing}
            onPress={() => void renew()}
            testID="sell-quote-renew"
          >
            {t("sell.quote.refresh")}
          </Button>
        ) : (
          // Back to the amount: the header's arrow (no second button for it), hidden while the
          // sale is paid.
          <Button
            icon="fingerprint"
            loading={paying}
            onPress={() => void sell()}
            testID="sell-confirm"
          >
            {t("sell.quote.sell", { amount: satsText(sats, languageTag) })}
          </Button>
        )
      }
      testID="sell-quote-view"
    >
      <View>
        <ScreenTitle>{t("sell.quote.heading", { amount: received })}</ScreenTitle>
        <Lead>{t("sell.quote.lead")}</Lead>
      </View>
      <Rows
        rows={[
          {
            label: t("sell.quote.selling"),
            value: <Dual fiat={worth(sats, "down")} sats={satsText(sats, languageTag)} />,
            testID: "sell-quote-selling"
          },
          ...(price
            ? [{ label: t("sell.quote.rate"), value: t("sell.quote.ratePrice", { price }) }]
            : []),
          ...(fees && (fees.fiat !== null || fees.sats !== null)
            ? [{ label: t("sell.quote.fee"), value: <Dual fiat={fees.fiat} sats={fees.sats} /> }]
            : []),
          {
            label: t("sell.sale.transferFee"),
            // A deferred sell: none of its own, as on the sale ("—").
            value: quote.deferred ? "—" : fiatText(quote.transferFeeMinor, currency, languageTag),
            testID: "sell-quote-transfer-fee"
          },
          {
            label: t("sell.quote.lightningFee"),
            value: (
              <Dual
                fiat={worth(payment.feeSats, "up")}
                sats={satsText(payment.feeSats, languageTag)}
              />
            ),
            testID: "sell-quote-lightning-fee"
          },
          // A deferred sale names no account: it is wired later,
          // to the account as it is then.
          ...(quote.deferred
            ? []
            : [
                {
                  label: t("sell.quote.account"),
                  value: `${ownerNameText(account.owner.name)} · ${maskedIban(account.iban)}`
                }
              ]),
          {
            label: t("sell.sale.transfer"),
            value: t(quote.deferred ? "sell.sale.transferLater" : "sell.sale.transferNow"),
            testID: "sell-quote-transfer"
          }
        ]}
      />
      {quote.deferred ? <DeferredNote currency={quote.order.destCurrency} /> : null}
      {over ? (
        <Callout tone="warning" testID="sell-quote-expired">
          {t("sell.quote.expired")}
        </Callout>
      ) : (
        <View style={styles.limitsLine}>
          <Icon name="clock-regular" size={15} color={colors.text.accent} />
          <Text style={styles.locked} testID="sell-quote-locked">
            {t("sell.quote.lockedUntil", { time: timeText(order.expiresAt, languageTag) })}
          </Text>
          <Text style={styles.clock}>{formatClock(left)}</Text>
        </View>
      )}
      {failed ? <ErrorMessage testID="sell-pay-failed">{failed}</ErrorMessage> : null}
    </SellBody>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  amount: { gap: 8 },
  // The estimate's lines, and why its "You receive about" stops the sale, right under it.
  estimate: { gap: 4 },
  amountSub: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 4,
    minHeight: 18
  },
  caption: {
    ...sans(500),
    flexShrink: 1,
    fontSize: type.caption,
    color: colors.text.secondary,
    fontVariant: ["tabular-nums"]
  },
  accountRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 64,
    paddingVertical: 10
  },
  divided: { borderTopWidth: 1, borderTopColor: colors.border.subtle },
  accountTexts: { flex: 1, gap: 3 },
  accountName: { ...sans(600), fontSize: 15, color: colors.text.primary },
  change: { ...sans(700), fontSize: 13.5, color: colors.text.accent },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: colors.border.subtle,
    backgroundColor: colors.background.surface
  },
  radioOn: { borderWidth: 6, borderColor: palette.orange },
  choice: { gap: 8 },
  choiceLabel: { ...sans(700), paddingHorizontal: 4, fontSize: 13.5, color: colors.text.secondary },
  limits: { gap: 12 },
  optionTop: { alignItems: "flex-start" },
  pending: { gap: 6, marginTop: 8 },
  pendingLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: 12
  },
  pendingTitle: { ...sans(600), fontSize: type.caption, color: colors.text.primary },
  pendingFigure: {
    ...mono(500),
    flexShrink: 1,
    textAlign: "right",
    fontSize: 12,
    color: colors.text.primary
  },
  track: {
    flexDirection: "row",
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.background.subtle,
    overflow: "hidden"
  },
  trackHeld: { backgroundColor: colors.text.primary },
  trackSale: { backgroundColor: palette.orange },
  legend: { flexDirection: "row", flexWrap: "wrap", columnGap: 12, rowGap: 4 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  swatch: { width: 8, height: 8, borderRadius: 2 },
  legendText: { ...sans(500), fontSize: 11.5, color: colors.text.secondary },
  meter: { gap: 6 },
  meterLabel: { ...sans(500), fontSize: type.caption, color: colors.text.secondary },
  meterFigure: {
    ...sans(600),
    flexShrink: 1,
    textAlign: "right",
    fontSize: type.caption,
    color: colors.text.primary,
    fontVariant: ["tabular-nums"]
  },
  limitsLine: { flexDirection: "row", alignItems: "center", gap: 8 },
  limitsLink: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start"
  },
  link: { ...sans(700), fontSize: 13.5, color: colors.text.accent },
  locked: { ...sans(600), flex: 1, fontSize: 13.5, color: colors.text.accent },
  clock: { ...mono(700), fontSize: 13.5, color: colors.text.primary }
}));
