import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, Text, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { formatClock } from "@/components/ui/Countdown";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { openExternal } from "@/components/ui/external-link";
import { Lead, ScreenTitle } from "@/components/ui/Heading";
import { Icon } from "@/components/ui/Icon";
import { Sheet } from "@/components/ui/Sheet";
import { MTPELERIN_IDENTITY_URL, SELL_LIMITS_CHF_MINOR } from "@/config/mtpelerin";
import { useAccountSettings } from "@/features/settings/useAccountSettings";
import { usePos } from "@/features/terminal/pos";
import { readWalletPayments } from "@/features/wallet/payments-history";
import { holdActivity } from "@/lib/activity";
import { formatDate } from "@/lib/locale/date";
import { formatPercent } from "@/lib/locale/format";
import { logFailure } from "@/lib/log/log";
import { decimalToMinor } from "@/lib/mtpelerin/decimal";
import { INVOICE_MIN_LIFE_SECONDS } from "@/lib/mtpelerin/invoice";
import { payoutProgress } from "@/lib/mtpelerin/payout";
import { heldMinor } from "@/lib/mtpelerin/transfer-fee";
import type { MtpBalances } from "@/lib/mtpelerin/types";
import { currencyDigits } from "@/lib/terminal/amount";
import { ownerProfile } from "@/lib/terminal/model";
import {
  AMOUNT_EM,
  makeStyles,
  mono,
  radius,
  sans,
  stroke,
  tracking,
  type,
  useTheme
} from "@/theme";

import { accountSellFlow } from "./account-flow";
import type { SaleQuote, SellFlow } from "./flow";
import {
  DeferredNote,
  Rows,
  SellBody,
  Waiting,
  decimalText,
  feeTexts,
  fiatText,
  salePaymentFailureText,
  satsAtRate,
  satsText,
  timeText
} from "./parts";
import { quoteIssueText, saleAccount, useSecondsLeft } from "./SalePage";
import { quoteSplitSale, readSplitOffer, type SplitOffer, type SplitRead } from "./split-offer";
import { PayoutGauge, SplitShare } from "./SplitShare";

/*
 * The split's sale, in "Wallet" (a semi-automatic sale, split-offer.ts): once the wallet's data
 * shows, what the split proposes is
 * read, told in a notice under the balance, and its panel opens by itself, once for the receipts
 * it counts: what the wallet received since the last such sale, and the share to sell. As it opens,
 * the panel makes the sale's order at Mt Pelerin: its rate locked
 * 60 minutes, its figures shown as they are, and "Sell" pays it, the passkey asked as
 * for any payment (confirmAccountPasskey). Once its rate's lock is over, "Refresh the quote"
 * makes another. An order the merchant does not pay sells nothing and lapses; closed and opened
 * again while its rate is locked, the panel shows the same one. The notice tells Mt Pelerin's
 * estimate ("about"), before any order.
 *
 * Less than the share is proposed with its reason: the balance, or Mt Pelerin's limits without an
 * identity verification, where the merchant may be identified first (Mt Pelerin's own pages,
 * MTPELERIN_IDENTITY_URL). A split whose sale was never set up (no Mt Pelerin session) is told
 * too: "Set up selling" opens "Sell".
 *
 * Closed without a sale, the panel does not open by itself again for the same receipts (this run
 * of the app); the notice stays. "Sell"'s parts (parts.tsx)
 * in a panel of its own, a Callout and a secondary button as the wallet's other notices.
 */

/** What the notice and the panel show. */
type Shown =
  | SplitRead
  | { kind: "setup"; fiatPercent: number; currency: string }
  | { kind: "unread" }
  /** Not read (Mt Pelerin or the wallet unreachable): nothing proposed, the share not known. */
  | { kind: "failed" };

type Phase =
  | { name: "idle" }
  /** The passkey asked, the payment sent. */
  | { name: "selling" }
  | { name: "sold"; quote: SaleQuote; held: MtpBalances | null };

/**
 * The order made for an offer as the panel opened (quoteSplitSale): `key` names the receipts and
 * the account it is of (offerKey), `quote` is null when Mt Pelerin's order was refused (`issue`).
 * `over`: its rate no longer locked for a payment (paySale said so).
 */
