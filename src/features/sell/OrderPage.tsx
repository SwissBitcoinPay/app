import type { TFunction } from "i18next";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AppState, Text, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { Lead, ScreenTitle } from "@/components/ui/Heading";
import { Icon } from "@/components/ui/Icon";
import { StatusPill } from "@/components/ui/StatusPill";
import { MTPELERIN_POLL_MS } from "@/config/mtpelerin";
import { usePos } from "@/features/terminal/pos";
import { formatDate } from "@/lib/locale/date";
import { logFailure } from "@/lib/log/log";
import { maskedIban, ownerNameText } from "@/lib/mtpelerin/accounts";
import { decimalToInteger } from "@/lib/mtpelerin/decimal";
import { periodStarts } from "@/lib/mtpelerin/limits";
import {
  isSellCurrency,
  saleProgress,
  transferRoute,
  type SaleOutcome,
  type SalePayment,
  type SaleProgress,
  type SaleStep
} from "@/lib/mtpelerin/sale";
import type { MtpBankAccount, MtpOrder, MtpTransactionStatus } from "@/lib/mtpelerin/types";
import { makeStyles, sans, type, useTheme, type PaymentState } from "@/theme";

import type { SaleQuote } from "./flow";
import {
  DeferredNote,
  Mono,
  SellBody,
  Waiting,
  busyText,
  decimalText,
  receivedText,
  satsText,
  transferThresholdText
} from "./parts";
import { useSellNav } from "./SellSheet";

/*
 * A sale's progress (its status as Mt Pelerin tells it),
 * a page of "Sell"'s panel. Just paid (`sold`): "Sold successfully", what Mt Pelerin wires,
 * then what comes next: the sats received by Mt Pelerin (the payment's preimage proves it), its
 * processing (Mt Pelerin converts them as they arrive), the transfer to the account and its usual
 * delay (Mt Pelerin's delivery times: a CHF transfer within a business day, a SEPA one within
 * one or two, a SWIFT one in one or more). Opened from "Your sales": the same steps under the
 * sale's state; while Mt Pelerin tells no funds of it, the wallet's payment of its invoice tells
 * the sats sent or on their way (saleProgress). Read again every MTPELERIN_POLL_MS and when the app
 * comes back to the front, until it ends (wired, refunded, refused, or its rate over without
 * funds). A delay or a hold is no failure: what Mt Pelerin asks is said.
 */

/** The pill of each outcome (the payments' states). */
export const OUTCOME_PILL: Record<SaleOutcome, PaymentState> = {
  awaitingPayment: "open",
  expired: "expired",
  inProgress: "open",
  delayed: "underpaid",
  held: "underpaid",
  sent: "settled",
  refunded: "canceled",
  failed: "canceled"
};

const FINAL: readonly SaleOutcome[] = ["sent", "refunded", "failed", "expired"];

/** What "Sold successfully" no longer says: the sale did not go through. */
const UNSOLD: readonly SaleOutcome[] = ["refunded", "failed", "expired"];