type Quoted = {
  key: string;
  quote: SaleQuote | null;
  issue: string | null;
  over: boolean;
};

/** What an order is of: the receipts it counts (their checkpoint) and the bank account. */
function offerKey(offer: SplitOffer): string {
  return `${offer.due.checkpoint}:${offer.account.id}`;
}

/**
 * Whether `quoted` is still `offer`'s: of the same receipts and account, and, made, for no more
 * sats than the offer allows now. The offer's sats move with a live rate where the limits cap it
 * (split-offer.ts `satsWithin`): an order a few sats smaller stays, sold as it is, rather than
 * another made at each reading; one for more than the limits or the balance now leave does not.
 */
function isQuoteOf(quoted: Quoted, offer: SplitOffer): boolean {
  return (
    quoted.key === offerKey(offer) && (quoted.quote === null || quoted.quote.sats <= offer.sats)
  );
}

/** Whether `quote`'s rate is still locked for a payment (as checkSellOrder reads it). */
function stillLocked(quote: SaleQuote): boolean {
  return quote.order.expiresAt - Math.floor(Date.now() / 1000) >= INVOICE_MIN_LIFE_SECONDS;
}

/**
 * The receipts a panel closed without a sale counted, by account (their checkpoint): not opened by
 * itself again for them while the app runs.
 */
const dismissed = new Map<string, number>();

/** For the tests: as a new run of the app. */
export function resetSplitSale(): void {
  dismissed.clear();
}