export function OrderPage({
  orderId,
  fromMs,
  sold
}: {
  orderId: string;
  /**
   * When the sale was made (Unix ms), as "Wallet" knows it: its order is looked for since
   * then, a sale of last year included. Absent: this year's ("Your sales" lists them).
   */
  fromMs?: number;
  /** The sale just paid, from its quote; null for one of "Your sales". */
  sold: { quote: SaleQuote; paidAt: number } | null;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { flow, close, push } = useSellNav();
  const { languageTag } = usePos();
  // The order (its amounts, its date), read by its id until Mt Pelerin lists it: a sale just
  // paid may not be listed yet. Never the whole year's orders for one.
  const [order, setOrder] = useState<MtpOrder | null>(null);
  const [orderFailed, setOrderFailed] = useState(false);
  // The status's answer, and when it came (Unix seconds): what its rate's end is told at.
  const [status, setStatus] = useState<{ read: MtpTransactionStatus; at: number } | null>(null);
  const [failed, setFailed] = useState(false);
  // One of "Your sales": the wallet's payment of its invoice (null: none), once read. A sale just
  // paid has its payment's own answer (`sold`).
  const [wallet, setWallet] = useState<{ payment: SalePayment | null } | null>(null);

  useEffect(() => {
    if (order !== null) return;
    let live = true;
    const readOrder = () =>
      flow.order(orderId, fromMs ?? periodStarts(new Date()).year * 1000).then(
        (found) => {
          if (!live) return;
          setOrder(found);
          setOrderFailed(false);
        },
        (error: unknown) => {
          logFailure("Reading a sale failed", error, false);
          if (live) setOrderFailed(true);
        }
      );
    void readOrder();
    const timer = setInterval(() => void readOrder(), MTPELERIN_POLL_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [flow, orderId, order, fromMs]);

  const expiresAt = order?.expiresAt ?? sold?.quote.order.expiresAt ?? null;
  // Not told before the wallet answered: a sale it paid is never "awaiting payment" meanwhile.
  const walletPayment = sold ? null : wallet === null ? undefined : wallet.payment;
  const progress =
    status === null || walletPayment === undefined
      ? null
      : saleProgress(status.read, { expiresAt, nowSeconds: status.at, walletPayment });
  const final = progress !== null && FINAL.includes(progress.outcome);
  const walletSent = wallet?.payment === "completed";

  useEffect(() => {
    // Sent: it stays so. Its order read once (its invoice's payment hash).
    if (sold || order === null || final || walletSent) return;
    let live = true;
    const readWallet = () =>
      flow.walletPayments([order]).then(
        (sent) => {
          if (!live) return;
          setWallet({
            payment: order.paymentHash === null ? null : (sent.get(order.paymentHash) ?? null)
          });
        },
        (error: unknown) => {
          // Unread: the sale as Mt Pelerin tells it, read again at the next poll.
          logFailure("Reading the wallet's payment of a sale failed", error, false);
          if (live) setWallet((known) => known ?? { payment: null });
        }
      );
    void readWallet();
    const timer = setInterval(() => void readWallet(), MTPELERIN_POLL_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [flow, sold, order, final, walletSent]);

  useEffect(() => {
    if (final) return;
    let live = true;
    const readStatus = () =>
      flow.transactionStatus(orderId).then(
        (next) => {
          if (!live) return;
          setStatus({ read: next, at: Math.floor(Date.now() / 1000) });
          setFailed(false);
        },
        (error: unknown) => {
          logFailure("Reading a sale's progress failed", error, false);
          if (live) setFailed(true);
        }
      );
    void readStatus();
    const timer = setInterval(() => void readStatus(), MTPELERIN_POLL_MS);
    const appState = AppState.addEventListener("change", (next) => {
      if (next === "active") void readStatus();
    });
    return () => {
      live = false;
      clearInterval(timer);
      appState.remove();
    };
  }, [flow, orderId, final]);

  const currency =
    sold?.quote.order.destCurrency ?? order?.destCurrency ?? status?.read.destCurrency ?? null;
  const destAmount = order?.destAmount ?? null;
  // Just paid: what the merchant receives, Mt Pelerin's transfer fee taken, as its quote said.
  const amount = sold
    ? receivedText(
        sold.quote.order.destAmount,
        sold.quote.order.destCurrency,
        sold.quote.transferFeeMinor,
        languageTag
      )
    : destAmount && currency
      ? decimalText(destAmount, currency, languageTag, "down")
      : null;
  // The account wired to: the quote's, or the order's beneficiary among the accounts read.
  const account =
    sold?.quote.account ??
    flow.bankAccounts()?.find((entry) => entry.id === order?.beneficiaryId) ??
    null;
  const shortId = sold?.quote.order.shortId ?? order?.shortId ?? null;
  const footer = sold ? (
    <>
      <Button onPress={close} testID="sell-order-done">
        {t("sell.order.close")}
      </Button>
      <Button variant="text" onPress={() => push({ name: "history" })} testID="sell-order-history">
        {t("sell.order.seeSales")}
      </Button>
    </>
  ) : null;

  // Just paid: its figures are the quote's, shown at once; Mt Pelerin's answers fill the steps.
  if (sold && amount !== null && (progress === null || !UNSOLD.includes(progress.outcome))) {
    return (
      <SellBody footer={footer} testID="sell-order">
        <View style={styles.hero}>
          <View style={styles.heroBadge}>
            <Icon name="check" size={32} color={colors.success.fg} />
          </View>
          <ScreenTitle style={styles.centred}>{t("sell.order.soldTitle")}</ScreenTitle>
          <Lead style={styles.centred}>
            {t(sold.quote.deferred ? "sell.split.soldLead" : "sell.order.soldLead", {
              sats: satsText(sold.quote.sats, languageTag),
              amount
            })}
          </Lead>
        </View>
        <Timeline
          progress={progress}
          paid
          receivedAt={Math.floor(sold.paidAt / 1000)}
          account={account}
          currency={currency}
          deferred={sold.quote.deferred}
        />
        {sold.quote.deferred ? <DeferredNote currency={sold.quote.order.destCurrency} /> : null}
        <Reference shortId={shortId} />
      </SellBody>
    );
  }

  if (progress === null || order === null || amount === null) {
    return (
      <SellBody footer={footer} testID="sell-order">
        {failed || orderFailed ? (
          <Text style={styles.hint} testID="sell-order-unread">
            {t("sell.failures.offline")}
          </Text>
        ) : (
          <Waiting label={busyText(t, "reading")} />
        )}
      </SellBody>
    );
  }

  // Mt Pelerin's `source_amount` is computed back from the francs (9993.077… for 10 000 sats):
  // shown only when it is a whole number of sats, never rounded to one.
  const sats = decimalToInteger(order.sourceAmount);
  return (
    <SellBody footer={footer} testID="sell-order">
      <View>
        <View style={styles.pill}>
          <StatusPill
            state={OUTCOME_PILL[progress.outcome]}
            label={t(`sell.order.outcomes.${progress.outcome}`)}
            size="sm"
          />
        </View>
        <ScreenTitle>{t("sell.order.heading", { amount })}</ScreenTitle>
        <Lead>
          {sats === null
            ? t("sell.order.leadDated", { date: dateText(order.createdAt, languageTag) })
            : t("sell.order.lead", {
                sats: satsText(sats, languageTag),
                date: dateText(order.createdAt, languageTag)
              })}
        </Lead>
      </View>
      <Timeline
        progress={progress}
        paid={false}
        receivedAt={null}
        account={account}
        currency={currency}
        deferred={order.type === "spot"}
      />
      {/* A deferred sell (`type: "spot"`, the split's sale): wired with the others. */}
      {order.type === "spot" ? <DeferredNote currency={order.destCurrency} /> : null}
      <Reference shortId={shortId} />
    </SellBody>
  );
}

/** "26 October, 18:16". */
function dateText(seconds: number, languageTag: string): string {
  return formatDate(new Date(seconds * 1000), languageTag, {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit"
  });
}

/** The usual delay of a transfer in `currency` (Mt Pelerin's delivery times, transferRoute). */
function delayText(t: TFunction, currency: string | null): string | null {
  // A currency the app does not wire to (a sale made elsewhere): no delay it does not know.
  if (currency === null || !isSellCurrency(currency)) return null;
  switch (transferRoute(currency)) {
    case "swiss":
      return t("sell.order.delayChf");
    case "sepa":
      return t("sell.order.delayEur");
    case "swift":
      return t("sell.order.delaySwift");
  }
}

/** What the transfer's step says of an outcome that is not the usual course; null for that. */
function outcomeHint(outcome: SaleOutcome, t: TFunction): string | null {
  switch (outcome) {
    case "held":
      return t("sell.order.held");
    case "delayed":
      return t("sell.order.delayed");
    case "refunded":
      return t("sell.order.refunded");
    case "failed":
      return t("sell.order.failed");
    case "expired":
      return t("sell.order.expired");
    default:
      return null;
  }
}

/**
 * "What happens next": the sats received, their processing, the transfer. A sale just
 * paid has its sats received (its payment's preimage) and their processing begun, whatever Mt
 * Pelerin answered yet.
 */
function Timeline({
  progress,
  paid,
  receivedAt,
  account,
  currency,
  deferred
}: {
  progress: SaleProgress | null;
  paid: boolean;
  /** Unix seconds: when the sats left, for a sale just paid. */
  receivedAt: number | null;
  account: MtpBankAccount | null;
  currency: string | null;
  /** A deferred sell: wired with the account's others, not after its usual delay. */
  deferred: boolean;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  const { languageTag } = usePos();
  const received: SaleStep = paid ? "done" : (progress?.received ?? "todo");
  const converted: SaleStep =
    progress?.converted === "done" || progress?.converted === "failed"
      ? progress.converted
      : received === "done"
        ? "now"
        : "todo";
  const transferred: SaleStep = progress?.transferred ?? "todo";
  const hint = progress ? outcomeHint(progress.outcome, t) : null;
  // A deferred sale names no account: it is wired later, with the
  // account's others, to the account as it is then.
  const accountLine =
    account && !deferred
      ? `${ownerNameText(account.owner.name)} · ${maskedIban(account.iban)}`
      : null;
  const transferSub = [
    accountLine,
    hint ??
      (transferred === "done"
        ? null
        : deferred
          ? t("sell.order.withOthers", {
              threshold: transferThresholdText(t, currency ?? "", languageTag)
            })
          : delayText(t, currency))
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
  return (
    <View style={styles.timeline}>
      <Text style={styles.label}>{t("sell.order.next")}</Text>
      <View testID="sell-order-steps">
        <TimelineStep
          state={received}
          // Never "received" before they are.
          title={t(RECEIVED_TITLES[received])}
          sub={receivedAt === null ? null : dateText(receivedAt, languageTag)}
        />
        <TimelineStep
          state={converted}
          title={t("sell.order.processing")}
          sub={
            converted === "done"
              ? t("sell.order.processed", { currency: currency ?? "" })
              : converted === "now"
                ? t("sell.order.processingNow")
                : null
          }
        />
        <TimelineStep
          state={transferred}
          title={t("sell.order.transferred")}
          sub={transferSub === "" ? null : transferSub}
          last
        />
      </View>
    </View>
  );
}

/** The sats' step, by its state: what it will be, is, was, or was not. */
const RECEIVED_TITLES = {
  todo: "sell.order.receivedTodo",
  now: "sell.order.receivedNow",
  done: "sell.order.received",
  failed: "sell.order.receivedFailed"
} as const satisfies Record<SaleStep, string>;

function TimelineStep({
  state,
  title,
  sub,
  last = false
}: {
  state: SaleStep;
  title: string;
  sub: string | null;
  last?: boolean;
}) {
  const styles = useStyles();
  return (
    <View style={styles.step} accessibilityLabel={sub ? `${title}, ${sub}` : title}>
      <View style={styles.rail}>
        <Dot state={state} />
        {last ? null : <View style={[styles.line, state === "done" && styles.lineDone]} />}
      </View>
      <View style={[styles.stepTexts, !last && styles.stepGap]}>
        <Text style={[styles.stepTitle, state === "todo" && styles.todo]}>{title}</Text>
        {sub ? <Text style={styles.hint}>{sub}</Text> : null}
      </View>
    </View>
  );
}

/** A step's mark: done (a check), now (a clock), failed (a cross), to come (a ring). */
function Dot({ state }: { state: SaleStep }) {
  const styles = useStyles();
  const { colors } = useTheme();
  switch (state) {
    case "done":
      return (
        <View style={[styles.dot, styles.dotDone]}>
          <Icon name="check" size={14} color={colors.success.fg} />
        </View>
      );
    case "now":
      return (
        <View style={[styles.dot, styles.dotNow]}>
          <Icon name="clock-regular" size={14} color={colors.text.accent} />
        </View>
      );
    case "failed":
      return (
        <View style={[styles.dot, styles.dotFailed]}>
          <Icon name="xmark" size={14} color={colors.danger.fg} />
        </View>
      );
    case "todo":
      return <View style={[styles.dot, styles.dotTodo]} />;
  }
}

function Reference({ shortId }: { shortId: string | null }) {
  const styles = useStyles();
  const { t } = useTranslation();
  if (shortId === null) return null;
  return (
    <View style={styles.reference}>
      <Text style={styles.hint}>{t("sell.order.reference")}</Text>
      <Mono>{shortId}</Mono>
    </View>
  );
}

const DOT = 28;

const useStyles = makeStyles(({ colors }) => ({
  hero: { alignItems: "center", gap: 4, marginTop: 6 },
  heroBadge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.success.bg
  },
  centred: { textAlign: "center" },
  pill: { flexDirection: "row" },
  timeline: { gap: 12 },
  label: { ...sans(600), fontSize: type.fieldLabel, color: colors.text.secondary },
  step: { flexDirection: "row", gap: 14 },
  rail: { alignItems: "center" },
  line: {
    flex: 1,
    width: 2,
    minHeight: 18,
    marginVertical: 4,
    backgroundColor: colors.border.subtle
  },
  lineDone: { backgroundColor: colors.success.fg },
  dot: {
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    alignItems: "center",
    justifyContent: "center"
  },
  dotDone: { backgroundColor: colors.success.bg },
  dotNow: { backgroundColor: colors.background.subtle },
  dotFailed: { backgroundColor: colors.danger.bg },
  dotTodo: { borderWidth: 2, borderColor: colors.border.subtle },
  stepTexts: { flex: 1, gap: 3, paddingTop: 4 },
  stepGap: { paddingBottom: 16 },
  stepTitle: { ...sans(700), fontSize: 15, color: colors.text.primary },
  todo: { color: colors.text.secondary },
  hint: { ...sans(500), fontSize: 12.5, lineHeight: 18, color: colors.text.secondary },
  reference: {
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
    flexDirection: "row",
    justifyContent: "space-between"
  }
}));