export function useSplitSale({
  enabled,
  openWallet,
  onSold,
  openSell
}: {
  /** Once the wallet's data shows, synced: nothing is read before. */
  enabled: boolean;
  /** "Wallet"'s connection of the account's wallet, which pays Mt Pelerin. */
  openWallet: () => Promise<void>;
  /** A sale sent: "Wallet" reads its balance again. */
  onSold: () => void;
  /** Opens "Sell"'s panel (the sale's steps to set up). */
  openSell: () => void;
}): {
  notice: ReactNode | null;
  sheet: ReactNode;
  /**
   * The split's share of the receipts still to sell, in sats, once read: 0 when nothing is due,
   * null while unread or not known (no sale set up, Mt Pelerin unreachable). The check of the
   * recovery phrase counts the wallet's balance less it (WalletScreen.tsx, holdings.ts).
   */
  dueSats: bigint | null;
} {
  const { t, i18n } = useTranslation();
  const { profile, languageTag } = usePos();
  const owner = ownerProfile(profile);
  const walletId = owner?.walletId ?? null;
  const settings = useAccountSettings();
  const [shown, setShown] = useState<Shown>({ kind: "unread" });
  const [flow, setFlow] = useState<SellFlow | null>(null);
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>({ name: "idle" });
  const [issue, setIssue] = useState<string | null>(null);
  const [quoted, setQuoted] = useState<Quoted | null>(null);
  // What Mt Pelerin holds for the offer's account from its deferred sells, read as the panel
  // opens: the next transfer's gauge. Never 0 before it is read.
  const [deferredHeld, setDeferredHeld] = useState<{
    accountId: string;
    minor: number | "failed";
  } | null>(null);
  // The order being made, and for what (offerKey and sats): awaited again rather than made twice.
  const making = useRef<{ id: string; made: Promise<Quoted> } | null>(null);
  // Read again after a sale, and once its panel closed.
  const [reads, setReads] = useState(0);

  const fiatPercent = settings && settings.signUp === "done" ? 100 - settings.bitcoinPercent : 0;
  const splitSince = settings?.splitSince ?? 0;
  const transfers = settings?.legacyTransfers.join(",") ?? "";
  const payoutCurrency = settings?.payoutCurrency ?? "";
  const language = i18n.language;

  useEffect(() => {
    if (!enabled || walletId === null || fiatPercent <= 0) return;
    const made = accountSellFlow({ owner, language, openWallet });
    if (!made) return;
    let live = true;
    void (async () => {
      try {
        await made.start();
        if (!live) return;
        const { view } = made.getState();
        if (view.name === "phone" || view.name === "connect") {
          // No session of Mt Pelerin's: the sale was never set up for this account.
          setShown({ kind: "setup", fiatPercent, currency: payoutCurrency });
          return;
        }
        if (view.name !== "ready") {
          setShown({ kind: "failed" });
          return;
        }
        const read = await readSplitOffer({
          flow: made,
          person: view.ready.person,
          account: saleAccount(view.ready, null),
          settings: {
            bitcoinPercent: 100 - fiatPercent,
            splitSince,
            legacyTransfers: transfers === "" ? [] : transfers.split(",")
          },
          readPayments: readWalletPayments,
          nowMs: Date.now
        });
        if (!live) return;
        setFlow(made);
        setShown(read);
        if (read.kind === "none") return;
        const checkpoint = read.kind === "offer" ? read.offer.due.checkpoint : read.due.checkpoint;
        if (dismissed.get(walletId) !== checkpoint) setOpen(true);
      } catch (error) {
        // Not read: nothing is proposed, never a share guessed. The next visit reads again.
        logFailure("Reading the split's sale failed", error, false);
        if (live) setShown({ kind: "failed" });
      }
    })();
    return () => {
      live = false;
      made.close();
    };
    // `owner` and `openWallet` are the screen's, new at each render: the account (`walletId`) is
    // what they stand for here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, walletId, fiatPercent, splitSince, transfers, payoutCurrency, language, reads]);

  const offer = shown.kind === "offer" ? shown.offer : null;
  const key = offer === null ? null : offerKey(offer);

  /**
   * `wanted`'s order made at Mt Pelerin (its rate locked) by `made`, or why it was not; the one
   * being made for the same offer when there is one (never two at once). Sets nothing: its caller
   * keeps it.
   */
  const orderFor = (wanted: SplitOffer, made: SellFlow): Promise<Quoted> => {
    const wantedKey = offerKey(wanted);
    const id = `${wantedKey}:${wanted.sats}`;
    if (making.current?.id === id) return making.current.made;
    const order = (async (): Promise<Quoted> => {
      try {
        const read = await quoteSplitSale(made, wanted);
        return read.ok
          ? { key: wantedKey, quote: read.quote, issue: null, over: false }
          : { key: wantedKey, quote: null, issue: quoteIssueText(t, read.issue), over: false };
      } catch (error) {
        logFailure("Quoting the split's sale failed", error, false);
        return { key: wantedKey, quote: null, issue: t("sell.failures.server"), over: false };
      }
    })();
    making.current = { id, made: order };
    void order.finally(() => {
      if (making.current?.made === order) making.current = null;
    });
    return order;
  };

  // The order shown: the one made for this offer (isQuoteOf), whether still locked, over or
  // refused. Another is made only when there is none: as the panel opens, after "Refresh the
  // quote" or "Try again" (`renew`), never by itself while the panel shows one: another amount
  // is never put under the merchant's finger unasked.
  const current = offer !== null && quoted !== null && isQuoteOf(quoted, offer) ? quoted : null;
  const needsOrder =
    open && flow !== null && offer !== null && phase.name === "idle" && current === null;
  useEffect(() => {
    if (!needsOrder || flow === null || offer === null) return;
    // The answer for an offer no longer shown (read again, the panel closed) is dropped; opened
    // again for the same, the order still being made is awaited, not made again.
    let live = true;
    void orderFor(offer, flow).then((next) => {
      if (live) setQuoted(next);
    });
    return () => {
      live = false;
    };
    // `offer` is told by `key` and its sats; `orderFor` is this render's.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsOrder, flow, key, offer?.sats]);

  /** "Refresh the quote", "Try again": another order (the effect above), the panel waiting. */
  const renew = () => {
    setQuoted(null);
    setIssue(null);
  };

  // The balance of the offer's account at Mt Pelerin, read at each opening of the panel (a sale
  // made elsewhere since changes it); an answer for another account or opening is dropped.
  const heldAccount = open && flow !== null && phase.name !== "sold" ? offer?.account : undefined;
  const heldAccountId = heldAccount?.id ?? null;
  useEffect(() => {
    if (flow === null || heldAccount === undefined) return;
    let live = true;
    const account = heldAccount;
    flow.balances(account).then(
      (balances) => {
        if (live) {
          setDeferredHeld({
            accountId: account.id,
            minor: heldMinor(balances, account.currency) ?? "failed"
          });
        }
      },
      (error: unknown) => {
        logFailure("Reading the deferred sales' balance failed", error, false);
        if (live) setDeferredHeld({ accountId: account.id, minor: "failed" });
      }
    );
    return () => {
      live = false;
    };
    // `heldAccount` is the offer's, new at each read: its id is what it stands for here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow, heldAccountId]);

  const selling = phase.name === "selling";
  // The auto-lock must not close the account while the passkey is asked or the payment sent: its
  // prompt takes no touch of the app, and the payment's outcome would be lost (as "Sell").
  useEffect(() => {
    if (!selling) return;
    return holdActivity();
  }, [selling]);

  if (!enabled || walletId === null || fiatPercent <= 0) {
    return { notice: null, sheet: null, dueSats: null };
  }

  const close = () => {
    if (selling) return;
    setOpen(false);
    setIssue(null);
    setDeferredHeld(null);
    if (phase.name === "sold") {
      // Sold: what is left to propose is read again.
      setPhase({ name: "idle" });
      setShown({ kind: "unread" });
      setReads((count) => count + 1);
      return;
    }
    setPhase({ name: "idle" });
    // An order over (or refused) is not shown again: opened again, the panel makes another.
    if (quoted !== null && (quoted.quote === null || quoted.over || !stillLocked(quoted.quote))) {
      setQuoted(null);
    }
    if (shown.kind === "offer") dismissed.set(walletId, shown.offer.due.checkpoint);
    else if (shown.kind === "identify") dismissed.set(walletId, shown.due.checkpoint);
  };

  /** "Sell": the order made as the panel opened, paid, the passkey asked. */
  const pay = async (sale: SaleQuote) => {
    if (!flow) return;
    setPhase({ name: "selling" });
    setIssue(null);
    try {
      const outcome = await flow.paySale(sale);
      if (outcome === "paid") {
        onSold();
        // What Mt Pelerin now holds for the account, when it tells: the sale is told without it.
        const held = await flow.balances(sale.account).catch(() => null);
        setQuoted(null);
        setPhase({ name: "sold", quote: sale, held });
        return;
      }
      // Its rate's lock over (or about to be): "Refresh the quote" makes another order.
      if (outcome === "expired") {
        setQuoted((current) => (current?.quote === sale ? { ...current, over: true } : current));
      }
      // The passkey's prompt dismissed: nothing left, the same order stays.
      setPhase({ name: "idle" });
    } catch (error) {
      logFailure("Paying the split's sale failed", error);
      setIssue(salePaymentFailureText(t, error));
      setPhase({ name: "idle" });
    }
  };

  const identify = () => openExternal(MTPELERIN_IDENTITY_URL);
  const percent = formatPercent(fiatPercent, languageTag);
  const limit = fiatText(SELL_LIMITS_CHF_MINOR.month, "CHF", languageTag);
  const day = (seconds: number) =>
    formatDate(new Date(seconds * 1000), languageTag, { day: "numeric", month: "long" });

  let notice: ReactNode = null;
  if (phase.name !== "sold") {
    if (shown.kind === "offer") {
      const fiat = decimalText(
        shown.offer.estimate.destAmount,
        shown.offer.account.currency,
        languageTag,
        "down"
      );
      notice = (
        <Notice
          text={t("sell.split.notice", {
            amount: satsText(shown.offer.sats, languageTag),
            fiat: fiat ?? "—"
          })}
          action={t("sell.split.noticeSell")}
          onPress={() => setOpen(true)}
        />
      );
    } else if (shown.kind === "identify") {
      notice = (
        <Notice
          text={t("sell.split.noticeIdentify", { due: satsText(shown.due.dueSats, languageTag) })}
          action={t("sell.split.noticeSee")}
          onPress={() => setOpen(true)}
        />
      );
    } else if (shown.kind === "setup") {
      notice = (
        <Notice
          text={t("sell.split.setup", { percent, currency: shown.currency })}
          action={t("sell.split.setupOpen")}
          onPress={openSell}
        />
      );
    }
  }

  let body: ReactNode = null;
  if (phase.name === "sold") {
    const { quote, held } = phase;
    const currency = quote.order.destCurrency;
    const amount = decimalText(quote.order.destAmount, currency, languageTag, "down") ?? "—";
    const waiting = held?.find((entry) => entry.currency === currency) ?? null;
    const heldText =
      waiting === null ? null : decimalText(waiting.total, currency, languageTag, "down");
    body = (
      <SellBody
        footer={
          <Button onPress={close} testID="split-done">
            {t("sell.order.close")}
          </Button>
        }
        testID="split-sold"
      >
        <View>
          <ScreenTitle>{t("sell.split.soldHeading")}</ScreenTitle>
          <Lead>
            {t("sell.split.soldLead", { sats: satsText(quote.sats, languageTag), amount })}
          </Lead>
        </View>
        {heldText !== null ? (
          <Rows rows={[{ label: t("sell.split.held"), value: heldText, testID: "split-held" }]} />
        ) : null}
        <DeferredNote currency={currency} />
      </SellBody>
    );
  } else if (shown.kind === "offer") {
    const { offer: shownOffer } = shown;
    body = (
      <OfferBody
        offer={shownOffer}
        quoted={current}
        quoting={current === null}
        selling={selling}
        issue={issue}
        held={deferredHeld?.accountId === shownOffer.account.id ? deferredHeld.minor : null}
        limit={limit}
        since={day(shownOffer.since)}
        onSell={(sale) => void pay(sale)}
        onRenew={renew}
        onIdentify={identify}
      />
    );
  } else if (shown.kind === "identify") {
    body = (
      <SellBody
        footer={
          <Button icon="arrow-up-right-from-square" onPress={identify} testID="split-identify">
            {t("sell.split.identify")}
          </Button>
        }
        testID="split-identify-first"
      >
        <View>
          <ScreenTitle>{t("sell.split.identifyHeading")}</ScreenTitle>
          <Lead>
            {t("sell.split.identifyLead", {
              due: satsText(shown.due.dueSats, languageTag),
              limit
            })}
          </Lead>
        </View>
        <SplitShare
          due={shown.due}
          fiatPercent={shown.fiatPercent}
          currency={shown.account.currency}
          testID="split-bar"
        />
        <Callout tone="warning">{t("sell.split.identifyHow")}</Callout>
      </SellBody>
    );
  }

  const sheet = (
    <Sheet
      title={t("sell.split.title")}
      closeLabel={t("sell.close")}
      visible={open && body !== null}
      onClose={close}
      dismissible={!selling}
      centered
      dialogWidth={480}
      page={phase.name === "selling" ? "idle" : phase.name}
      testID="split-sheet"
    >
      {body}
    </Sheet>
  );
  const dueSats =
    shown.kind === "offer"
      ? shown.offer.due.dueSats
      : shown.kind === "identify"
        ? shown.due.dueSats
        : shown.kind === "none"
          ? 0n
          : null;
  return { notice, sheet, dueSats };
}

/**
 * The panel's offer: what the wallet
 * received, as the split shares it (SplitShare), then the order made for it as the panel opened
 * (Mt Pelerin's figures, at the rate it locks): what the merchant receives, the fees, the rate's
 * lock, and the next transfer (PayoutGauge, from what Mt Pelerin already holds: `held`).
 * "Sell" pays it. Its rate's lock over, "Refresh the quote" makes another; refused, why,
 * and "Try again".
 */
function OfferBody({
  offer,
  quoted,
  quoting,
  selling,
  issue,
  held,
  limit,
  since,
  onSell,
  onRenew,
  onIdentify
}: {
  offer: SplitOffer;
  quoted: Quoted | null;
  quoting: boolean;
  selling: boolean;
  issue: string | null;
  /** What Mt Pelerin holds for the account's deferred sells: null while read. */
  held: number | "failed" | null;
  limit: string;
  since: string;
  onSell: (sale: SaleQuote) => void;
  onRenew: () => void;
  onIdentify: () => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { languageTag } = usePos();
  const sale = quoted?.quote ?? null;
  const left = useSecondsLeft(sale?.order.expiresAt ?? 0);
  const over = sale !== null && (quoted?.over === true || left <= 0);
  // What is sold: the order's sats once made (isQuoteOf: at most the offer's).
  const amount = satsText(sale?.sats ?? offer.sats, languageTag);
  const identifyButton =
    offer.short === "limit" ? (
      <Button
        variant="secondary"
        icon="arrow-up-right-from-square"
        onPress={onIdentify}
        disabled={selling}
        testID="split-identify"
      >
        {t("sell.split.identify")}
      </Button>
    ) : null;
  const reason =
    offer.short === "limit" ? (
      <Callout tone="warning" testID="split-limit">
        {t("sell.split.limit", { limit, amount })}
      </Callout>
    ) : offer.short === "balance" ? (
      <Callout tone="warning" testID="split-balance">
        {t("sell.split.balance", { amount })}
      </Callout>
    ) : null;
  const lead = (
    <Lead style={styles.lead}>
      {t("sell.split.lead", {
        date: since,
        received: satsText(offer.due.receivedSats, languageTag)
      })}
    </Lead>
  );
  const share = (
    <SplitShare
      due={offer.due}
      fiatPercent={offer.fiatPercent}
      currency={offer.account.currency}
      testID="split-bar"
    />
  );

  if (sale === null) {
    // Its order being made, or refused.
    const refused = !quoting && quoted !== null;
    // No footer while it is made and nothing else to offer: the panel's ✕ closes it.
    return (
      <SellBody
        footer={
          refused || identifyButton !== null ? (
            <>
              {refused ? (
                <Button icon="arrows-rotate" onPress={onRenew} testID="split-retry">
                  {t("sell.retry")}
                </Button>
              ) : null}
              {identifyButton}
            </>
          ) : undefined
        }
        testID="split-offer"
      >
        {lead}
        {share}
        {refused ? (
          <ErrorMessage testID="split-issue">{quoted?.issue ?? ""}</ErrorMessage>
        ) : (
          <Waiting label={t("sell.split.quoting")} testID="split-quoting" />
        )}
        {reason}
      </SellBody>
    );
  }

  const { order, payment } = sale;
  const currency = order.destCurrency;
  const receive = decimalText(order.destAmount, currency, languageTag, "down") ?? "—";
  const fees = order.estimate
    ? feeTexts(
        order.estimate.fees,
        { currency, sourceCurrency: order.sourceCurrency, rate: order.rate },
        languageTag
      )
    : null;
  const worth = (sats: bigint) =>
    order.rate === null ? null : satsAtRate(sats, order.rate, currency, languageTag, "up");
  // What this sale adds to the account's balance at Mt Pelerin (its `dest_amount`).
  const saleMinor = decimalToMinor(order.destAmount, currencyDigits(currency), "down");
  // The gauge once the balance is read, in CHF (payoutProgress); the transfer in words otherwise.
  const gauge =
    typeof held === "number" &&
    saleMinor !== null &&
    payoutProgress(held, saleMinor, currency) !== null ? (
      <PayoutGauge heldMinor={held} saleMinor={saleMinor} currency={currency} />
    ) : (
      <DeferredNote currency={currency} />
    );
  return (
    <SellBody
      footer={
        <>
          {over ? (
            <Button icon="arrows-rotate" loading={quoting} onPress={onRenew} testID="split-renew">
              {t("sell.quote.refresh")}
            </Button>
          ) : (
            <Button
              icon="fingerprint"
              loading={selling}
              onPress={() => onSell(sale)}
              testID="split-sell"
            >
              {t("sell.split.sell", { amount })}
            </Button>
          )}
          {identifyButton}
        </>
      }
      testID="split-offer"
    >
      {lead}
      {share}
      <View style={styles.receive}>
        <View style={styles.receiveTexts}>
          <Text style={styles.receiveLabel}>{t("sell.split.receive")}</Text>
          <Text style={styles.receiveAmount} testID="split-receive">
            {receive}
          </Text>
          {offer.short === null ? null : (
            <Text style={styles.receiveNote} testID="split-now">
              {t("sell.split.sold", { amount })}
            </Text>
          )}
        </View>
      </View>
      <View style={styles.fees}>
        {fees && (fees.fiat !== null || fees.sats !== null) ? (
          <FeeTile
            label={t("sell.quote.fee")}
            fiat={fees.fiat}
            sats={fees.sats}
            testID="split-fee"
          />
        ) : null}
        <FeeTile
          label={t("sell.split.lightningFee")}
          fiat={worth(payment.feeSats)}
          sats={satsText(payment.feeSats, languageTag)}
          testID="split-lightning-fee"
        />
      </View>
      {over ? (
        <Callout tone="warning" testID="split-expired">
          {t("sell.quote.expired")}
        </Callout>
      ) : (
        <View style={styles.locked}>
          <Icon name="clock-regular" size={15} color={colors.text.accent} />
          <Text style={styles.lockedText} testID="split-locked">
            {t("sell.quote.lockedUntil", { time: timeText(order.expiresAt, languageTag) })}
          </Text>
          <Text style={styles.clock}>{formatClock(left)}</Text>
        </View>
      )}
      {reason}
      {gauge}
      {issue ? <ErrorMessage testID="split-issue">{issue}</ErrorMessage> : null}
    </SellBody>
  );
}

/** A fee of the order: in the sale's currency, its sats beside; "—" without either. */
function FeeTile({
  label,
  fiat,
  sats,
  testID
}: {
  label: string;
  fiat: string | null;
  sats: string | null;
  testID: string;
}) {
  const styles = useStyles();
  return (
    <View style={styles.fee} testID={testID}>
      <Text style={styles.feeLabel}>{label}</Text>
      <View style={styles.feeValues}>
        <Text style={styles.feeValue}>{fiat ?? sats ?? "—"}</Text>
        {fiat !== null && sats !== null ? <Text style={styles.feeSats}>{sats}</Text> : null}
      </View>
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  lead: { marginTop: 0 },
  // On the panel's own surface: hairline frames, no second background.
  receive: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderWidth: stroke.control,
    borderColor: colors.border.subtle,
    borderRadius: radius.md
  },
  receiveTexts: { flexShrink: 1, gap: 4 },
  receiveLabel: { ...sans(600), fontSize: type.label, color: colors.text.secondary },
  receiveAmount: {
    ...sans(700),
    fontSize: 32,
    lineHeight: 36,
    letterSpacing: tracking(AMOUNT_EM, 32),
    fontVariant: ["tabular-nums"],
    color: colors.text.primary
  },
  receiveNote: { ...sans(500), fontSize: type.caption, color: colors.text.secondary },
  fees: { flexDirection: "row", gap: 8 },
  fee: {
    flex: 1,
    gap: 4,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: stroke.control,
    borderColor: colors.border.subtle,
    borderRadius: radius.sm
  },
  feeLabel: { ...sans(600), fontSize: type.caption, color: colors.text.secondary },
  feeValues: { flexDirection: "row", alignItems: "baseline", flexWrap: "wrap", columnGap: 6 },
  feeValue: {
    ...sans(700),
    fontSize: 15,
    fontVariant: ["tabular-nums"],
    color: colors.text.primary
  },
  feeSats: { ...mono(500), fontSize: 12, color: colors.text.secondary },
  locked: { flexDirection: "row", alignItems: "center", gap: 8 },
  lockedText: { ...sans(600), flex: 1, fontSize: 13.5, color: colors.text.accent },
  clock: { ...mono(700), fontSize: 13.5, color: colors.text.primary }
}));

/** The wallet's notice of the split's sale: what it says, and the gesture under it. */
function Notice({ text, action, onPress }: { text: string; action: string; onPress: () => void }) {
  return (
    <View style={styles.block} testID="split-notice">
      <Callout tone="success" icon="arrow-right-arrow-left" testID="split-notice-text">
        {text}
      </Callout>
      <Button
        variant="secondary"
        size="sm"
        fullWidth={false}
        icon="arrow-right"
        onPress={onPress}
        testID="split-notice-action"
      >
        {action}
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: 10, alignItems: "flex-start" }
});
